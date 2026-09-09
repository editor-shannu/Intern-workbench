import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('workbench_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('workbench_token')
      localStorage.removeItem('workbench_user')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

/**
 * Consumes the chat SSE stream. onDelta fires per text chunk, onDone fires
 * once with { message_id, proposed_edits }, onError fires with a message.
 */
export async function streamChat(workspaceId, { message, model }, onDelta, onDone, onError) {
  const token = localStorage.getItem('workbench_token')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 180000) // 3 minutes timeout

  let resp
  try {
    resp = await fetch(`/api/workspaces/${workspaceId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ message, model }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    onError(e.name === 'AbortError' ? 'Request timed out (3m).' : 'Network error reaching the server.')
    return
  }

  if (!resp.ok || !resp.body) {
    let detail = `Request failed (${resp.status})`
    try {
      const j = await resp.json()
      detail = j.detail || detail
    } catch {
      // ignore
    }
    clearTimeout(timeoutId)
    onError(detail)
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop()
      for (const frame of frames) {
        if (!frame.startsWith('data: ')) continue
        const jsonStr = frame.slice(6)
        try {
          const obj = JSON.parse(jsonStr)
          if (obj.error) onError(obj.error)
          else if (obj.done) onDone(obj)
          else if (obj.delta) onDelta(obj.delta)
        } catch {
          // ignore partial/malformed frames
        }
      }
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
