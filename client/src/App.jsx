import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Layout from './components/Layout.jsx'
import { Centered, LinkButton, Spinner } from './components/ui.jsx'
import Home from './pages/Home.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import QuizEditor from './pages/QuizEditor.jsx'
import Host from './pages/Host.jsx'
import Play from './pages/Play.jsx'
import Results from './pages/Results.jsx'

function Private({ organizer = false, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (organizer && user.role !== 'organizer') return <Navigate to="/dashboard" replace />
  return children
}

function NotFound() {
  return (
    <Centered>
      <p className="font-display text-6xl font-extrabold text-accent">404</p>
      <p className="text-lg text-white/80">Такой страницы нет.</p>
      <LinkButton to="/">На главную</LinkButton>
    </Centered>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="dashboard" element={<Private><Dashboard /></Private>} />
        <Route path="quizzes/new" element={<Private organizer><QuizEditor /></Private>} />
        <Route path="quizzes/:id" element={<Private organizer><QuizEditor /></Private>} />
        <Route path="results/:id" element={<Results />} />
      </Route>
      <Route path="host/:code" element={<Private organizer><Host /></Private>} />
      <Route path="play/:code" element={<Play />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
