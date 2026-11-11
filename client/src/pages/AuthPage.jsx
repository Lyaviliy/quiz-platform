import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Mic, Smartphone } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { Button, ErrorNote, Field, INPUT_CLASS, Panel } from '../components/ui.jsx'

const ROLES = [
  { value: 'participant', icon: Smartphone, title: 'Участник', text: 'Отвечаю на вопросы и слежу за своей историей игр' },
  { value: 'organizer', icon: Mic, title: 'Организатор', text: 'Создаю квизы и провожу их на мероприятиях' },
]

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'participant' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const target = location.state?.from || '/dashboard'
  if (user && !busy) return <Navigate to={target} replace />

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isRegister) await register(form)
      else await login({ email: form.email, password: form.password })
      navigate(target, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md pt-6 sm:pt-10">
      <Panel>
        <h1 className="mb-5 font-display text-2xl font-extrabold">
          {isRegister ? 'Регистрация' : 'Вход'}
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isRegister && (
            <>
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-white/80">Кто вы?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ROLES.map(({ value, icon: Icon, title, text }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer flex-col gap-1 rounded-2xl border-2 p-3 transition has-focus-visible:outline-3 has-focus-visible:outline-accent ${
                        form.role === value ? 'border-accent bg-accent/10' : 'border-white/15 bg-white/5 hover:border-white/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={value}
                        checked={form.role === value}
                        onChange={set('role')}
                        className="sr-only"
                      />
                      <span className="flex items-center gap-2 font-extrabold">
                        <Icon className="size-4 text-accent" aria-hidden="true" />
                        {title}
                      </span>
                      <span className="text-sm text-white/70">{text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Имя">
                <input className={INPUT_CLASS} value={form.name} onChange={set('name')} required minLength={2} maxLength={40} autoComplete="name" />
              </Field>
            </>
          )}
          <Field label="Email">
            <input className={INPUT_CLASS} type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          </Field>
          <Field label="Пароль" hint={isRegister ? 'Не короче 6 символов' : undefined}>
            <input
              className={INPUT_CLASS}
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={6}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" loading={busy}>
            {isRegister ? 'Создать аккаунт' : 'Войти'}
          </Button>
        </form>
        <p className="mt-5 text-center text-white/75">
          {isRegister ? 'Уже есть аккаунт? ' : 'Ещё нет аккаунта? '}
          <Link
            to={isRegister ? '/login' : '/register'}
            state={location.state}
            className="font-bold text-accent underline underline-offset-4"
          >
            {isRegister ? 'Войти' : 'Зарегистрироваться'}
          </Link>
        </p>
      </Panel>
    </div>
  )
}
