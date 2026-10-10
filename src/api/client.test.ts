import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './client'
import { applyFormErrors } from './form-errors'
import { TokenStore } from './session'

describe('请求状态与错误处理', () => {
  it('接受后台任务已受理的 null 响应，但拒绝无法解析的成功响应', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('null', { status: 202 }))
      .mockResolvedValueOnce(new Response('<html>代理页面</html>', { status: 200 }))
    const client = createApiClient(fetcher)
    await expect(client.request('/admin/v1/memory-consolidations/task/retry', { method: 'POST' })).resolves.toBeNull()
    await expect(client.request('/admin/v1/memories')).rejects.toMatchObject({ message: '服务响应格式不正确' })
  })

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

describe('IAM-A14 / CHN-A10 工作区请求隔离', () => {
  it.each([200, 401])('旧工作区迟到的 %s 不能返回数据或注销新会话', async status => {
    const tokens = new TokenStore()
    tokens.set('workspace-a')
    let resolve!: (response: Response) => void
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(done => { resolve = done }))
    const client = createApiClient(fetcher, tokens)
    const request = client.request('/admin/v1/accounts')
    tokens.set('workspace-b')
    resolve(new Response(JSON.stringify(status === 200 ? [{ name: '原渠道' }] : { error: { code: 'UNAUTHENTICATED', message: '请重新登录', fields: [] } }), { status }))
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(tokens.get()).toBe('workspace-b')
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('响应正文读取中切换工作区也不能交付旧数据', async () => {
    const tokens = new TokenStore()
    tokens.set('workspace-a')
    let resolve!: (value: unknown) => void
    const response = new Response('{}')
    response.json = () => new Promise(done => { resolve = done })
    const client = createApiClient(vi.fn<typeof fetch>().mockResolvedValue(response), tokens)
    const request = client.request('/admin/v1/accounts')
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    tokens.invalidate()
    resolve({ name: '旧数据' })
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('只持久化不透明 Token，不保存角色、工作区或业务缓存', () => {
    const storage = { getItem: vi.fn().mockReturnValue('opaque'), setItem: vi.fn(), removeItem: vi.fn() }
    const tokens = new TokenStore(storage)
    expect(tokens.get()).toBe('opaque')
    tokens.set('new-token')
    expect(storage.setItem).toHaveBeenCalledWith('creativity.management.token', 'new-token')
    tokens.handleUnauthorized()
    expect(storage.removeItem).toHaveBeenCalledWith('creativity.management.token')
  })
})
