import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

function readToken(code) {
  try {
    return localStorage.getItem(`quiz:token:${code}`)
  } catch {
    return null // приватный режим: просто попросим имя заново
  }
}

function saveToken(code, token) {
  try {
    localStorage.setItem(`quiz:token:${code}`, token)
  } catch {
    // без localStorage игра работает, теряется только возврат после перезагрузки страницы
  }
}

/**
 * Подключение к живой комнате. Сервер присылает готовое состояние целиком,
 * поэтому после обрыва связи достаточно заново войти — экран восстановится сам.
 * status: connecting | needNickname | joined | error | closed
 */
export function useRoom(code, role) {
  const [state, setState] = useState(null)
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [online, setOnline] = useState(true)
  const socketRef = useRef(null)

  const send = useCallback((event, payload) => {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket) return resolve({ ok: false, error: 'Нет соединения с сервером' })
      socket.timeout(6000).emit(event, payload, (err, reply) => {
        resolve(err ? { ok: false, error: 'Сервер не ответил. Проверьте интернет' } : reply)
      })
    })
  }, [])

  const join = useCallback(async (nickname) => {
    if (role === 'host') {
      const reply = await send('host:join', { code })
      if (reply.ok) {
        setStatus('joined')
        setError(null)
      } else {
        setStatus('error')
        setError(reply.error)
      }
      return reply
    }
    const reply = await send('player:join', { code, nickname, token: readToken(code) })
    if (reply.ok) {
      saveToken(code, reply.token)
      setStatus('joined')
      setError(null)
    } else if (reply.needNickname) {
      setStatus('needNickname')
      setError(reply.error || null)
    } else {
      setStatus('error')
      setError(reply.error)
    }
    return reply
  }, [code, role, send])

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('connect', () => {
      setOnline(true)
      join()
    })
    socket.on('disconnect', () => setOnline(false))
    socket.on('connect_error', () => setOnline(false))
    socket.on('state', (next) => {
      // Часы телефона могут врать: таймер считаем от времени сервера.
      setState({ ...next, clockOffset: next.serverNow - Date.now() })
    })
    socket.on('closed', (payload) => {
      setStatus('closed')
      setError(payload?.reason || 'Комната закрыта')
    })
    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [join])

  return { state, status, error, online, send, join }
}
