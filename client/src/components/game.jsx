import { useEffect, useState } from 'react'
import { Check, Crown, WifiOff, X } from 'lucide-react'

// Цвет + буква: вариант можно назвать вслух («синий Б») и различить без цветового зрения.
const TILES = [
  { letter: 'А', bg: 'bg-rose-600', text: 'text-white', badge: 'bg-white/20' },
  { letter: 'Б', bg: 'bg-blue-600', text: 'text-white', badge: 'bg-white/20' },
  { letter: 'В', bg: 'bg-amber-400', text: 'text-slate-950', badge: 'bg-black/15' },
  { letter: 'Г', bg: 'bg-emerald-700', text: 'text-white', badge: 'bg-white/20' },
  { letter: 'Д', bg: 'bg-fuchsia-700', text: 'text-white', badge: 'bg-white/20' },
  { letter: 'Е', bg: 'bg-cyan-400', text: 'text-slate-950', badge: 'bg-black/15' },
]

function useRemaining(endsAt, clockOffset) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, endsAt - (now + clockOffset))
}

export function Countdown({ endsAt, clockOffset, duration }) {
  const remaining = useRemaining(endsAt, clockOffset)
  const seconds = Math.ceil(remaining / 1000)
  const share = Math.min(1, remaining / (duration * 1000))
  const urgent = seconds <= 5
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-rose-500' : 'bg-accent'}`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span
        role="timer"
        aria-label={`Осталось секунд: ${seconds}`}
        className={`w-12 text-right font-display text-2xl font-extrabold tabular-nums ${urgent ? 'text-rose-400' : 'text-white'}`}
      >
        {seconds}
      </span>
    </div>
  )
}

export function SecondsLeft({ until, clockOffset }) {
  return Math.ceil(useRemaining(until, clockOffset) / 1000)
}

/**
 * Вопрос с вариантами. Один компонент на все случаи: экран организатора (без onToggle),
 * телефон участника (с onToggle) и разбор (reveal — правильные ответы и распределение).
 */
export function QuestionBoard({ question, reveal, selected = [], onToggle, locked = false, big = false }) {
  const totalVotes = reveal ? Object.values(reveal.counts).reduce((a, b) => a + b, 0) : 0
  return (
    <div className="flex flex-col gap-4">
      <h1 className={`font-display font-extrabold leading-tight text-balance ${big ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl'}`}>
        {question.text}
      </h1>
      {question.type === 'multiple' && (
        <p className="w-fit rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white/90">
          Несколько правильных ответов
        </p>
      )}
      {question.image && (
        <img
          src={question.image}
          alt="Иллюстрация к вопросу"
          className={`w-full rounded-2xl bg-black/30 object-contain ${big ? 'max-h-[42vh]' : 'max-h-64'}`}
        />
      )}
      <div className={`grid gap-3 ${big ? 'sm:grid-cols-2' : ''}`}>
        {question.options.map((option, i) => {
          const tile = TILES[i % TILES.length]
          const isSelected = selected.includes(option.id)
          const isCorrect = reveal?.correct.includes(option.id)
          const dimmed = reveal ? !isCorrect : locked && !isSelected
          const votes = reveal?.counts[option.id] ?? 0
          const content = (
            <>
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg font-extrabold ${tile.badge}`} aria-hidden="true">
                {tile.letter}
              </span>
              <span className={`flex-1 text-left font-bold ${big ? 'text-xl sm:text-2xl' : 'text-lg'}`}>{option.text}</span>
              {reveal && (
                <span className="flex items-center gap-2 font-extrabold tabular-nums">
                  {isCorrect && <Check className="size-6" strokeWidth={3.5} aria-label="Правильный ответ" />}
                  {isSelected && !isCorrect && <X className="size-6" strokeWidth={3.5} aria-label="Ваш ответ неверный" />}
                  {votes}
                </span>
              )}
              {!reveal && isSelected && <Check className="size-6" strokeWidth={3.5} aria-label="Выбрано" />}
            </>
          )
          const className =
            `relative flex min-h-16 w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 transition ` +
            `${tile.bg} ${tile.text} ${dimmed ? 'opacity-55' : ''} ` +
            `${isSelected ? 'ring-4 ring-white' : ''} ${reveal && isCorrect ? 'ring-4 ring-accent' : ''}`
          const bar = reveal && totalVotes > 0 && (
            <span
              className="absolute inset-y-0 left-0 bg-black/20"
              style={{ width: `${(votes / totalVotes) * 100}%` }}
              aria-hidden="true"
            />
          )
          return onToggle ? (
            <button
              key={option.id}
              type="button"
              className={`${className} active:scale-[0.98] disabled:cursor-default`}
              onClick={() => onToggle(option.id)}
              disabled={locked || Boolean(reveal)}
              aria-pressed={isSelected}
            >
              {bar}
              <span className="relative flex w-full items-center gap-3">{content}</span>
            </button>
          ) : (
            <div key={option.id} className={className}>
              {bar}
              <span className="relative flex w-full items-center gap-3">{content}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PLACE_STYLE = {
  1: 'bg-amber-400 text-slate-950',
  2: 'bg-slate-300 text-slate-950',
  3: 'bg-orange-700 text-white',
}

export function Leaderboard({ rows, meId, limit }) {
  const shown = limit ? rows.slice(0, limit) : rows
  if (shown.length === 0) return <p className="text-white/70">Пока никто не набрал баллов.</p>
  return (
    <ol className="flex flex-col gap-2">
      {shown.map((row) => {
        const isMe = row.isMe || (meId != null && row.id === meId)
        return (
          <li
            key={`${row.place}-${row.nickname}`}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${isMe ? 'bg-accent text-ink' : 'bg-white/10'}`}
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl font-extrabold tabular-nums ${PLACE_STYLE[row.place] || 'bg-black/25 text-white'}`}>
              {row.place}
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">
              {row.nickname}
              {isMe && <span className="font-semibold"> (вы)</span>}
            </span>
            <span className="font-display font-extrabold tabular-nums">{row.score}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function Podium({ rows }) {
  const top = rows.slice(0, 3)
  if (top.length === 0) return null
  // Классическая расстановка: второе место слева, первое в центре, третье справа.
  const order = [top[1], top[0], top[2]].filter(Boolean)
  const height = { 1: 'h-40', 2: 'h-28', 3: 'h-20' }
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {order.map((row) => (
        <div
          key={row.place}
          className="flex w-28 flex-col items-center gap-2 animate-rise sm:w-40"
          style={{ animationDelay: `${(3 - row.place) * 0.25}s` }}
        >
          {row.place === 1 && <Crown className="size-9 text-amber-400" aria-hidden="true" />}
          <span className="w-full truncate text-center text-base font-extrabold sm:text-lg">{row.nickname}</span>
          <span className="font-display text-sm font-extrabold text-accent tabular-nums">{row.score}</span>
          <div className={`grid w-full place-items-start rounded-t-2xl pt-3 ${height[row.place]} ${PLACE_STYLE[row.place]}`}>
            <span className="w-full text-center font-display text-3xl font-extrabold">{row.place}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function OfflineBanner({ online }) {
  if (online) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-rose-700 px-4 py-2 text-sm font-bold text-white">
      <WifiOff className="size-4" aria-hidden="true" />
      Связь потеряна, переподключаемся…
    </div>
  )
}

export function WaitingDots() {
  return (
    <span className="inline-flex gap-1.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2.5 rounded-full bg-accent animate-dot" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </span>
  )
}
