import { apiClient, ApiError, type ApiPath } from './client'
import { tokenStore } from './session'

export type StreamMessage = { id: number | null; event: string; data: unknown }

// 按空行分帧，支持拆开的 UTF-8、多行 data 与 CRLF，不把心跳当业务事件。
export async function* parseEventStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamMessage> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let match: RegExpExecArray | null
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        let event = 'message'
        let id: number | null = null
        const data: string[] = []
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          if (line.startsWith('id:')) {
            const text = line.slice(3).trim()
            if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new ApiError('事件序号无效', 502, null)
            id = Number(text)
          }
          if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
        }
        if (data.length) yield { id, event, data: JSON.parse(data.join('\n')) as unknown }
      }
      if (buffer.length > 2_000_000) throw new ApiError('事件内容过大', 502, null)
      if (done) return
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function followRunEvents(path: ApiPath, onEvent: (event: StreamMessage) => void,
  signal: AbortSignal, afterSequence = 0): Promise<void> {
  const session = tokenStore.snapshot()
  const lifetime = AbortSignal.any([signal, session.signal])
  let cursor = afterSequence
  let failures = 0
  while (!lifetime.aborted) {
    try {
      const response = await apiClient.stream(path, { signal: lifetime, headers: { 'Last-Event-ID': String(cursor) } })
      if (!response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body) throw new ApiError('流式响应格式不正确', 502, null)
      for await (const event of parseEventStream(response.body)) {
        tokenStore.assertCurrent(session.generation)
        if (event.event === 'control') {
          const control = event.data as { code: string; message: string; status?: number }
          if (control.status === 401) tokenStore.handleUnauthorized()
          throw new ApiError(control.message, control.status ?? 403, null, [], control.code)
        }
        if (event.id === null || event.id <= cursor) continue
        if (event.id !== cursor + 1) throw new ApiError('事件已过期，请查询运行结果', 410, null, [], 'EVENTS_EXPIRED')
        cursor = event.id
        failures = 0
        onEvent(event)
        if (event.event === 'completed') return
      }
    } catch (error) {
      if (lifetime.aborted) throw error
      if (error instanceof ApiError && error.status !== 0 && error.status !== 502) throw error
      if (!(error instanceof ApiError) && !(error instanceof TypeError)) throw error
    }
    failures += 1
    await pause(Math.min(1000 * 2 ** Math.min(failures - 1, 4), 15000), lifetime)
  }
}
