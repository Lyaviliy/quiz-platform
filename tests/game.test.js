// Интеграционный тест: настоящий сервер на временной базе, запросы по HTTP и Socket.IO.
const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('os')
const path = require('path')
const fs = require('fs')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-test-'))
process.env.DB_PATH = path.join(tmp, 'test.db')
process.env.JWT_SECRET = 'test-secret'
process.env.AUTH_RATE_LIMIT = '1000'
process.env.AUTO_ADVANCE_MS = '150'

const { io: connect } = require('socket.io-client')
const { start, server, io } = require('../server/index')

let base
const sockets = []

test.before(async () => {
  base = `http://localhost:${await start(0)}`
})
test.after(() => {
  for (const s of sockets) s.close()
  io.close()
  server.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function api(method, url, body, cookie) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  return { status: res.status, body: await res.json(), cookie: setCookie?.split(';')[0] }
}

let userSeq = 0
async function register(role, name = `User${++userSeq}`) {
  const res = await api('POST', '/api/auth/register', {
    name, email: `${name.toLowerCase()}-${++userSeq}@test.ru`, password: 'secret1', role,
  })
  assert.equal(res.status, 201)
  return { cookie: res.cookie, user: res.body.user }
}

// Сокет, который помнит последнее состояние и умеет дождаться нужного.
function client(cookie) {
  const socket = connect(base, { extraHeaders: cookie ? { Cookie: cookie } : {}, forceNew: true })
  sockets.push(socket)
  const waiters = []
  socket.state = null
  socket.on('state', (state) => {
    socket.state = state
    for (const w of waiters.filter((waiter) => waiter.check(state))) {
      waiters.splice(waiters.indexOf(w), 1)
      w.resolve(state)
    }
  })
  socket.until = (check, label = 'состояние') =>
    new Promise((resolve, reject) => {
      if (socket.state && check(socket.state)) return resolve(socket.state)
      const timer = setTimeout(() => reject(new Error(`Не дождались: ${label}`)), 4000)
      waiters.push({ check, resolve: (s) => { clearTimeout(timer); resolve(s) } })
    })
  socket.ask = (event, payload) =>
    new Promise((resolve) => socket.emit(event, payload, resolve))
  return socket
}

const QUIZ = {
  title: 'Тестовый квиз',
  description: '',
  categoryId: 1,
  timePerQuestion: 20,
  speedBonus: false,
  shuffleQuestions: false,
  shuffleOptions: false,
  autoAdvance: false,
  questions: [
    {
      text: 'Столица России?', type: 'single', points: 100,
      options: [{ text: 'Москва', isCorrect: true }, { text: 'Казань', isCorrect: false }],
    },
    {
      text: 'Чётные числа?', type: 'multiple', points: 200,
      options: [
        { text: '2', isCorrect: true }, { text: '3', isCorrect: false }, { text: '4', isCorrect: true },
      ],
    },
  ],
}

async function launch(quiz = QUIZ) {
  const host = await register('organizer')
  const created = await api('POST', '/api/quizzes', quiz, host.cookie)
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const session = await api('POST', `/api/quizzes/${created.body.id}/sessions`, null, host.cookie)
  assert.equal(session.status, 201)
  const hostSocket = client(host.cookie)
  assert.deepEqual(await hostSocket.ask('host:join', { code: session.body.code }), { ok: true })
  return { host, hostSocket, quizId: created.body.id, ...session.body }
}

test('участник не может создавать квизы, гость — тем более', async () => {
  const participant = await register('participant')
  assert.equal((await api('POST', '/api/quizzes', QUIZ, participant.cookie)).status, 403)
  assert.equal((await api('POST', '/api/quizzes', QUIZ)).status, 401)
})

test('чужой квиз нельзя прочитать, изменить, удалить или запустить', async () => {
  const { quizId } = await launch()
  const stranger = await register('organizer')
  assert.equal((await api('GET', `/api/quizzes/${quizId}`, null, stranger.cookie)).status, 404)
  assert.equal((await api('PUT', `/api/quizzes/${quizId}`, QUIZ, stranger.cookie)).status, 404)
  assert.equal((await api('DELETE', `/api/quizzes/${quizId}`, null, stranger.cookie)).status, 404)
  assert.equal((await api('POST', `/api/quizzes/${quizId}/sessions`, null, stranger.cookie)).status, 404)
})

test('валидация квиза: вопрос с одиночным выбором требует ровно один правильный ответ', async () => {
  const host = await register('organizer')
  const bad = structuredClone(QUIZ)
  bad.questions[0].options[1].isCorrect = true
  const res = await api('POST', '/api/quizzes', bad, host.cookie)
  assert.equal(res.status, 400)
  assert.match(res.body.error, /Вопрос 1/)
})

test('полная игра: ответы, баллы, лидерборд, история и результаты', async () => {
  const { hostSocket, code, sessionId, host } = await launch()

  const anna = await register('participant', 'Анна')
  const annaSocket = client(anna.cookie)
  const guestSocket = client() // гость без аккаунта

  assert.equal((await annaSocket.ask('player:join', { code })).needNickname, true)
  const annaJoin = await annaSocket.ask('player:join', { code, nickname: 'Анна' })
  assert.equal(annaJoin.ok, true)
  const taken = await guestSocket.ask('player:join', { code, nickname: 'анна' })
  assert.equal(taken.ok, false, 'занятое имя должно отклоняться')
  assert.equal((await guestSocket.ask('player:join', { code, nickname: 'Гость' })).ok, true)

  await hostSocket.until((s) => s.players.length === 2, 'два игрока в лобби')

  // До старта ответ не принимается.
  assert.equal((await annaSocket.ask('player:answer', { index: 0, selected: [0] })).ok, false)
  // Игрок не может управлять игрой.
  assert.equal((await annaSocket.ask('host:start')).ok, false)
  assert.equal(annaSocket.state.phase, 'lobby')

  assert.equal((await hostSocket.ask('host:start')).ok, true)
  const q1 = await annaSocket.until((s) => s.phase === 'question' && s.question.index === 0, 'вопрос 1')
  assert.equal(q1.question.text, 'Столица России?')
  assert.equal(q1.question.options[0].isCorrect, undefined, 'правильный ответ не должен утекать участнику')
  assert.equal(q1.reveal, null)

  assert.equal((await annaSocket.ask('player:answer', { index: 0, selected: [0] })).ok, true)
  assert.equal((await annaSocket.ask('player:answer', { index: 0, selected: [1] })).ok, false, 'повторный ответ')
  assert.equal(annaSocket.state.myResult, null, 'результат скрыт, пока вопрос открыт')
  await hostSocket.until((s) => s.answeredCount === 1, 'счётчик ответивших')

  // Когда ответили все, вопрос закрывается сам.
  assert.equal((await guestSocket.ask('player:answer', { index: 0, selected: [1] })).ok, true)
  const r1 = await annaSocket.until((s) => s.phase === 'reveal', 'разбор вопроса 1')
  assert.deepEqual(r1.reveal.correct, [0])
  assert.deepEqual(r1.reveal.counts, { 0: 1, 1: 1 })
  assert.deepEqual(r1.myResult, { correct: true, points: 100 })
  assert.deepEqual((await guestSocket.until((s) => s.phase === 'reveal')).myResult, { correct: false, points: 0 })

  // После закрытия вопроса ответ не принимается.
  assert.equal((await guestSocket.ask('player:answer', { index: 0, selected: [0] })).ok, false)

  await hostSocket.ask('host:next')
  await annaSocket.until((s) => s.phase === 'question' && s.question.index === 1, 'вопрос 2')
  // Множественный выбор: засчитывается только точное совпадение набора.
  assert.equal((await annaSocket.ask('player:answer', { index: 1, selected: [0] })).ok, true)
  assert.equal((await guestSocket.ask('player:answer', { index: 1, selected: [2, 0] })).ok, true)
  await hostSocket.until((s) => s.phase === 'reveal' && s.question.index === 1, 'разбор вопроса 2')
  await hostSocket.ask('host:next')

  const final = await hostSocket.until((s) => s.phase === 'finished', 'финал')
  assert.deepEqual(
    final.leaderboard.map((r) => [r.place, r.nickname, r.score]),
    [[1, 'Гость', 200], [2, 'Анна', 100]]
  )
  assert.equal((await annaSocket.until((s) => s.phase === 'finished')).me.place, 2)

  // Данные сохранены: результаты, история участника и организатора.
  const results = await api('GET', `/api/sessions/${sessionId}/results`, null, anna.cookie)
  assert.equal(results.status, 200)
  assert.deepEqual(results.body.leaderboard.map((r) => [r.place, r.nickname, r.score, r.isMe]),
    [[1, 'Гость', 200, false], [2, 'Анна', 100, true]])
  assert.deepEqual(results.body.myAnswers.map((a) => [a.isCorrect, a.points]), [[true, 100], [false, 0]])
  assert.equal(results.body.questions, undefined, 'статистика зала — только организатору')

  const hostResults = await api('GET', `/api/sessions/${sessionId}/results`, null, host.cookie)
  assert.deepEqual(hostResults.body.questions.map((q) => [q.answered, q.correct]), [[2, 1], [2, 1]])

  const played = (await api('GET', '/api/me/history', null, anna.cookie)).body.played
  assert.deepEqual(played.map((p) => [p.sessionId, p.place, p.score]), [[sessionId, 2, 100]])
  const hosted = (await api('GET', '/api/me/history', null, host.cookie)).body.hosted
  assert.deepEqual(hosted.map((h) => [h.sessionId, h.winner, h.playerCount]), [[sessionId, 'Гость', 2]])
})

test('вопрос закрывается по таймеру, опоздавший ответ не засчитывается', async () => {
  const quiz = structuredClone(QUIZ)
  quiz.questions = [{ ...quiz.questions[0], timeLimit: 5 }]
  const { hostSocket, code } = await launch(quiz)
  const p = client()
  await p.ask('player:join', { code, nickname: 'Медленный' })

  test.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    await hostSocket.ask('host:start')
    await p.until((s) => s.phase === 'question')
    test.mock.timers.tick(6000)
    const state = await p.until((s) => s.phase === 'reveal', 'закрытие по таймеру')
    assert.equal(state.myResult, null)
    assert.equal((await p.ask('player:answer', { index: 0, selected: [0] })).ok, false)
  } finally {
    test.mock.timers.reset()
  }
})

