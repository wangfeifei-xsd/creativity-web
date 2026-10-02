import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, ApiError, createApiClient } from './client'
import { followRunEvents, parseEventStream } from './event-stream'
import { TokenStore } from './session'

function stream(text: string, split = false) {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({ start(controller) {
    if (split) for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
    else controller.enqueue(bytes)
    controller.close()
  } })
}
function response(text: string) { return new Response(stream(text), { headers: { 'Content-Type': 'text/event-stream' } }) }

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
describe('运行事件流', () => {
  it('跨字节分片保留中文、多行数据和 CRLF，忽略心跳及未完成帧', async () => {
    const events = []
    for await (const event of parseEventStream(stream(': heartbeat\r\n\r\nid: 1\r\nevent: text_delta\r\ndata: {"text":\r\ndata: "中文"}\r\n\r\nid: 2\ndata: {', true))) events.push(event)
    expect(events).toEqual([{ id: 1, event: 'text_delta', data: { text: '中文' } }])
  })
  it('重连携带最后已交付序号，重复 result 只呈现一次', async () => {
    vi.useFakeTimers()
    const fetch = vi.spyOn(apiClient, 'stream').mockResolvedValueOnce(response('id: 1\nevent: result\ndata: {"ok":true}\n\n'))
      .mockResolvedValueOnce(response('id: 1\nevent: result\ndata: {"ok":true}\n\nid: 2\nevent: completed\ndata: {}\n\n'))
    const events: string[] = []
    const task = followRunEvents('/admin/v1/runs/run_a/events', event => events.push(event.event), new AbortController().signal)
    await vi.runAllTimersAsync()
    await task
    expect(events).toEqual(['result', 'completed'])
    expect(fetch.mock.calls[1][1]?.headers).toEqual({ 'Last-Event-ID': '1' })
  })
  it('流中鉴权或 Redis 故障后不自动重试', async () => {
    vi.spyOn(apiClient, 'stream').mockResolvedValue(response('event: control\ndata: {"code":"AUTH_STORE_UNAVAILABLE","message":"认证服务暂不可用","status":503}\n\n'))
    await expect(followRunEvents('/admin/v1/runs/run_a/events', () => {}, new AbortController().signal)).rejects.toBeInstanceOf(ApiError)
    expect(apiClient.stream).toHaveBeenCalledTimes(1)
  })
  it('序号缺口返回过期错误，交由页面查询快照', async () => {
    vi.spyOn(apiClient, 'stream').mockResolvedValue(response('id: 3\nevent: result\ndata: {}\n\n'))
    await expect(followRunEvents('/admin/v1/runs/run_a/events', () => {}, new AbortController().signal)).rejects.toMatchObject({ code: 'EVENTS_EXPIRED' })
  })
  it('Token 仅进入 Authorization，未放入 URL', async () => {
    const tokens = new TokenStore()
    tokens.set('private-token')
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(''))
    await createApiClient(fetch, tokens).stream('/admin/v1/runs/run_a/events')
    expect(fetch.mock.calls[0][0]).toBe('/admin/v1/runs/run_a/events')
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer private-token')
  })
})
