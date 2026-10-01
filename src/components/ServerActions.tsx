import { Button, Space } from 'antd'
import type { components } from '../api/generated/schema'

export function ServerActions({ actions, handlers, loadingKey }: {
  actions: readonly components['schemas']['VisibleAction'][]
  handlers: Readonly<Record<string, (() => void) | undefined>>
  loadingKey?: string
}) {
  return <Space wrap>{actions.map((action) => handlers[action.action_key] &&
    <Button key={action.action_key} onClick={handlers[action.action_key]}
      loading={loadingKey === action.action_key}>{action.label}</Button>)}</Space>
}
