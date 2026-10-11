import { features } from '../../features/registry'
import { resolveNavigation } from '../../features/navigation'
import { useSession } from './context'
import { WorkspaceUsage } from './WorkspaceUsage'

export function WorkspaceHome() {
  const { session } = useSession()
  const entries = resolveNavigation(session.navigation, features)
  return <div className="workspace-home">
    <WorkspaceUsage entries={entries} />
  </div>
}
