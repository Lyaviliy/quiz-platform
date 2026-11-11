export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = new Error(data?.error || `Ошибка сервера (${res.status})`)
    error.status = res.status
    throw error
  }
  return data
}

export function formatDate(sqlDate) {
  if (!sqlDate) return ''
  const date = new Date(sqlDate.replace(' ', 'T') + 'Z')
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function plural(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`
  return `${n} ${many}`
}
