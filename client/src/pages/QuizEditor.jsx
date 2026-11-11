import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Plus, Save, Trash2, X } from 'lucide-react'
import { api } from '../api.js'
import { Button, ErrorNote, Field, INPUT_CLASS, LinkButton, Panel, Spinner } from '../components/ui.jsx'

const MAX_IMAGE_CHARS = 650_000

let keySeq = 0
const nextKey = () => ++keySeq

function emptyQuestion() {
  return {
    key: nextKey(),
    text: '',
    image: null,
    type: 'single',
    timeLimit: '',
    points: 100,
    options: [
      { key: nextKey(), text: '', isCorrect: true },
      { key: nextKey(), text: '', isCorrect: false },
    ],
  }
}

const EMPTY_QUIZ = {
  title: '',
  description: '',
  categoryId: '',
  timePerQuestion: 20,
  speedBonus: true,
  shuffleQuestions: false,
  shuffleOptions: false,
  autoAdvance: false,
}

// Фото с телефона весит мегабайты. Уменьшаем его в браузере, чтобы вопрос
// мгновенно открывался у участников даже на слабом мобильном интернете.
async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Выберите файл с картинкой')
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Не удалось прочитать картинку. Попробуйте другой файл (JPEG или PNG)')
  }
  let side = 1280
  let quality = 0.85
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl
    side = Math.round(side * 0.8)
    quality -= 0.07
  }
  throw new Error('Картинку не удалось сжать до допустимого размера. Попробуйте другую')
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#c6f432]" />
      <span>
        <span className="block font-bold">{label}</span>
        <span className="block text-sm text-white/70">{hint}</span>
      </span>
    </label>
  )
}

const ICON_BUTTON =
  'grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10'

