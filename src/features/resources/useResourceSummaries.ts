import { useEffect, useState } from 'react'
import { apiClient } from '../../api/client'
import type { Schema } from '../../components/Management'

export type Kind = 'prompt' | 'model_route' | 'tool' | 'skill'
export type Summary = Schema<'ResourceSummary'>

export function useResourceSummaries(kind: Kind, resourceIds: string[], refreshKey?: unknown) {
  const ids = JSON.stringify(resourceIds)
  const [state, setState] = useState<{ key: string; refreshKey?: unknown; items: Summary[]; error?: unknown }>({ key: '', items: [] })
  const key = `${kind}:${ids}`
  useEffect(() => {
    const controller = new AbortController()
    const identifiers = JSON.parse(ids) as string[]
    async function read() {
      const items: Summary[] = []
      for (let index = 0; index < identifiers.length; index += 200) {
        items.push(...await apiClient.request<Summary[]>(`/admin/v1/resource-management/${kind}/summaries`, {
          method: 'POST', body: JSON.stringify({ resource_ids: identifiers.slice(index, index + 200) }), signal: controller.signal,
        }))
      }
      if (!controller.signal.aborted) setState({ key, refreshKey, items })
    }
    void read().catch(error => { if (!controller.signal.aborted) setState({ key, refreshKey, items: [], error }) })
    return () => controller.abort()
  }, [kind, ids, key, refreshKey])
  return { items: Object.fromEntries((state.key === key && state.refreshKey === refreshKey ? state.items : []).map(item => [item.resource_id, item])), error: state.key === key && state.refreshKey === refreshKey ? state.error : undefined }
}

