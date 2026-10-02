type AuthenticationListener = () => void

export class TokenStore {
  private token: string | null = null
  private listeners = new Set<AuthenticationListener>()
  private controller = new AbortController()
  private generation = 0

  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    try { this.token = storage?.getItem('creativity.management.token') ?? null } catch { /* 存储不可用时只保存在内存。 */ }
  }

  snapshot() { return { generation: this.generation, signal: this.controller.signal } }

  assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new DOMException('工作区已切换', 'AbortError')
  }

  invalidate(): void {
    this.controller.abort()
    this.controller = new AbortController()
    this.generation += 1
  }

  get(): string | null {
    return this.token
  }

  set(token: string | null): void {
    this.invalidate()
    this.token = token
    try {
      if (token) this.storage?.setItem('creativity.management.token', token)
      else this.storage?.removeItem('creativity.management.token')
    } catch { /* 存储失败不改变服务端认证结果。 */ }
  }

  handleUnauthorized(): void {
    this.set(null)
    for (const listener of this.listeners) listener()
  }

  onUnauthorized(listener: AuthenticationListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

// 仅持久化不透明 Token；页面状态、授权和业务数据始终重新查询服务端。
function browserStorage() {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}
export const tokenStore = new TokenStore(browserStorage())
