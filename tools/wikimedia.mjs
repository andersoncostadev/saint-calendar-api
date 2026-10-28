export const USER_AGENT = 'SaintCalendarApi/1.0 (https://catholic-pomodoro.pages.dev; one-time calendar snapshot)'
const PAUSE_MS = 1500

export async function getJson(url) {
  const body = url.search.slice(1)
  const endpoint = `${url.origin}${url.pathname}`
  let status = 0
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(PAUSE_MS)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(60000),
      })
      if (response.ok) return response.json()
      status = response.status
    } catch (error) {
      status = error.cause?.code ?? error.name ?? 'falha'
    }
    await sleep(10000 * (attempt + 1))
  }
  throw new Error(`${endpoint} respondeu ${status}`)
}

export function chunk(list, size) {
  const result = []
  for (let index = 0; index < list.length; index += size) result.push(list.slice(index, index + size))
  return result
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
