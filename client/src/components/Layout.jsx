import { Link, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { Logo } from './ui.jsx'

const NAV_LINK =
  'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white/85 hover:bg-white/10 hover:text-white'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await logout()
      navigate('/')
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <Link to="/" aria-label="КвизПульс — на главную">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {user ? (
            <>
              <Link to="/dashboard" className={NAV_LINK}>
                <UserRound className="size-4" aria-hidden="true" />
                <span className="max-w-28 truncate">{user.name}</span>
              </Link>
              <button type="button" onClick={handleLogout} className={NAV_LINK} aria-label="Выйти из аккаунта">
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Выйти</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={NAV_LINK}>Войти</Link>
              <Link to="/register" className={`${NAV_LINK} bg-white/10`}>Регистрация</Link>
            </>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
