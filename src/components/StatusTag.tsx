import { Tag } from 'antd'
import type { components } from '../api/generated/schema'

export function StatusTag({ status }: {
  status?: components['schemas']['DisplayStatus'] | null
}) {
  return status?.label
    ? <Tag color={status.tone}>{status.label}</Tag>
    : <Tag>状态不可用</Tag>
}
