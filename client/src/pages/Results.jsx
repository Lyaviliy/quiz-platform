import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { api, formatDate, plural } from '../api.js'
import { ErrorNote, LinkButton, Panel, Spinner } from '../components/ui.jsx'
import { Leaderboard, Podium } from '../components/game.jsx'

function OptionRow({ option, mark, total }) {
  const share = total ? Math.round((option.count / total) * 100) : null
  return (
    <li className={`flex items-center gap-2 rounded-xl px-3 py-2 ${option.isCorrect ? 'bg-emerald-700' : 'bg-white/10'}`}>
      {option.isCorrect
        ? <Check className="size-5 shrink-0" strokeWidth={3} aria-label="Правильный ответ" />
        : <span className="size-5 shrink-0" />}
      <span className="flex-1 font-semibold">{option.text}</span>
      {mark && <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-bold">ваш ответ</span>}
      {share !== null && <span className="text-sm font-bold tabular-nums">{option.count} · {share}%</span>}
    </li>
  )
}

export default function Results() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api(`/sessions/${id}/results`)
      .then(setData)
      .catch((err) => setError(`Не удалось загрузить результаты: ${err.message}`))
  }, [id])

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4 pt-6">
        <ErrorNote>{error}</ErrorNote>
        <LinkButton to="/" variant="ghost">На главную</LinkButton>
      </div>
    )
  }
  if (!data) return <Spinner />

  const { session, leaderboard, questions, myAnswers } = data
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-4">
      <div>
        <p className="text-sm font-bold text-accent">
          {session.status === 'aborted' ? 'Игра прервана' : 'Результаты квиза'} · {formatDate(session.date)}
        </p>
        <h1 className="font-display text-3xl font-extrabold text-balance">{session.title}</h1>
        <p className="mt-1 text-white/70">
          {plural(leaderboard.length, 'участник', 'участника', 'участников')} · {plural(session.questionCount, 'вопрос', 'вопроса', 'вопросов')}
        </p>
      </div>

      <Podium rows={leaderboard} />

      <Panel>
        <h2 className="mb-3 font-display text-lg font-extrabold">Таблица лидеров</h2>
        <Leaderboard rows={leaderboard} />
      </Panel>

      {questions && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-extrabold">Разбор по вопросам</h2>
          {questions.map((q, i) => (
            <Panel key={i}>
              <p className="text-sm font-bold text-white/70">
                Вопрос {i + 1} · верно ответили {q.correct} из {q.answered}
              </p>
              <h3 className="mb-3 text-lg font-extrabold">{q.text}</h3>
              <ul className="flex flex-col gap-1.5">
                {q.options.map((o, j) => <OptionRow key={j} option={o} total={q.answered} />)}
              </ul>
            </Panel>
          ))}
        </section>
      )}

      {myAnswers && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-extrabold">Мои ответы</h2>
          {myAnswers.map((q, i) => (
            <Panel key={i}>
              <p className={`flex items-center gap-1.5 text-sm font-bold ${q.isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                {q.isCorrect ? <Check className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
                Вопрос {i + 1} · {q.isCorrect ? `верно, +${q.points}` : q.answered ? 'неверно' : 'нет ответа'}
              </p>
              <h3 className="mb-3 text-lg font-extrabold">{q.text}</h3>
              <ul className="flex flex-col gap-1.5">
                {q.options.map((o, j) => <OptionRow key={j} option={o} mark={o.selected} />)}
              </ul>
            </Panel>
          ))}
        </section>
      )}

      <LinkButton to="/dashboard" variant="ghost" className="w-fit">В кабинет</LinkButton>
    </div>
  )
}
