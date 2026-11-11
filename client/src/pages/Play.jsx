import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CircleCheck, CircleX, Clock, PartyPopper } from 'lucide-react'
import { useRoom } from '../useRoom.js'
import { useAuth } from '../auth.jsx'
import { Button, Centered, ErrorNote, INPUT_CLASS, LinkButton, Logo, Panel, Spinner } from '../components/ui.jsx'
import { Countdown, Leaderboard, OfflineBanner, QuestionBoard, WaitingDots } from '../components/game.jsx'

function NicknameForm({ code, error, onJoin }) {
  const { user } = useAuth()
  const [nickname, setNickname] = useState(user?.name?.slice(0, 20) || '')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!nickname.trim()) return
    setBusy(true)
    await onJoin(nickname)
    setBusy(false)
  }

  return (
    <Centered>
      <Logo />
      <Panel className="w-full text-left">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-bold text-accent">Комната {code}</p>
            <label htmlFor="nickname" className="font-display text-2xl font-extrabold">Как вас зовут?</label>
          </div>
          <input
            id="nickname"
            className={`${INPUT_CLASS} text-lg`}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            placeholder="Имя на табло"
            autoFocus
          />
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" loading={busy} disabled={!nickname.trim()} className="text-lg">
            Войти в игру
          </Button>
          {!user && (
            <p className="text-sm text-white/70">
              Играть можно без регистрации. Чтобы результат сохранился в вашей истории, сначала войдите в аккаунт.
            </p>
          )}
        </form>
      </Panel>
    </Centered>
  )
}

function ResultBanner({ state }) {
  const { myResult, myAnswer } = state
  if (myResult?.correct) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl bg-emerald-700 px-4 py-3 animate-pop">
        <CircleCheck className="size-8 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-lg font-extrabold">Верно!</p>
          <p className="font-bold">+{myResult.points} баллов</p>
        </div>
      </div>
    )
  }
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl bg-rose-700 px-4 py-3 animate-pop">
      {myAnswer ? <CircleX className="size-8 shrink-0" aria-hidden="true" /> : <Clock className="size-8 shrink-0" aria-hidden="true" />}
      <div>
        <p className="text-lg font-extrabold">{myAnswer ? 'Неверно' : 'Вы не успели ответить'}</p>
        <p className="font-bold">Правильный ответ отмечен галочкой</p>
      </div>
    </div>
  )
}

function Question({ state, send }) {
  const { question, myAnswer } = state
  const [picked, setPicked] = useState([])
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)

  // Новый вопрос — чистый выбор.
  useEffect(() => {
    setPicked([])
    setError(null)
  }, [question.index])

  async function submit(selected) {
    setSending(true)
    setError(null)
    const reply = await send('player:answer', { index: question.index, selected })
    if (!reply.ok) setError(reply.error)
    setSending(false)
  }

  function toggle(id) {
    if (question.type === 'single') {
      setPicked([id])
      submit([id])
      return
    }
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const answered = Boolean(myAnswer)
  return (
    <div className="flex flex-col gap-4">
      <Countdown endsAt={question.endsAt} clockOffset={state.clockOffset} duration={question.duration} />
      <QuestionBoard
        question={question}
        selected={answered ? myAnswer : picked}
        onToggle={toggle}
        locked={answered || sending}
      />
      <ErrorNote>{error}</ErrorNote>
      {answered ? (
        <p role="status" className="flex items-center justify-center gap-3 rounded-2xl bg-white/10 px-4 py-4 text-lg font-bold">
          Ответ принят, ждём остальных <WaitingDots />
        </p>
      ) : question.type === 'multiple' && (
        <Button onClick={() => submit(picked)} disabled={picked.length === 0} loading={sending} className="sticky bottom-3 text-lg shadow-2xl shadow-black/60">
          Ответить
        </Button>
      )}
    </div>
  )
}

export default function Play() {
  const { code } = useParams()
  const { user } = useAuth()
  const { state, status, error, online, send, join } = useRoom(code, 'player')

  if (status === 'needNickname') return <NicknameForm code={code} error={error} onJoin={join} />
  if (status === 'error' || status === 'closed') {
    return (
      <Centered>
        <Logo />
        <p className="text-lg text-white/85">{error}</p>
        <LinkButton to="/">На главную</LinkButton>
      </Centered>
    )
  }
  if (!state) return <Spinner label="Подключаемся к комнате…" />

  const { phase, me, question } = state
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-4">
      <OfflineBanner online={online} />
      <header className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-2.5 ring-1 ring-white/10">
        <span className="min-w-0">
          <span className="block truncate font-extrabold">{me.nickname}</span>
          <span className="block truncate text-sm text-white/70">
            {question ? `Вопрос ${question.index + 1} из ${state.total}` : state.title}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-display text-xl font-extrabold text-accent tabular-nums">{me.score}</span>
          <span className="block text-sm text-white/70">баллов</span>
        </span>
      </header>

      <main className="flex flex-1 flex-col gap-4">
        {phase === 'lobby' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <PartyPopper className="size-14 text-accent" aria-hidden="true" />
            <h1 className="font-display text-3xl font-extrabold">Вы в игре!</h1>
            <p className="text-lg text-white/80">«{state.title}» начнётся, как только организатор нажмёт «Старт». Не закрывайте страницу.</p>
            <WaitingDots />
            <p className="text-sm text-white/70">Уже подключились: {state.playerCount}</p>
          </div>
        )}

        {phase === 'question' && <Question state={state} send={send} />}

        {phase === 'reveal' && (
          <>
            <ResultBanner state={state} />
            <QuestionBoard question={question} reveal={state.reveal} selected={state.myAnswer || []} />
            <Panel>
              <h2 className="mb-3 flex items-center justify-between font-display text-lg font-extrabold">
                Лидеры
                {me.place && <span className="text-sm text-white/80">вы на {me.place} месте</span>}
              </h2>
              <Leaderboard rows={state.leaderboard} meId={me.id} limit={5} />
            </Panel>
          </>
        )}

        {phase === 'finished' && (
          <>
            <div className="flex flex-col items-center gap-1 py-4 text-center animate-pop">
              <p className="text-lg font-bold text-white/80">Квиз завершён. Ваше место</p>
              <p className="font-display text-7xl font-extrabold text-accent">{me.place}</p>
              <p className="text-lg font-bold">из {state.playerCount} · {me.score} баллов</p>
            </div>
            <Panel>
              <h2 className="mb-3 font-display text-lg font-extrabold">Таблица лидеров</h2>
              <Leaderboard rows={state.leaderboard} meId={me.id} />
            </Panel>
            <div className="flex flex-wrap justify-center gap-3">
              {user && <LinkButton to={`/results/${state.sessionId}`}>Мои ответы</LinkButton>}
              <LinkButton to="/" variant="ghost">На главную</LinkButton>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