function QuestionCard({ question, number, total, defaultTime, onChange, onRemove, onMove, onError }) {
  const fileRef = useRef(null)
  const patch = (changes) => onChange({ ...question, ...changes })

  function setType(type) {
    if (type === question.type) return
    // При переходе к одиночному выбору оставляем отмеченным только первый правильный вариант.
    const firstCorrect = Math.max(0, question.options.findIndex((o) => o.isCorrect))
    const options = type === 'single'
      ? question.options.map((o, i) => ({ ...o, isCorrect: i === firstCorrect }))
      : question.options
    patch({ type, options })
  }

  function markCorrect(key, checked) {
    patch({
      options: question.options.map((o) =>
        question.type === 'single'
          ? { ...o, isCorrect: o.key === key }
          : o.key === key ? { ...o, isCorrect: checked } : o
      ),
    })
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      patch({ image: await compressImage(file) })
    } catch (err) {
      onError(`Вопрос ${number}: ${err.message}`)
    }
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-display text-lg font-extrabold">Вопрос {number}</h3>
        <button type="button" className={ICON_BUTTON} onClick={() => onMove(-1)} disabled={number === 1} aria-label={`Поднять вопрос ${number} выше`}>
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
        <button type="button" className={ICON_BUTTON} onClick={() => onMove(1)} disabled={number === total} aria-label={`Опустить вопрос ${number} ниже`}>
          <ArrowDown className="size-5" aria-hidden="true" />
        </button>
        <button type="button" className={ICON_BUTTON} onClick={onRemove} aria-label={`Удалить вопрос ${number}`}>
          <Trash2 className="size-5" aria-hidden="true" />
        </button>
      </div>

      <Field label="Текст вопроса">
        <textarea
          className={`${INPUT_CLASS} min-h-20 resize-y`}
          value={question.text}
          onChange={(e) => patch({ text: e.target.value })}
          maxLength={500}
          placeholder="Например: какая планета самая большая в Солнечной системе?"
        />
      </Field>

      {question.image ? (
        <div className="relative w-fit">
          <img src={question.image} alt={`Картинка к вопросу ${number}`} className="max-h-56 rounded-2xl bg-black/30" />
          <button
            type="button"
            onClick={() => patch({ image: null })}
            className="absolute right-2 top-2 grid size-11 place-items-center rounded-xl bg-slate-950/85 text-white hover:bg-slate-950"
            aria-label={`Убрать картинку из вопроса ${number}`}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-5" aria-hidden="true" />
            Добавить картинку
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Тип ответа">
          <select className={INPUT_CLASS} value={question.type} onChange={(e) => setType(e.target.value)}>
            <option value="single">Один правильный</option>
            <option value="multiple">Несколько правильных</option>
          </select>
        </Field>
        <Field label="Время, сек">
          <input
            className={INPUT_CLASS}
            inputMode="numeric"
            value={question.timeLimit ?? ''}
            onChange={(e) => patch({ timeLimit: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            placeholder={`${defaultTime} (как в квизе)`}
          />
        </Field>
        <Field label="Баллы">
          <input
            className={INPUT_CLASS}
            inputMode="numeric"
            value={question.points}
            onChange={(e) => patch({ points: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-white/80">
          Варианты ответа — отметьте {question.type === 'single' ? 'правильный' : 'все правильные'}
        </legend>
        {question.options.map((option, i) => (
          <div key={option.key} className="flex items-center gap-2">
            <label className={`grid size-12 shrink-0 cursor-pointer place-items-center rounded-xl ${option.isCorrect ? 'bg-accent/20 ring-2 ring-accent' : 'bg-white/10'}`}>
              <input
                type={question.type === 'single' ? 'radio' : 'checkbox'}
                name={`correct-${question.key}`}
                checked={option.isCorrect}
                onChange={(e) => markCorrect(option.key, e.target.checked)}
                className="size-5 accent-[#c6f432]"
                aria-label={`Вариант ${i + 1} правильный`}
              />
            </label>
            <input
              className={INPUT_CLASS}
              value={option.text}
              onChange={(e) =>
                patch({ options: question.options.map((o) => (o.key === option.key ? { ...o, text: e.target.value } : o)) })
              }
              maxLength={200}
              placeholder={`Вариант ${i + 1}`}
              aria-label={`Текст варианта ${i + 1}`}
            />
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={question.options.length <= 2}
              onClick={() => patch({ options: question.options.filter((o) => o.key !== option.key) })}
              aria-label={`Удалить вариант ${i + 1}`}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ))}
        {question.options.length < 6 && (
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => patch({ options: [...question.options, { key: nextKey(), text: '', isCorrect: false }] })}
          >
            <Plus className="size-5" aria-hidden="true" />
            Вариант
          </Button>
        )}
      </fieldset>
    </Panel>
  )
}

export default function QuizEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState(id ? null : EMPTY_QUIZ)
  const [questions, setQuestions] = useState(() => (id ? [] : [emptyQuestion()]))
  const [categories, setCategories] = useState([])
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)
  const errorRef = useRef(null)

  useEffect(() => {
    api('/categories')
      .then((data) => setCategories(data.categories))
      .catch((err) => setError(`Не удалось загрузить категории: ${err.message}`))
    if (!id) return
    api(`/quizzes/${id}`)
      .then(({ quiz: loaded }) => {
        const { questions: loadedQuestions, ...settings } = loaded
        setQuiz({ ...settings, categoryId: settings.categoryId ?? '' })
        setQuestions(loadedQuestions.map((q) => ({
          ...q,
          key: nextKey(),
          timeLimit: q.timeLimit ?? '',
          options: q.options.map((o) => ({ ...o, key: nextKey() })),
        })))
      })
      .catch((err) => setLoadError(`Не удалось открыть квиз: ${err.message}`))
  }, [id])

  function showError(message) {
    setError(message)
    requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  function moveQuestion(index, delta) {
    setQuestions((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(index + delta, 0, moved)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    const body = {
      ...quiz,
      categoryId: quiz.categoryId === '' ? null : Number(quiz.categoryId),
      timePerQuestion: Number(quiz.timePerQuestion),
      questions: questions.map((q) => ({
        text: q.text,
        image: q.image,
        type: q.type,
        timeLimit: q.timeLimit === '' ? null : Number(q.timeLimit),
        points: Number(q.points),
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      })),
    }
    try {
      if (id) await api(`/quizzes/${id}`, { method: 'PUT', body })
      else await api('/quizzes', { method: 'POST', body })
      navigate('/dashboard')
    } catch (err) {
      showError(err.message)
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-4 pt-6">
        <ErrorNote>{loadError}</ErrorNote>
        <LinkButton to="/dashboard" variant="ghost">В кабинет</LinkButton>
      </div>
    )
  }
  if (!quiz) return <Spinner />

  const set = (key) => (value) => setQuiz((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pt-4">
      <LinkButton to="/dashboard" variant="ghost" className="w-fit !min-h-11 !py-2 text-sm">
        <ArrowLeft className="size-4" aria-hidden="true" />
        В кабинет
      </LinkButton>
      <h1 className="font-display text-3xl font-extrabold">{id ? 'Редактирование квиза' : 'Новый квиз'}</h1>

      <Panel className="flex flex-col gap-4">
        <Field label="Название">
          <input className={INPUT_CLASS} value={quiz.title} onChange={(e) => set('title')(e.target.value)} maxLength={120} placeholder="Например: IT-квиз на день рождения компании" />
        </Field>
        <Field label="Описание (необязательно)">
          <textarea className={`${INPUT_CLASS} min-h-20 resize-y`} value={quiz.description} onChange={(e) => set('description')(e.target.value)} maxLength={500} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Категория вопросов">
            <select className={INPUT_CLASS} value={quiz.categoryId} onChange={(e) => set('categoryId')(e.target.value)}>
              <option value="">Без категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Время на вопрос, сек" hint="От 5 до 300. Для отдельного вопроса можно задать своё">
            <input
              className={INPUT_CLASS}
              inputMode="numeric"
              value={quiz.timePerQuestion}
              onChange={(e) => set('timePerQuestion')(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
          </Field>
        </div>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-sm font-semibold text-white/80">Правила проведения</legend>
          <Toggle label="Бонус за скорость" hint="Чем быстрее верный ответ, тем больше баллов (от 50 до 100%)" checked={quiz.speedBonus} onChange={set('speedBonus')} />
          <Toggle label="Автопереход" hint="Следующий вопрос включается сам через несколько секунд после разбора" checked={quiz.autoAdvance} onChange={set('autoAdvance')} />
          <Toggle label="Перемешивать вопросы" hint="Каждая игра идёт в новом порядке" checked={quiz.shuffleQuestions} onChange={set('shuffleQuestions')} />
          <Toggle label="Перемешивать варианты" hint="Порядок ответов меняется от игры к игре" checked={quiz.shuffleOptions} onChange={set('shuffleOptions')} />
        </fieldset>
      </Panel>

      {questions.map((question, index) => (
        <QuestionCard
          key={question.key}
          question={question}
          number={index + 1}
          total={questions.length}
          defaultTime={quiz.timePerQuestion}
          onChange={(next) => setQuestions((prev) => prev.map((q) => (q.key === next.key ? next : q)))}
          onRemove={() => setQuestions((prev) => prev.filter((q) => q.key !== question.key))}
          onMove={(delta) => moveQuestion(index, delta)}
          onError={showError}
        />
      ))}

      <Button variant="ghost" onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])} disabled={questions.length >= 100}>
        <Plus className="size-5" aria-hidden="true" />
        Добавить вопрос
      </Button>

      <div ref={errorRef}>
        <ErrorNote>{error}</ErrorNote>
      </div>

      <div className="sticky bottom-3 z-10">
        <Button onClick={save} loading={saving} className="w-full text-lg shadow-2xl shadow-black/60">
          {!saving && <Save className="size-5" aria-hidden="true" />}
          Сохранить квиз
        </Button>
      </div>
    </div>
  )
}