test('бонус за скорость: поздний верный ответ даёт меньше баллов, но не меньше половины', async () => {
  const quiz = structuredClone(QUIZ)
  quiz.speedBonus = true
  quiz.questions = [{ ...quiz.questions[0], timeLimit: 10 }]
  const { hostSocket, code } = await launch(quiz)
  const fast = client()
  const slow = client()
  await fast.ask('player:join', { code, nickname: 'Быстрый' })
  await slow.ask('player:join', { code, nickname: 'Поздний' })

  test.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    await hostSocket.ask('host:start')
    await fast.until((s) => s.phase === 'question')
    await fast.ask('player:answer', { index: 0, selected: [0] })
    test.mock.timers.tick(8000)
    await slow.ask('player:answer', { index: 0, selected: [0] })
    const state = await hostSocket.until((s) => s.phase === 'reveal')
    assert.deepEqual(state.leaderboard.map((r) => [r.nickname, r.score]), [['Быстрый', 100], ['Поздний', 60]])
  } finally {
    test.mock.timers.reset()
  }
})

test('переподключение по токену возвращает того же игрока с его баллами', async () => {
  const { hostSocket, code } = await launch()
  const first = client()
  const { token } = await first.ask('player:join', { code, nickname: 'Петя' })
  await hostSocket.ask('host:start')
  await first.until((s) => s.phase === 'question')
  await first.ask('player:answer', { index: 0, selected: [0] })
  await first.until((s) => s.phase === 'reveal')
  first.close()

  const second = client()
  assert.equal((await second.ask('player:join', { code, token })).ok, true)
  const state = await second.until((s) => s.phase === 'reveal')
  assert.equal(state.me.nickname, 'Петя')
  assert.equal(state.me.score, 100)
  assert.equal((await hostSocket.until((s) => s.players.length === 1 && s.players[0].connected)).players.length, 1)
})

