import { send } from '../../api/management'
import { App as AntApp, Button, Flex } from 'antd'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, ApiError } from '../../api/client'
import { tokenStore } from '../../api/session'
import { isAbort } from '../../api/useQuery'
import { type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { AuthForm } from '../../features/auth/AuthForm'
import { SessionContext } from './context'

type State = { phase: 'loading' | 'login' | 'password' | 'error'; error?: unknown } |
  { phase: 'ready'; session: Schema<'SessionView'> }
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [generation, setGeneration] = useState(0)
  const switching = useRef(false)
  const ending = useRef(false)
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const reload = useCallback(async () => {
    try { const session = await apiClient.get('/admin/v1/auth/session'); setState({ phase: 'ready', session }) }
    catch (error) {
      if (isAbort(error)) return
      if (error instanceof ApiError && error.status === 401) setState({ phase: 'login' })
      else if (error instanceof ApiError && error.code === 'PASSWORD_CHANGE_REQUIRED') setState({ phase: 'password' })
      else setState({ phase: 'error', error })
    }
  }, [])
  useEffect(() => {
    const unsubscribe = tokenStore.onUnauthorized(() => { setState({ phase: 'login' }); setGeneration(n => n + 1) })
    // 即使本地没有 Token，也由会话接口决定登录状态。
    void apiClient.get('/admin/v1/auth/session').then(session => setState({ phase: 'ready', session }), error => {
      if (isAbort(error)) return
      if (error instanceof ApiError && error.status === 401) setState({ phase: 'login' })
      else if (error instanceof ApiError && error.code === 'PASSWORD_CHANGE_REQUIRED') setState({ phase: 'password' })
      else setState({ phase: 'error', error })
    })
    return () => { unsubscribe(); tokenStore.invalidate() }
  }, [])
  const logout = async () => {
    if (ending.current) return
    ending.current = true
    try {
      await send('/admin/v1/auth/logout', 'POST')
      tokenStore.set(null); setGeneration(n => n + 1); setState({ phase: 'login' }); navigate('/', { replace: true })
    } finally { ending.current = false }
  }
  const switchWorkspace = async (workspace: Schema<'WorkspaceOption'> | null) => {
    if (switching.current) return
    switching.current = true
    tokenStore.invalidate(); setGeneration(n => n + 1); setState({ phase: 'loading' })
    try {
      const response = await send<Schema<'TokenResponse'>>(workspace ? '/admin/v1/auth/channel-context' : '/admin/v1/auth/platform-context', 'POST',
        workspace ? { channel_id: workspace.channel_id, environment: workspace.environment, data_scope_id: workspace.data_scope_id } : undefined)
      tokenStore.set(response.access_token); navigate('/', { replace: true }); await reload()
    } catch (error) {
      if (!isAbort(error)) { void message.error(error instanceof Error ? error.message : '切换失败'); await reload() }
    } finally { switching.current = false }
  }
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <Flex vertical align="center">
    <ErrorState error={state.error} onRetry={() => void reload()} />
    <Button onClick={() => void logout().catch(error => message.error(error instanceof Error ? error.message : '退出失败'))}>退出登录</Button>
  </Flex>
  if (state.phase === 'login' || state.phase === 'password') return <AuthForm key={state.phase}
    changePassword={state.phase === 'password'} onLogout={logout} onSubmit={async values => {
      if ('new_password' in values) {
        await send('/admin/v1/auth/change-password', 'POST', { current_password: values.current_password, new_password: values.new_password })
        tokenStore.set(null); setState({ phase: 'login' }); void message.success('密码已修改，请重新登录')
      } else {
        const response = await send<Schema<'TokenResponse'>>('profile_id' in values ? '/admin/v1/auth/external-token' : '/admin/v1/auth/login', 'POST', values)
        tokenStore.set(response.access_token); await reload()
      }
    }} />
  if (state.phase !== 'ready') return null
  return <SessionContext value={{ session: state.session, reload, logout, switchWorkspace }}>
    <div key={generation}>{children}</div>
  </SessionContext>
}
