import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { api, formatDate, plural } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Button, ErrorNote, LinkButton, Panel, Spinner } from '../components/ui.jsx'

function Empty({ children }) {
  return <Panel className="text-center text-white/75">{children}</Panel>
}

function QuizCard({ quiz, onChanged, onError }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)

  async function launch() {
    setBusy('launch')
    try {
      const { code } = await api(`/quizzes/${quiz.id}/sessions`, { method: 'POST' })
      navigate(`/host/${code}`)
    } catch (err) {
      onError(err.message)
      setBusy(null)
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить квиз «${quiz.title}»? Результаты уже проведённых игр сохранятся.`)) return
    setBusy('remove')
    try {
      await api(`/quizzes/${quiz.id}`, { method: 'DELETE' })
      onChanged()
    } catch (err) {
      onError(err.message)
      setBusy(null)
    }
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex-1">
        {quiz.category && (
          <p className="mb-2 w-fit rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/80">{quiz.category}</p>
        )}
        <h3 className="text-xl font-extrabold text-balance">{quiz.title}</h3>
        {quiz.description && <p className="mt-1 line-clamp-2 text-white/70">{quiz.description}</p>}
        <p className="mt-2 text-sm text-white/70">
          {plural(quiz.questionCount, 'вопрос', 'вопроса', 'вопросов')} · {quiz.timePerQuestion} сек на вопрос ·{' '}
          проведён {plural(quiz.playedCount, 'раз', 'раза', 'раз')}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={launch}
          loading={busy === 'launch'}
          disabled={quiz.questionCount === 0 || busy !== null}
          title={quiz.questionCount === 0 ? 'Сначала добавьте вопросы' : undefined}
        >
          <Play className="size-5" aria-hidden="true" />
          Запустить
        </Button>
        <LinkButton to={`/quizzes/${quiz.id}`} variant="ghost" className="!px-3.5" aria-label={`Редактировать квиз «${quiz.title}»`}>
          <Pencil className="size-5" aria-hidden="true" />
        </LinkButton>
        <Button variant="ghost" className="!px-3.5" onClick={remove} loading={busy === 'remove'} disabled={busy !== null} aria-label={`Удалить квиз «${quiz.title}»`}>
          {busy !== 'remove' && <Trash2 className="size-5" aria-hidden="true" />}
        </Button>
      </div>
    </Panel>
  )
}

function HistoryRow({ to, title, date, children }) {
  return (
    <li>
      <Link to={to} className="flex min-h-16 items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 transition hover:bg-white/10">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold">{title}</span>
          <span className="block text-sm text-white/70">{formatDate(date)}</span>
        </span>
        <span className="shrink-0 text-right text-sm">{children}</span>
        <ChevronRight className="size-5 shrink-0 text-white/60" aria-hidden="true" />
      </Link>
    </li>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const isOrganizer = user.role === 'organizer'
  const [quizzes, setQuizzes] = useState(null)
  const [history, setHistory] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(isOrganizer ? 'quizzes' : 'played')

  const load = useCallback(async () => {
    try {
      const [historyData, quizData] = await Promise.all([
        api('/me/history'),
        isOrganizer ? api('/quizzes') : Promise.resolve({ quizzes: [] }),
      ])
      setHistory(historyData)
      setQuizzes(quizData.quizzes)
    } catch (err) {
      setError(`Не удалось загрузить кабинет: ${err.message}`)
    }
  }, [isOrganizer])

  useEffect(() => {
    load()
  }, [load])

  const tabs = [
    ...(isOrganizer ? [{ id: 'quizzes', label: 'Мои квизы' }, { id: 'hosted', label: 'Проведённые' }] : []),
    { id: 'played', label: 'Моё участие' },
  ]

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent">{isOrganizer ? 'Организатор' : 'Участник'}</p>
          <h1 className="font-display text-3xl font-extrabold">Личный кабинет</h1>
        </div>
        {isOrganizer ? (
          <LinkButton to="/quizzes/new">
            <Plus className="size-5" aria-hidden="true" />
            Новый квиз
          </LinkButton>
        ) : (
          <LinkButton to="/">Войти в игру по коду</LinkButton>
        )}
      </div>

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Разделы кабинета" className="flex gap-1 overflow-x-auto rounded-2xl bg-white/[0.06] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-4 text-sm font-extrabold transition ${
                tab === t.id ? 'bg-accent text-ink' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      {!history && !error && <Spinner />}

      {history && tab === 'quizzes' && (
        quizzes.length === 0 ? (
          <Empty>
            <p className="mb-4">У вас пока нет квизов. Создайте первый — это займёт пару минут.</p>
            <LinkButton to="/quizzes/new">Создать квиз</LinkButton>
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {quizzes.map((quiz) => (
              <QuizCard key={quiz.id} quiz={quiz} onChanged={load} onError={setError} />
            ))}
          </div>
        )
      )}

      {history && tab === 'hosted' && (
        history.hosted.length === 0 ? (
          <Empty>Здесь появятся квизы, которые вы провели.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.hosted.map((row) => (
              <HistoryRow key={row.sessionId} to={`/results/${row.sessionId}`} title={row.title} date={row.date}>
                <span className="block font-bold">{plural(row.playerCount, 'участник', 'участника', 'участников')}</span>
                {row.winner && <span className="block text-white/70">Победитель: {row.winner}</span>}
              </HistoryRow>
            ))}
          </ul>
        )
      )}

      {history && tab === 'played' && (
        history.played.length === 0 ? (
          <Empty>Вы ещё не участвовали в квизах. Введите код комнаты на главной, чтобы сыграть.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.played.map((row) => (
              <HistoryRow key={row.sessionId} to={`/results/${row.sessionId}`} title={row.title} date={row.date}>
                <span className="block font-display font-extrabold text-accent">
                  {row.place ? `${row.place} место` : 'Игра прервана'}
                </span>
                <span className="block text-white/70">{row.score} баллов · {plural(row.playerCount, 'игрок', 'игрока', 'игроков')}</span>
              </HistoryRow>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
