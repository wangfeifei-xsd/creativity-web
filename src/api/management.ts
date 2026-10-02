import { apiClient, type ApiPath } from './client'
import type { Choice, Schema } from '../components/Management'

export const names = (items: readonly (string | null)[]) => items.map(v => v ?? '名称不可用').join('、') || '未设置'
export const actionsAsOptions = (actions: readonly Schema<'VisibleAction'>[]) => actions.map(a => ({ value: a.action_key, label: a.label }))
export const environments: Choice[] = [{ value: 'dev', label: '开发' }, { value: 'test', label: '测试' },
  { value: 'fat', label: '验收' }, { value: 'prod', label: '生产' }]
export const statuses: Choice[] = [{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]
export function send<T>(path: ApiPath, method: string, body?: unknown) {
  return apiClient.request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
}