test('автопереход: после разбора следующий вопрос включается сам', async () => {
  const { hostSocket, code } = await launch({ ...QUIZ, autoAdvance: true })
  const p = client()
  await p.ask('player:join', { code, nickname: 'Один' })
  await hostSocket.ask('host:start')
  await p.until((s) => s.phase === 'question')
  await p.ask('player:answer', { index: 0, selected: [0] })
  await p.until((s) => s.phase === 'question' && s.question.index === 1, 'автопереход ко второму вопросу')
})

test('чужой организатор не может подключиться к управлению комнатой', async () => {
  const { code } = await launch()
  const stranger = await register('organizer')
  const s = client(stranger.cookie)
  assert.equal((await s.ask('host:join', { code })).ok, false)
  assert.equal((await s.ask('host:start')).ok, false)
})

test('картинка следующего вопроса недоступна, пока он не показан', async () => {
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const quiz = structuredClone(QUIZ)
  quiz.questions[1].image = pixel
  const { hostSocket, code } = await launch(quiz)
  const p = client()
  await p.ask('player:join', { code, nickname: 'Зритель' })
  await hostSocket.ask('host:start')
  await p.until((s) => s.phase === 'question')
  assert.equal((await fetch(`${base}/api/live/${code}/image/1`)).status, 404)
  await hostSocket.ask('host:skip')
  await hostSocket.ask('host:next')
  const state = await p.until((s) => s.phase === 'question' && s.question.index === 1)
  const res = await fetch(base + state.question.image)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/png')
})

