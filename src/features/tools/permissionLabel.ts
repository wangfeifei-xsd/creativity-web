import type { Schema } from '../../components/Management'

export function toolPermissionLabel(key: string, actions: Pick<Schema<'VisibleAction'>, 'action_key' | 'label'>[]): string {
  return actions.find(action => action.action_key === key)?.label
    ?? (key === 'run:create' ? '执行能力' : '授权名称不可用')
}
