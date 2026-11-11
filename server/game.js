// Игровой движок: живые комнаты квизов в памяти процесса + запись результатов в базу.
// Сервер — единственный источник правды: он ведёт таймер, принимает ответы только пока
// вопрос на экране и рассылает каждому участнику его собственное представление состояния.
const crypto = require('crypto')
const db = require('./db')
const { userFromCookieHeader } = require('./auth')

const AUTO_ADVANCE_MS = Number(process.env.AUTO_ADVANCE_MS) || 7000
const GRACE_MS = 400 // запас на сетевую задержку: ответ, отправленный на последней секунде, засчитывается
const KEEP_FINISHED_MS = 30 * 60 * 1000
const STALE_ROOM_MS = 6 * 60 * 60 * 1000
const MAX_PLAYERS = 300
const RECONNECT_WINDOW_MS = 5000

const rooms = new Map()
let io = null

function shuffled(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function newCode() {
  for (;;) {
    const code = String(crypto.randomInt(100000, 1000000))
    if (!rooms.has(code)) return code
  }
}

function createRoom(quiz, hostId) {
  let questions = quiz.questions.map((q) => ({
    text: q.text,
    image: q.image,
    type: q.type,
    points: q.points,
    duration: q.timeLimit ?? quiz.timePerQuestion,
    options: (quiz.shuffleOptions ? shuffled(q.options) : q.options).map((o, id) => ({
      id, text: o.text, isCorrect: o.isCorrect,
    })),
  }))
  if (quiz.shuffleQuestions) questions = shuffled(questions)

  const code = newCode()
  // В снимок картинки не кладём: для результатов они не нужны, а база бы распухала.
  const snapshot = JSON.stringify({
    questions: questions.map(({ image, ...rest }) => ({ ...rest, hasImage: Boolean(image) })),
  })
  const info = db
    .prepare('INSERT INTO sessions (quiz_id, host_id, code, quiz_title, snapshot) VALUES (?, ?, ?, ?, ?)')
    .run(quiz.id, hostId, code, quiz.title, snapshot)

  const room = {
    sessionId: Number(info.lastInsertRowid),
    code,
    hostId,
    title: quiz.title,
    speedBonus: quiz.speedBonus,
    autoAdvance: quiz.autoAdvance,
    questions,
    phase: 'lobby', // lobby → question ⇄ reveal → finished
    index: -1,
    startedAt: 0,
    endsAt: 0,
    nextAt: null,
    timer: null,
    players: new Map(),
    createdAt: Date.now(),
  }
  rooms.set(code, room)
  return room
}

// ---------- представления состояния ----------

function ranking(room) {
  return [...room.players.values()]
    .toSorted((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.id - b.id)
    .map((p, i) => ({
      id: p.id, nickname: p.nickname, score: p.score, correctCount: p.correctCount, place: i + 1,
    }))
}

function publicQuestion(room) {
  const q = room.questions[room.index]
  return {
    index: room.index,
    text: q.text,
    image: q.image ? `/api/live/${room.code}/image/${room.index}` : null,
    type: q.type,
    points: q.points,
    duration: q.duration,
    endsAt: room.endsAt,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  }
}

function revealData(room) {
  const q = room.questions[room.index]
  const counts = Object.fromEntries(q.options.map((o) => [o.id, 0]))
  for (const p of room.players.values()) {
    const answer = p.answers.get(room.index)
    if (answer) for (const id of answer.selected) counts[id]++
  }
  return { correct: q.options.filter((o) => o.isCorrect).map((o) => o.id), counts }
}

function baseView(room) {
  const inQuestion = room.phase === 'question' || room.phase === 'reveal'
  return {
    code: room.code,
    sessionId: room.sessionId,
    title: room.title,
    phase: room.phase,
    total: room.questions.length,
    playerCount: room.players.size,
    serverNow: Date.now(),
    nextAt: room.phase === 'reveal' ? room.nextAt : null,
    question: inQuestion ? publicQuestion(room) : null,
    reveal: room.phase === 'reveal' ? revealData(room) : null,
  }
}

function hostView(room, board) {
  const answered = [...room.players.values()].filter((p) => p.answers.has(room.index)).length
  return {
    ...baseView(room),
    role: 'host',
    autoAdvance: room.autoAdvance,
    players: [...room.players.values()].map((p) => ({
      id: p.id, nickname: p.nickname, connected: p.sockets.size > 0,
    })),
    answeredCount: room.phase === 'question' || room.phase === 'reveal' ? answered : 0,
    leaderboard: room.phase === 'reveal' || room.phase === 'finished' ? board : null,
  }
}

function playerView(room, player, board) {
  const me = board.find((row) => row.id === player.id)
  const answer = player.answers.get(room.index)
  const showBoard = room.phase === 'reveal' || room.phase === 'finished'
  return {
    ...baseView(room),
    role: 'player',
    me: { id: player.id, nickname: player.nickname, score: player.score, place: me?.place ?? null },
    myAnswer: room.phase === 'question' || room.phase === 'reveal' ? answer?.selected ?? null : null,
    // Верно/неверно и баллы участник узнаёт только после закрытия вопроса.
    myResult: room.phase === 'reveal' && answer
      ? { correct: answer.correct, points: answer.points }
      : null,
    leaderboard: showBoard ? board.slice(0, 10) : null,
  }
}

const hostChannel = (room) => `host:${room.code}`
const playerChannel = (room, player) => `player:${room.code}:${player.id}`

function emitHost(room, board = ranking(room)) {
  io.to(hostChannel(room)).emit('state', hostView(room, board))
}

function emitPlayer(room, player, board = ranking(room)) {
  io.to(playerChannel(room, player)).emit('state', playerView(room, player, board))
}

function emitAll(room) {
  const board = ranking(room)
  emitHost(room, board)
  for (const player of room.players.values()) emitPlayer(room, player, board)
}

// ---------- ход игры ----------

function startQuestion(room) {
  clearTimeout(room.timer)
  if (room.index === -1) {
    db.prepare(`UPDATE sessions SET status = 'active', started_at = datetime('now') WHERE id = ?`)
      .run(room.sessionId)
  }
  room.index += 1
  room.phase = 'question'
  room.nextAt = null
  room.startedAt = Date.now()
  const durationMs = room.questions[room.index].duration * 1000
  room.endsAt = room.startedAt + durationMs
  room.timer = setTimeout(() => reveal(room), durationMs + GRACE_MS)
  emitAll(room)
}

function reveal(room) {
  if (room.phase !== 'question') return
  clearTimeout(room.timer)
  room.phase = 'reveal'
  if (room.autoAdvance) {
    room.nextAt = Date.now() + AUTO_ADVANCE_MS
    room.timer = setTimeout(() => next(room), AUTO_ADVANCE_MS)
  }
  emitAll(room)
}

function next(room) {
  if (room.phase !== 'reveal') return
  clearTimeout(room.timer)
  if (room.index + 1 < room.questions.length) startQuestion(room)
  else finish(room)
}

const saveResults = db.transaction((room, board) => {
  const update = db.prepare('UPDATE players SET place = ? WHERE id = ?')
  for (const row of board) update.run(row.place, row.id)
  db.prepare(`UPDATE sessions SET status = 'finished', finished_at = datetime('now') WHERE id = ?`)
    .run(room.sessionId)
})

function finish(room) {
  clearTimeout(room.timer)
  room.phase = 'finished'
  room.nextAt = null
  saveResults(room, ranking(room))
  emitAll(room)
  // Комната ещё полчаса отдаёт финальный экран тем, кто переподключился, затем освобождает память.
  room.timer = setTimeout(() => rooms.delete(room.code), KEEP_FINISHED_MS)
  room.timer.unref()
}

function abort(room) {
  clearTimeout(room.timer)
  rooms.delete(room.code)
  db.prepare(`UPDATE sessions SET status = 'aborted', finished_at = datetime('now') WHERE id = ?`)
    .run(room.sessionId)
  const channels = [hostChannel(room), ...[...room.players.values()].map((p) => playerChannel(room, p))]
  for (const channel of channels) io.to(channel).emit('closed', { reason: 'Организатор закрыл комнату' })
}

// Вопрос закрывается досрочно, когда ответили все, кто на связи. Игрок, пропавший
// на несколько секунд (обновил страницу, моргнула сеть), ещё считается «на связи» —
// иначе вопрос закрылся бы у него перед носом.
function maybeRevealEarly(room) {
  if (room.phase !== 'question') return
  const now = Date.now()
  const waitingFor = [...room.players.values()].some(
    (p) => !p.answers.has(room.index) && (p.sockets.size > 0 || now - p.leftAt < RECONNECT_WINDOW_MS)
  )
  if (!waitingFor) reveal(room)
}

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x))
}

