type AuthenticationListener = () => void

export class TokenStore {
  private token: string | null = null
  private listeners = new Set<AuthenticationListener>()

  get(): string | null {
    return this.token
  }

  set(token: string | null): void {
    this.token = token
  }

  handleUnauthorized(): void {
    this.token = null
    for (const listener of this.listeners) listener()
  }

  onUnauthorized(listener: AuthenticationListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

// Token 只在内存保存；登录模块按服务端响应写入，不解析内容或推算有效期。
export const tokenStore = new TokenStore()
