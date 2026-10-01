import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './client'
import { applyFormErrors } from './form-errors'
import { TokenStore } from './session'

describe('请求状态与错误处理', () => {
  it.each([401, 403, 503])('按服务端 %s 响应处理登录状态', async (status) => {
    const tokens = new TokenStore()
    tokens.set('opaque-token')
    const unauthorized = vi.fn()
    tokens.onUnauthorized(unauthorized)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'TEST', message: '请求失败', fields: [] }, request_id: 'r1' }),
      { status, headers: { 'X-Request-ID': 'r1' } },
    ))
    const client = createApiClient(fetcher, tokens)
    await expect(client.request('/admin/v1/example')).rejects.toMatchObject({ status, requestId: 'r1' })
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer opaque-token')
    expect(tokens.get()).toBe(status === 401 ? null : 'opaque-token')
    expect(unauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  })

  it('嵌套字段错误映射到 antd 表单', () => {
    const form = { setFields: vi.fn() }
    const error = new ApiError('请检查填写内容', 422, 'r1', [
      { path: ['items', 0, 'name'], message: '请填写此项' },
    ])
    expect(applyFormErrors(form, error)).toBe(true)
    expect(form.setFields).toHaveBeenCalledWith([{ name: ['items', 0, 'name'], errors: ['请填写此项'] }])
  })

  it('代理返回非 JSON 错误时仍保留请求标识', async () => {
    const client = createApiClient(vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>网关错误</html>', { status: 502, headers: { 'X-Request-ID': 'r2' } }),
    ))
    await expect(client.request('/api/v1/example')).rejects.toMatchObject({ status: 502, requestId: 'r2' })
  })

  it('网络故障不注销会话，取消请求保留取消语义', async () => {
    const tokens = new TokenStore()
    tokens.set('opaque-token')
    const client = createApiClient(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('断网')), tokens)
    await expect(client.request('/api/v1/example')).rejects.toMatchObject({ status: 0 })
    expect(tokens.get()).toBe('opaque-token')
    const aborted = createApiClient(vi.fn<typeof fetch>().mockRejectedValue(new DOMException('', 'AbortError')))
    await expect(aborted.request('/api/v1/example')).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('受控文件下载', () => {
  it('携带当前 Token 下载二进制文件并读取中文文件名', async () => {
    const tokens = new TokenStore()
    tokens.set('opaque-token')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('value\n1', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('报告.csv')}`,
        'X-Request-ID': 'file-request',
      },
    }))
    const result = await createApiClient(fetcher, tokens).download('/admin/v1/artifacts/file/content')
    expect(result.name).toBe('报告.csv')
    expect(await result.blob.text()).toBe('value\n1')
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer opaque-token')
  })

  it('下载收到 401 时沿用统一失效处理，不把错误正文保存为文件', async () => {
    const tokens = new TokenStore()
    tokens.set('expired')
    const client = createApiClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '请重新登录', fields: [] } }),
      { status: 401 },
    )), tokens)
    await expect(client.download('/api/v1/artifacts/file/content')).rejects.toMatchObject({ status: 401 })
    expect(tokens.get()).toBeNull()
  })
})
