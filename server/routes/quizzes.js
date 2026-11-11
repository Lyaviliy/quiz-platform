const express = require('express')
const db = require('../db')
const { requireOrganizer } = require('../auth')
const { normalizeQuiz, ValidationError } = require('../validate')
const game = require('../game')

const router = express.Router()
router.use(requireOrganizer)

function loadQuiz(id, ownerId) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND owner_id = ?').get(id, ownerId)
  if (!quiz) return null
  const questions = db
    .prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position')
    .all(id)
  const optionsOf = db.prepare('SELECT * FROM options WHERE question_id = ? ORDER BY position')
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    categoryId: quiz.category_id,
    timePerQuestion: quiz.time_per_question,
    speedBonus: Boolean(quiz.speed_bonus),
    shuffleQuestions: Boolean(quiz.shuffle_questions),
    shuffleOptions: Boolean(quiz.shuffle_options),
    autoAdvance: Boolean(quiz.auto_advance),
    questions: questions.map((q) => ({
      text: q.text,
      image: q.image,
      type: q.type,
      timeLimit: q.time_limit,
      points: q.points,
      options: optionsOf.all(q.id).map((o) => ({ text: o.text, isCorrect: Boolean(o.is_correct) })),
    })),
  }
}

const insertQuestion = db.prepare(
  `INSERT INTO questions (quiz_id, position, text, image, type, time_limit, points)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
)
const insertOption = db.prepare(
  'INSERT INTO options (question_id, position, text, is_correct) VALUES (?, ?, ?, ?)'
)

function writeQuestions(quizId, questions) {
  questions.forEach((q, qi) => {
    const info = insertQuestion.run(quizId, qi, q.text, q.image, q.type, q.timeLimit, q.points)
    q.options.forEach((o, oi) => {
      insertOption.run(info.lastInsertRowid, oi, o.text, o.isCorrect ? 1 : 0)
    })
  })
}

// Квиз сохраняется целиком одной транзакцией: либо новая версия со всеми
// вопросами, либо старая — «половины квиза» в базе не бывает.
const createQuiz = db.transaction((ownerId, q) => {
  const info = db
    .prepare(
      `INSERT INTO quizzes (owner_id, title, description, category_id, time_per_question,
         speed_bonus, shuffle_questions, shuffle_options, auto_advance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ownerId, q.title, q.description, q.categoryId, q.timePerQuestion,
      +q.speedBonus, +q.shuffleQuestions, +q.shuffleOptions, +q.autoAdvance)
  writeQuestions(info.lastInsertRowid, q.questions)
  return Number(info.lastInsertRowid)
})

const updateQuiz = db.transaction((id, q) => {
  db.prepare(
    `UPDATE quizzes SET title = ?, description = ?, category_id = ?, time_per_question = ?,
       speed_bonus = ?, shuffle_questions = ?, shuffle_options = ?, auto_advance = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(q.title, q.description, q.categoryId, q.timePerQuestion,
    +q.speedBonus, +q.shuffleQuestions, +q.shuffleOptions, +q.autoAdvance, id)
  db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(id) // варианты уйдут каскадом
  writeQuestions(id, q.questions)
})

function parseBody(req, res) {
  try {
    return normalizeQuiz(req.body)
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message })
      return null
    }
    throw err
  }
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT q.id, q.title, q.description, q.time_per_question AS timePerQuestion,
              q.updated_at AS updatedAt, c.name AS category,
              (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) AS questionCount,
              (SELECT COUNT(*) FROM sessions WHERE quiz_id = q.id AND status = 'finished') AS playedCount
       FROM quizzes q LEFT JOIN categories c ON c.id = q.category_id
       WHERE q.owner_id = ? ORDER BY q.updated_at DESC, q.id DESC`
    )
    .all(req.user.id)
  res.json({ quizzes: rows })
})

router.post('/', (req, res) => {
  const quiz = parseBody(req, res)
  if (!quiz) return
  const id = createQuiz(req.user.id, quiz)
  res.status(201).json({ id })
})

router.get('/:id', (req, res) => {
  const quiz = loadQuiz(Number(req.params.id), req.user.id)
  if (!quiz) return res.status(404).json({ error: 'Квиз не найден' })
  res.json({ quiz })
})

router.put('/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!loadQuiz(id, req.user.id)) return res.status(404).json({ error: 'Квиз не найден' })
  const quiz = parseBody(req, res)
  if (!quiz) return
  updateQuiz(id, quiz)
  res.json({ id })
})

router.delete('/:id', (req, res) => {
  // Проведённые игры остаются в истории: у sessions.quiz_id стоит ON DELETE SET NULL,
  // а вопросы и название игры лежат в её собственном снимке.
  const info = db
    .prepare('DELETE FROM quizzes WHERE id = ? AND owner_id = ?')
    .run(Number(req.params.id), req.user.id)
  if (!info.changes) return res.status(404).json({ error: 'Квиз не найден' })
  res.json({ ok: true })
})

router.post('/:id/sessions', (req, res) => {
  const quiz = loadQuiz(Number(req.params.id), req.user.id)
  if (!quiz) return res.status(404).json({ error: 'Квиз не найден' })
  if (quiz.questions.length === 0) {
    return res.status(400).json({ error: 'Добавьте хотя бы один вопрос, чтобы запустить квиз' })
  }
  const room = game.createRoom(quiz, req.user.id)
  res.status(201).json({ code: room.code, sessionId: room.sessionId })
})

module.exports = router
