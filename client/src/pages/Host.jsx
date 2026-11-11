import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { ArrowRight, Eye, Play, Users } from 'lucide-react'
import { useRoom } from '../useRoom.js'
import { plural } from '../api.js'
import { Button, Centered, ErrorNote, LinkButton, Logo, Panel, Spinner } from '../components/ui.jsx'
import { Countdown, Leaderboard, OfflineBanner, Podium, QuestionBoard, SecondsLeft, WaitingDots } from '../components/game.jsx'

function Lobby({ state, onStart, busy }) {
  const joinUrl = `${window.location.origin}/play/${state.code}`
  const [qr, setQr] = useState(null)

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#140f2d', light: '#ffffff' } })
      .then(setQr)
      .catch((err) => console.error('Не удалось построить QR-код', err)) // код комнаты остаётся на экране
  }, [joinUrl])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Panel className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg font-bold text-white/80">Откройте {window.location.host} и введите код</p>
        <p className="font-display text-6xl font-extrabold tracking-[0.12em] text-accent sm:text-7xl" aria-label={`Код комнаты ${state.code.split('').join(' ')}`}>
          {state.code}
        </p>
        {qr && <img src={qr} alt="QR-код для входа в комнату" className="size-52 rounded-2xl sm:size-60" />}
        <p className="text-white/70">или наведите камеру телефона на QR-код</p>
      </Panel>

      <Panel className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
            <Users className="size-6 text-accent" aria-hidden="true" />
            Участники: {state.players.length}
          </h2>
          <WaitingDots />
        </div>
        {state.players.length === 0 ? (
          <p className="flex-1 text-white/70">Ждём первых игроков. Имена появятся здесь, как только кто-то подключится.</p>
        ) : (
          <ul className="flex flex-1 flex-wrap content-start gap-2" aria-live="polite">
            {state.players.map((p) => (
              <li key={p.id} className={`animate-pop rounded-full px-3.5 py-1.5 font-bold ${p.connected ? 'bg-white/15' : 'bg-white/5 text-white/50 line-through'}`}>
                {p.nickname}
              </li>
            ))}
          </ul>
        )}
        <Button onClick={onStart} loading={busy} disabled={state.players.length === 0} className="text-lg">
          {!busy && <Play className="size-5" aria-hidden="true" />}
          Начать квиз
        </Button>
        <p className="text-center text-sm text-white/70">
          В квизе {plural(state.total, 'вопрос', 'вопроса', 'вопросов')}. Опоздавшие смогут подключиться по ходу игры.
        </p>
      </Panel>
    </div>
  )
}

export default function Host() {
  const { code } = useParams()
  const { state, status, error, online, send } = useRoom(code, 'host')
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function act(event) {
    setBusy(true)
    setActionError(null)
    const reply = await send(event)
    if (!reply.ok) setActionError(reply.error)
    setBusy(false)
  }

  function endGame() {
    const question = state.phase === 'lobby'
      ? 'Закрыть комнату? Участники будут отключены.'
      : 'Завершить квиз досрочно? Итоги подведутся по уже набранным баллам.'
    if (window.confirm(question)) act('host:end')
  }

  if (status === 'error' || status === 'closed') {
    return (
      <Centered>
        <Logo />
        <p className="text-lg text-white/85">{status === 'closed' ? 'Комната закрыта.' : error}</p>
        <LinkButton to="/dashboard">В кабинет</LinkButton>
      </Centered>
    )
  }
  if (!state) return <Spinner label="Подключаемся к комнате…" />

  const { phase, question } = state
  const isLast = question && question.index + 1 >= state.total

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-4">
      <OfflineBanner online={online} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-extrabold">{state.title}</p>
          <p className="text-sm text-white/70">
            Код комнаты: <span className="font-extrabold tracking-widest text-accent">{state.code}</span>
            {' · '}
            {plural(state.playerCount, 'участник', 'участника', 'участников')}
          </p>
        </div>
        {phase !== 'finished' && (
          <Button variant="ghost" className="!min-h-11 !py-2 text-sm" onClick={endGame} disabled={busy}>
            {phase === 'lobby' ? 'Закрыть комнату' : 'Завершить досрочно'}
          </Button>
        )}
      </header>

      <ErrorNote>{actionError}</ErrorNote>

      <main className="flex flex-1 flex-col gap-5">
        {phase === 'lobby' && <Lobby state={state} onStart={() => act('host:start')} busy={busy} />}

        {(phase === 'question' || phase === 'reveal') && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm font-bold text-white/80">
                <span>Вопрос {question.index + 1} из {state.total} · {question.points} баллов</span>
                <span aria-live="polite">Ответили: {state.answeredCount} из {state.playerCount}</span>
              </div>
              {phase === 'question' && (
                <Countdown endsAt={question.endsAt} clockOffset={state.clockOffset} duration={question.duration} />
              )}
            </div>

            <div className={`grid flex-1 content-start gap-6 ${phase === 'reveal' ? 'lg:grid-cols-[1.5fr_1fr]' : ''}`}>
              <QuestionBoard question={question} reveal={state.reveal} big />
              {phase === 'reveal' && (
                <Panel className="h-fit">
                  <h2 className="mb-3 font-display text-lg font-extrabold">Лидеры</h2>
                  <Leaderboard rows={state.leaderboard} limit={5} />
                </Panel>
              )}
            </div>

            <div className="sticky bottom-3 flex justify-end">
              {phase === 'question' ? (
                <Button variant="ghost" className="bg-ink-2 ring-1 ring-white/20" onClick={() => act('host:skip')} disabled={busy}>
                  <Eye className="size-5" aria-hidden="true" />
                  Показать ответ сейчас
                </Button>
              ) : (
                <Button onClick={() => act('host:next')} disabled={busy} className="text-lg shadow-2xl shadow-black/60">
                  {isLast ? 'Показать итоги' : 'Следующий вопрос'}
                  {state.nextAt && (
                    <span className="tabular-nums">
                      (<SecondsLeft until={state.nextAt} clockOffset={state.clockOffset} />)
                    </span>
                  )}
                  <ArrowRight className="size-5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </>
        )}

        {phase === 'finished' && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pt-4">
            <h1 className="text-center font-display text-3xl font-extrabold sm:text-4xl">Победители</h1>
            <Podium rows={state.leaderboard} />
            <Panel>
              <h2 className="mb-3 font-display text-lg font-extrabold">Итоговая таблица</h2>
              <Leaderboard rows={state.leaderboard} />
            </Panel>
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton to={`/results/${state.sessionId}`}>Разбор по вопросам</LinkButton>
              <LinkButton to="/dashboard" variant="ghost">В кабинет</LinkButton>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
