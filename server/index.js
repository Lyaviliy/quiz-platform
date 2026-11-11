const express = require('express')
const http = require('http')
const path = require('path')
const fs = require('fs')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const { Server } = require('socket.io')
const db = require('./db')
const { attachUser } = require('./auth')
const game = require('./game')

const app = express()
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'upgrade-insecure-requests': null,
      },
    },
  })
)
// Квиз сохраняется целиком вместе с картинками (до ~0,5 МБ каждая после сжатия на клиенте).
app.use(express.json({ limit: '30mb' }))
app.use(cookieParser())
app.use(attachUser)

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/categories', (_req, res) => {
  res.json({ categories: db.prepare('SELECT id, name FROM categories ORDER BY id').all() })
})
app.use('/api/auth', require('./routes/auth'))
app.use('/api/quizzes', require('./routes/quizzes'))
app.use('/api', require('./routes/sessions'))
app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }))

const dist = path.join(__dirname, '..', 'client', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Слишком большой запрос: уменьшите количество или размер картинок' })
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный запрос' })
  }
  console.error('[http]', err)
  res.status(500).json({ error: 'Ошибка сервера. Попробуйте ещё раз' })
})

const server = http.createServer(app)
const io = new Server(server)
game.attach(io)

function start(port = Number(process.env.PORT) || 3000) {
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server.address().port))
  })
}

if (require.main === module) {
  start().then((port) => console.log(`Квиз-платформа запущена: http://localhost:${port}`))
}

module.exports = { start, server, io }
