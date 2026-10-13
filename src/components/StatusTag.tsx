import { Tag } from 'antd'
import type { components } from '../api/generated/schema'
import { useManagementAppearance } from '../app/management/context'
import { statusTone, type StatusTone } from './status-tones'

export function StatusTag({ status, label, tone }: {
  status?: components['schemas']['DisplayStatus'] | null
  label?: string | null
  tone?: StatusTone
}) {
  const managementAppearance = useManagementAppearance()
  const text = (status?.label ?? label)?.trim()
  // 已有服务端语义优先；缺失文案不以成功色或内部编码代替。
  const color = text ? status?.tone ?? tone ?? (managementAppearance ? statusTone(text) : undefined) : undefined
  return <Tag className={managementAppearance ? 'management-status-tag' : undefined} color={color}
    title={managementAppearance ? text || '状态不可用' : undefined}>
    {managementAppearance ? <span className="management-status-label">{text || '状态不可用'}</span> : text || '状态不可用'}
  </Tag>
}
