const express = require('express')
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const { setAuthCookie, clearAuthCookie } = require('../auth')

const router = express.Router()

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте через несколько минут' },
})

const DUMMY_HASH = bcrypt.hashSync('no-such-user', 10)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

router.post('/register', limiter, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const role = req.body?.role

  if (name.length < 2 || name.length > 40) {
    return res.status(400).json({ error: 'Имя — от 2 до 40 символов' })
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return res.status(400).json({ error: 'Укажите корректный email' })
  }
  if (password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'Пароль — от 6 до 72 символов' })
  }
  if (role !== 'organizer' && role !== 'participant') {
    return res.status(400).json({ error: 'Выберите роль: участник или организатор' })
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' })
  }

  const hash = await bcrypt.hash(password, 10)
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hash, role)
  const id = Number(info.lastInsertRowid)
  setAuthCookie(res, id)
  res.status(201).json({ user: { id, name, email, role } })
})

router.post('/login', limiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  // Хеш сравнивается и для несуществующего email, чтобы по времени ответа
  // нельзя было понять, зарегистрирован ли адрес.
  const hash = row?.password_hash || DUMMY_HASH
  const ok = await bcrypt.compare(password, hash)
  if (!row || !ok) return res.status(401).json({ error: 'Неверный email или пароль' })
  setAuthCookie(res, row.id)
  res.json({ user: { id: row.id, name: row.name, email: row.email, role: row.role } })
})

router.post('/logout', (_req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

router.get('/me', (req, res) => {
  res.json({ user: req.user })
})

module.exports = router
