import { Navigate } from 'react-router-dom'
import { features } from '../../features/registry'
import { resolveNavigation } from '../../features/navigation'
import { useSession } from './context'
import { WorkspaceUsage } from './WorkspaceUsage'

export function WorkspaceHome() {
  const { session } = useSession()
  const entries = resolveNavigation(session.navigation, features)
  if (!session.workspace && session.can_access_platform) return <Navigate to="/workbench" replace />
  return <div className="workspace-home">
    <WorkspaceUsage entries={entries} />
  </div>
}
