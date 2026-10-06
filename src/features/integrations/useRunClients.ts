import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'

export type RunClient = { client_id: string; name: string; active: boolean }

export function useRunClients() {
  const { session } = useSession()
  const canRead = session.actions.some(action => action.action_key === 'run:read')
  const query = useQuery<RunClient[]>(canRead ? '/admin/v1/run-subscription-options' : null)
  return { ...query, canRead }
}