test('удаление квиза не ломает историю проведённых игр', async () => {
  const { hostSocket, code, sessionId, quizId, host } = await launch()
  const p = client()
  await p.ask('player:join', { code, nickname: 'Игрок' })
  await hostSocket.ask('host:start')
  await hostSocket.ask('host:end')
  await hostSocket.until((s) => s.phase === 'finished')
  assert.equal((await api('DELETE', `/api/quizzes/${quizId}`, null, host.cookie)).status, 200)
  const results = await api('GET', `/api/sessions/${sessionId}/results`, null, host.cookie)
  assert.equal(results.status, 200)
  assert.equal(results.body.session.title, 'Тестовый квиз')
  assert.equal(results.body.questions.length, 2)
})

test('игрок обновил страницу — вопрос не закрывается у него перед носом', async () => {
  const { hostSocket, code } = await launch()
  const stays = client()
  const reloads = client()
  await stays.ask('player:join', { code, nickname: 'Остаётся' })
  const { token } = await reloads.ask('player:join', { code, nickname: 'Обновляет' })
  await hostSocket.ask('host:start')
  await reloads.until((s) => s.phase === 'question')

  reloads.close()
  await hostSocket.until((s) => s.players.some((p) => !p.connected), 'организатор видит отключение')
  await stays.ask('player:answer', { index: 0, selected: [0] })
  await hostSocket.until((s) => s.answeredCount === 1)
  assert.equal(hostSocket.state.phase, 'question', 'вопрос должен дождаться вернувшегося игрока')

  const back = client()
  await back.ask('player:join', { code, token })
  assert.equal((await back.ask('player:answer', { index: 0, selected: [1] })).ok, true)
  await hostSocket.until((s) => s.phase === 'reveal', 'после ответа вернувшегося вопрос закрывается')
})
