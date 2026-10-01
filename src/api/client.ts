import type { components, paths } from './generated/schema'
import { tokenStore, type TokenStore } from './session'

type ErrorResponse = components['schemas']['ErrorResponse']
type ApiPath = `/admin/v1/${string}` | `/api/v1/${string}` | `/health/${string}`
type GetPath = { [P in keyof paths]: paths[P] extends {
  get: { responses: { 200: { content: { 'application/json': unknown } } } }
} ? P : never }[keyof paths]
type GetResponse<P extends GetPath> = paths[P]['get'] extends {
  responses: { 200: { content: { 'application/json': infer T } } }
} ? T : never

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly fields: components['schemas']['FieldError'][] = [],
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!value || typeof value !== 'object' || !('error' in value)) return false
  const error = value.error
  return !!error && typeof error === 'object' && 'message' in error &&
    typeof error.message === 'string' && 'fields' in error && Array.isArray(error.fields) &&
    error.fields.every((field: unknown) => !!field && typeof field === 'object' &&
      'path' in field && Array.isArray(field.path) &&
      field.path.every((part: unknown) => typeof part === 'string' || typeof part === 'number') &&
      'message' in field && typeof field.message === 'string')
}

export function createApiClient(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  tokens: TokenStore = tokenStore,
) {
  async function send(path: ApiPath, init: RequestInit, accept: string): Promise<Response> {
    if (!/^\/(?:admin\/v1|api\/v1|health)\//.test(path)) {
      throw new ApiError('接口地址不正确', 0, null)
    }
    const headers = new Headers(init.headers)
    headers.set('Accept', accept)
    const token = tokens.get()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    let response: Response
    try {
      response = await fetcher(path, { ...init, headers, credentials: 'omit' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError('网络连接失败，请重试', 0, null)
    }
    const requestId = response.headers.get('X-Request-ID')
    if (response.status === 401) tokens.handleUnauthorized()
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const fallback: Record<number, string> = {
        401: '请重新登录', 403: '无权执行此操作', 503: '服务暂不可用，请稍后重试',
      }
      throw new ApiError(
        isErrorResponse(body) ? body.error.message : fallback[response.status] || '请求失败，请重试',
        response.status,
        requestId,
        isErrorResponse(body) ? body.error.fields : [],
        isErrorResponse(body) ? body.error.code : undefined,
      )
    }
    return response
  }

  async function request<T>(path: ApiPath, init: RequestInit = {}): Promise<T> {
    const response = await send(path, init, 'application/json')
    const body: unknown = response.status === 204 ? undefined : await response.json().catch(() => null)
    if (body === null) throw new ApiError('服务响应格式不正确', response.status, response.headers.get('X-Request-ID'))
    return body as T
  }

  async function download(path: ApiPath, init: RequestInit = {}) {
    const response = await send(path, { ...init, method: 'GET' }, 'application/octet-stream')
    const disposition = response.headers.get('Content-Disposition') || ''
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    let name: string | null = null
    if (encodedName) {
      try { name = decodeURIComponent(encodedName) } catch { name = null }
    }
    return { blob: await response.blob(), name, requestId: response.headers.get('X-Request-ID') }
  }

  return {
    request,
    download,
    get<P extends GetPath>(path: P, init?: RequestInit): Promise<GetResponse<P>> {
      return request<GetResponse<P>>(path as ApiPath, { ...init, method: 'GET' })
    },
  }
}

export const apiClient = createApiClient()
