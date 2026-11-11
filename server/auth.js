const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const db = require('./db')

const COOKIE = 'quiz_token'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET обязателен в production')
  }
  // Для локального запуска: секрет создаётся один раз и лежит рядом с базой,
  // чтобы вход не слетал при каждом перезапуске.
  const file = path.join(path.dirname(db.name), '.jwt-secret')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const secret = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(file, secret, { mode: 0o600 })
  return secret
}
const SECRET = loadSecret()

const findUser = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?')

function setAuthCookie(res, userId) {
  const token = jwt.sign({ uid: userId }, SECRET, { expiresIn: '7d' })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: WEEK_MS,
  })
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE)
}

function userFromToken(token) {
  if (!token) return null
  try {
    const payload = jwt.verify(token, SECRET)
    return findUser.get(payload.uid) || null
  } catch (err) {
    // Просроченный или подделанный токен — это просто «не вошёл», не авария.
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') return null
    throw err
  }
}

function attachUser(req, _res, next) {
  req.user = userFromToken(req.cookies?.[COOKIE])
  next()
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Войдите в аккаунт' })
  next()
}

function requireOrganizer(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Войдите в аккаунт' })
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ error: 'Это действие доступно только организаторам' })
  }
  next()
}

function userFromCookieHeader(header) {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === COOKIE) {
      return userFromToken(decodeURIComponent(part.slice(eq + 1).trim()))
    }
  }
  return null
}

module.exports = {
  setAuthCookie, clearAuthCookie, attachUser, requireAuth, requireOrganizer, userFromCookieHeader,
}
