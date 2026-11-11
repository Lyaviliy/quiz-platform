import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch((err) => console.error('Не удалось проверить вход', err))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (form) => {
    const data = await api('/auth/login', { method: 'POST', body: form })
    setUser(data.user)
    return data.user
  }, [])
  const register = useCallback(async (form) => {
    const data = await api('/auth/register', { method: 'POST', body: form })
    setUser(data.user)
    return data.user
  }, [])
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
