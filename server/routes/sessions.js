const express = require('express')
const db = require('../db')
const { requireAuth } = require('../auth')
const game = require('../game')

const router = express.Router()

router.get('/live/:code', (req, res) => {
  const info = game.liveInfo(req.params.code)
  if (!info) return res.status(404).json({ error: 'Комната не найдена. Проверьте код' })
  res.json(info)
})

router.get('/live/:code/image/:index', (req, res) => {
  const dataUrl = game.questionImage(req.params.code, Number(req.params.index))
  if (!dataUrl) return res.status(404).end()
  const comma = dataUrl.indexOf(',')
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'))
  res.set('Content-Type', mime)
  res.set('Cache-Control', 'private, max-age=3600')
  res.send(Buffer.from(dataUrl.slice(comma + 1), 'base64'))
})

router.get('/me/history', requireAuth, (req, res) => {
  const played = db
    .prepare(
      `SELECT s.id AS sessionId, s.quiz_title AS title, s.status,
              COALESCE(s.finished_at, s.created_at) AS date,
              p.nickname, p.score, p.place, p.correct_count AS correctCount,
              (SELECT COUNT(*) FROM players WHERE session_id = s.id) AS playerCount
       FROM players p JOIN sessions s ON s.id = p.session_id
       WHERE p.user_id = ? AND s.status IN ('finished', 'aborted')
       ORDER BY s.id DESC LIMIT 100`
    )
    .all(req.user.id)
  const hosted = db
    .prepare(
      `SELECT s.id AS sessionId, s.quiz_title AS title, s.status,
              COALESCE(s.finished_at, s.created_at) AS date,
              (SELECT COUNT(*) FROM players WHERE session_id = s.id) AS playerCount,
              (SELECT nickname FROM players WHERE session_id = s.id AND place = 1) AS winner
       FROM sessions s
       WHERE s.host_id = ? AND s.status = 'finished'
       ORDER BY s.id DESC LIMIT 100`
    )
    .all(req.user.id)
  res.json({ played, hosted })
})

router.get('/sessions/:id/results', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(Number(req.params.id))
  if (!session || session.status === 'lobby' || session.status === 'active') {
    return res.status(404).json({ error: 'Результаты не найдены' })
  }
  const players = db
    .prepare(
      `SELECT id, user_id, nickname, score, correct_count AS correctCount, place
       FROM players WHERE session_id = ?
       ORDER BY place IS NULL, place, score DESC, total_time_ms, id`
    )
    .all(session.id)
  const me = req.user ? players.find((p) => p.user_id === req.user.id) : null
  const isHost = req.user?.id === session.host_id
  const { questions } = JSON.parse(session.snapshot)

  const result = {
    session: {
      id: session.id,
      title: session.quiz_title,
      status: session.status,
      date: session.finished_at || session.created_at,
      questionCount: questions.length,
    },
    isHost,
    leaderboard: players.map((p, i) => ({
      nickname: p.nickname,
      score: p.score,
      correctCount: p.correctCount,
      place: p.place ?? i + 1,
      isMe: Boolean(me && p.id === me.id),
    })),
  }

  // Разбор по вопросам с правильными ответами: организатору — статистика зала,
  // участнику — его собственные ответы. Посторонним виден только лидерборд.
  if (isHost) {
    const answers = db.prepare('SELECT * FROM answers WHERE session_id = ?').all(session.id)
    result.questions = questions.map((q, index) => {
      const forQuestion = answers.filter((a) => a.question_index === index)
      const counts = Object.fromEntries(q.options.map((o) => [o.id, 0]))
      for (const a of forQuestion) for (const id of JSON.parse(a.selected)) counts[id]++
      return {
        text: q.text,
        type: q.type,
        answered: forQuestion.length,
        correct: forQuestion.filter((a) => a.is_correct).length,
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, count: counts[o.id] })),
      }
    })
  } else if (me) {
    const mine = db.prepare('SELECT * FROM answers WHERE player_id = ?').all(me.id)
    result.myAnswers = questions.map((q, index) => {
      const a = mine.find((row) => row.question_index === index)
      const selected = a ? JSON.parse(a.selected) : []
      return {
        text: q.text,
        answered: Boolean(a),
        isCorrect: Boolean(a?.is_correct),
        points: a?.points ?? 0,
        options: q.options.map((o) => ({
          text: o.text, isCorrect: o.isCorrect, selected: selected.includes(o.id),
        })),
      }
    })
  }
  res.json(result)
})

module.exports = router
