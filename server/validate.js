const db = require('./db')

const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/
const MAX_IMAGE_CHARS = 700_000 // ~500 КБ картинки: клиент сжимает до этого размера

class ValidationError extends Error {}

function fail(message) {
  throw new ValidationError(message)
}

function intInRange(value, min, max, message) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) fail(message)
  return n
}

function normalizeQuestion(raw, number) {
  const where = `Вопрос ${number}`
  const text = String(raw?.text || '').trim()
  if (!text) fail(`${where}: введите текст вопроса`)
  if (text.length > 500) fail(`${where}: текст длиннее 500 символов`)

  let image = null
  if (raw.image) {
    if (typeof raw.image !== 'string' || !IMAGE_RE.test(raw.image)) {
      fail(`${where}: картинка должна быть в формате PNG, JPEG, WebP или GIF`)
    }
    if (raw.image.length > MAX_IMAGE_CHARS) fail(`${where}: картинка слишком большая`)
    image = raw.image
  }

  if (raw.type !== 'single' && raw.type !== 'multiple') fail(`${where}: неизвестный тип вопроса`)

  const timeLimit = raw.timeLimit == null || raw.timeLimit === ''
    ? null
    : intInRange(raw.timeLimit, 5, 300, `${where}: время — от 5 до 300 секунд`)
  const points = intInRange(raw.points ?? 100, 10, 1000, `${where}: баллы — от 10 до 1000`)

  if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 6) {
    fail(`${where}: нужно от 2 до 6 вариантов ответа`)
  }
  const options = raw.options.map((o) => {
    const optionText = String(o?.text || '').trim()
    if (!optionText) fail(`${where}: заполните все варианты ответа`)
    if (optionText.length > 200) fail(`${where}: вариант ответа длиннее 200 символов`)
    return { text: optionText, isCorrect: Boolean(o.isCorrect) }
  })
  const correct = options.filter((o) => o.isCorrect).length
  if (raw.type === 'single' && correct !== 1) {
    fail(`${where}: отметьте ровно один правильный ответ`)
  }
  if (raw.type === 'multiple' && correct < 1) {
    fail(`${where}: отметьте хотя бы один правильный ответ`)
  }

  return { text, image, type: raw.type, timeLimit, points, options }
}

function normalizeQuiz(body) {
  const title = String(body?.title || '').trim()
  if (!title) fail('Введите название квиза')
  if (title.length > 120) fail('Название длиннее 120 символов')
  const description = String(body.description || '').trim()
  if (description.length > 500) fail('Описание длиннее 500 символов')

  let categoryId = null
  if (body.categoryId != null && body.categoryId !== '') {
    categoryId = Number(body.categoryId)
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
      fail('Выбрана несуществующая категория')
    }
  }

  const timePerQuestion = intInRange(
    body.timePerQuestion ?? 20, 5, 300, 'Время на вопрос — от 5 до 300 секунд'
  )
  if (!Array.isArray(body.questions)) fail('Список вопросов не передан')
  if (body.questions.length > 100) fail('В квизе может быть не больше 100 вопросов')

  return {
    title,
    description,
    categoryId,
    timePerQuestion,
    speedBonus: Boolean(body.speedBonus),
    shuffleQuestions: Boolean(body.shuffleQuestions),
    shuffleOptions: Boolean(body.shuffleOptions),
    autoAdvance: Boolean(body.autoAdvance),
    questions: body.questions.map((q, i) => normalizeQuestion(q, i + 1)),
  }
}

module.exports = { normalizeQuiz, ValidationError }
