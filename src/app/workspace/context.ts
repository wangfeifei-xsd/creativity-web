import { createContext, useContext } from 'react'
import type { Schema } from '../../components/Management'

export type SessionContextValue = {
  session: Schema<'SessionView'>
  reload: () => Promise<void>
  switchWorkspace: (workspace: Schema<'WorkspaceOption'> | null) => Promise<void>
  logout: () => Promise<void>
}
export const SessionContext = createContext<SessionContextValue | null>(null)
export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('当前页面缺少服务端会话')
  return value
}
