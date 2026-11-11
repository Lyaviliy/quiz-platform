import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ListChecks, Timer, Trophy } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Button, ErrorNote, LinkButton, Panel } from '../components/ui.jsx'

const FEATURES = [
  { icon: ListChecks, title: 'Соберите квиз', text: 'Вопросы с текстом и картинками, один или несколько правильных ответов.' },
  { icon: Timer, title: 'Запустите комнату', text: 'Участники заходят с телефона по коду или QR — без установки и регистрации.' },
  { icon: Trophy, title: 'Наградите лучших', text: 'Баллы считаются на лету, в финале — пьедестал и общий лидерборд.' },
]

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  async function handleJoin(event) {
    event.preventDefault()
    if (code.length !== 6) return setError('Код комнаты состоит из 6 цифр')
    setChecking(true)
    setError(null)
    try {
      await api(`/live/${code}`)
      navigate(`/play/${code}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  const organizerLink = !user ? '/register' : user.role === 'organizer' ? '/quizzes/new' : '/dashboard'

  return (
    <div className="flex flex-col gap-10 pt-6 sm:pt-12">
      <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] text-balance sm:text-6xl">
            Квизы, от которых зал <span className="text-accent">оживает</span>
          </h1>
          <p className="max-w-xl text-lg text-white/80">
            Проводите викторины в реальном времени на митапах, конференциях и корпоративах.
            Вопрос появляется у всех одновременно, а таблица лидеров обновляется после каждого ответа.
          </p>
          <div>
            <LinkButton to={organizerLink} variant="ghost">
              {user?.role === 'organizer' ? 'Создать квиз' : user ? 'Открыть кабинет' : 'Я организатор — создать квиз'}
              <ArrowRight className="size-5" aria-hidden="true" />
            </LinkButton>
          </div>
        </div>

        <Panel className="!p-6 sm:!p-8">
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <label htmlFor="room-code" className="font-display text-xl font-extrabold">
              Войти в игру
            </label>
            <input
              id="room-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000000"
              aria-describedby="room-code-hint"
              className="min-h-16 w-full rounded-2xl border-2 border-white/20 bg-black/30 text-center font-display text-4xl font-extrabold tracking-[0.25em] text-white placeholder:text-white/25 focus:border-accent focus:outline-none"
            />
            <p id="room-code-hint" className="text-sm text-white/70">
              Шестизначный код комнаты показывает организатор на экране.
            </p>
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" loading={checking} className="text-lg">
              Присоединиться
            </Button>
          </form>
        </Panel>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }, i) => (
          <Panel key={title}>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-accent">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-display text-sm font-extrabold text-white/60">0{i + 1}</span>
            </div>
            <h2 className="mb-1 text-lg font-extrabold">{title}</h2>
            <p className="text-white/75">{text}</p>
          </Panel>
        ))}
      </section>
    </div>
  )
}