function submitAnswer(room, player, payload) {
  if (room.phase !== 'question' || payload?.index !== room.index) {
    return { ok: false, error: 'Время на этот вопрос вышло' }
  }
  const now = Date.now()
  if (now > room.endsAt + GRACE_MS) return { ok: false, error: 'Время на этот вопрос вышло' }
  if (player.answers.has(room.index)) return { ok: false, error: 'Ответ уже принят' }

  const q = room.questions[room.index]
  const selected = Array.isArray(payload.selected) ? [...new Set(payload.selected)] : []
  const valid = selected.length > 0 && selected.every((id) => q.options.some((o) => o.id === id))
  if (!valid) return { ok: false, error: 'Выберите вариант ответа' }
  if (q.type === 'single' && selected.length !== 1) {
    return { ok: false, error: 'В этом вопросе можно выбрать только один вариант' }
  }

  const durationMs = q.duration * 1000
  const timeMs = Math.min(Math.max(now - room.startedAt, 0), durationMs)
  const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id)
  const correct = sameSet(selected, correctIds)
  // С бонусом за скорость мгновенный ответ даёт полные баллы, ответ на последней секунде — половину.
  const points = !correct
    ? 0
    : room.speedBonus
      ? Math.round(q.points * (0.5 + 0.5 * (1 - timeMs / durationMs)))
      : q.points

  player.answers.set(room.index, { selected, correct, points, timeMs })
  player.score += points
  if (correct) {
    player.correctCount += 1
    player.totalTime += timeMs
  }
  db.prepare(
    `INSERT INTO answers (session_id, player_id, question_index, selected, is_correct, points, time_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(room.sessionId, player.id, room.index, JSON.stringify(selected), correct ? 1 : 0, points, timeMs)
  db.prepare('UPDATE players SET score = ?, correct_count = ?, total_time_ms = ? WHERE id = ?')
    .run(player.score, player.correctCount, player.totalTime, player.id)
  return { ok: true }
}

// ---------- подключения ----------

function findPlayer(room, user, token) {
  const all = [...room.players.values()]
  if (typeof token === 'string' && token) {
    const byToken = all.find((p) => p.token === token)
    if (byToken) return byToken
  }
  return user ? all.find((p) => p.userId === user.id) || null : null
}

function joinAsPlayer(socket, payload) {
  const room = rooms.get(String(payload?.code || '').trim())
  if (!room) return { ok: false, notFound: true, error: 'Комната не найдена. Проверьте код' }
  const user = socket.data.user

  let player = findPlayer(room, user, payload.token)
  if (!player) {
    if (room.phase === 'finished') return { ok: false, error: 'Этот квиз уже завершён' }
    const nickname = String(payload.nickname || '').trim().replace(/\s+/g, ' ')
    if (!nickname) return { ok: false, needNickname: true }
    if (nickname.length > 20) return { ok: false, needNickname: true, error: 'Имя — не длиннее 20 символов' }
    if (room.players.size >= MAX_PLAYERS) return { ok: false, error: 'В комнате нет свободных мест' }
    const taken = [...room.players.values()].some(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
    )
    if (taken) return { ok: false, needNickname: true, error: 'Такое имя уже занято, выберите другое' }

    const token = crypto.randomBytes(16).toString('hex')
    const info = db
      .prepare('INSERT INTO players (session_id, user_id, token, nickname) VALUES (?, ?, ?, ?)')
      .run(room.sessionId, user?.id ?? null, token, nickname)
    player = {
      id: Number(info.lastInsertRowid),
      userId: user?.id ?? null,
      token,
      nickname,
      score: 0,
      correctCount: 0,
      totalTime: 0,
      answers: new Map(),
      sockets: new Set(),
      leftAt: 0,
    }
    room.players.set(player.id, player)
  }

  player.sockets.add(socket.id)
  socket.data.room = room
  socket.data.player = player
  socket.join(playerChannel(room, player))
  emitPlayer(room, player)
  emitHost(room)
  return { ok: true, token: player.token }
}

function attach(server) {
  io = server
  io.use((socket, nextMiddleware) => {
    socket.data.user = userFromCookieHeader(socket.handshake.headers.cookie)
    nextMiddleware()
  })

  io.on('connection', (socket) => {
    // Обёртка: ответ клиенту уходит всегда, а неожиданная ошибка попадает в лог, а не роняет сервер.
    const on = (event, handler) => {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {}
        try {
          reply(handler(payload) || { ok: true })
        } catch (err) {
          console.error(`[socket ${event}]`, err)
          reply({ ok: false, error: 'Ошибка сервера. Попробуйте ещё раз' })
        }
      })
    }

    const hostAction = (fn) => () => {
      const room = socket.data.hostRoom
      if (!room || !rooms.has(room.code)) return { ok: false, error: 'Комната уже закрыта' }
      return fn(room)
    }

    on('host:join', (payload) => {
      const room = rooms.get(String(payload?.code || '').trim())
      if (!room) return { ok: false, notFound: true, error: 'Комната не найдена или уже закрыта' }
      if (socket.data.user?.id !== room.hostId) {
        return { ok: false, error: 'Управлять игрой может только её организатор' }
      }
      socket.data.hostRoom = room
      socket.join(hostChannel(room))
      socket.emit('state', hostView(room, ranking(room)))
    })

    on('host:start', hostAction((room) => {
      if (room.phase !== 'lobby') return { ok: false, error: 'Квиз уже идёт' }
      if (room.players.size === 0) return { ok: false, error: 'Дождитесь хотя бы одного участника' }
      startQuestion(room)
    }))
    on('host:skip', hostAction((room) => reveal(room)))
    on('host:next', hostAction((room) => next(room)))
    on('host:end', hostAction((room) => {
      if (room.phase === 'finished') return
      if (room.phase === 'lobby') abort(room)
      else finish(room)
    }))

    on('player:join', (payload) => joinAsPlayer(socket, payload))

    on('player:answer', (payload) => {
      const { room, player } = socket.data
      if (!room || !player || !rooms.has(room.code)) return { ok: false, error: 'Вы не в комнате' }
      const result = submitAnswer(room, player, payload)
      if (result.ok) {
        emitPlayer(room, player)
        emitHost(room)
        maybeRevealEarly(room)
      }
      return result
    })

    socket.on('disconnect', () => {
      const { room, player } = socket.data
      if (!room || !player || !rooms.has(room.code)) return
      player.sockets.delete(socket.id)
      if (player.sockets.size === 0) player.leftAt = Date.now()
      emitHost(room)
    })
  })

  // Забытые комнаты (организатор закрыл вкладку и не вернулся) не должны жить вечно.
  const sweep = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.phase !== 'finished' && Date.now() - room.createdAt > STALE_ROOM_MS) abort(room)
    }
  }, 10 * 60 * 1000)
  sweep.unref()
}

function liveInfo(code) {
  const room = rooms.get(code)
  return room ? { code: room.code, title: room.title, phase: room.phase } : null
}

// Картинка отдаётся только для уже показанных вопросов — подсмотреть следующий нельзя.
function questionImage(code, index) {
  const room = rooms.get(code)
  if (!room || !Number.isInteger(index) || index < 0 || index > room.index) return null
  return room.questions[index]?.image || null
}

module.exports = { attach, createRoom, liveInfo, questionImage }
