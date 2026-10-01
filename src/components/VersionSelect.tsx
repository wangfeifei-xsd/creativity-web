import { Select } from 'antd'
import type { components } from '../api/generated/schema'

type VersionOption = components['schemas']['VersionOption']

export function VersionSelect({ versions, value, onChange, loading = false }: {
  versions: readonly VersionOption[]
  value?: string
  onChange?: (value: string) => void
  loading?: boolean
}) {
  return <Select
    aria-label="选择版本"
    placeholder="请选择版本"
    value={value}
    onChange={onChange}
    loading={loading}
    style={{ minWidth: 240, maxWidth: '100%' }}
    options={versions.map((version) => ({
      value: version.version_id,
      label: version.resource_name && version.version_label
        ? `${version.resource_name} · ${version.version_label} · ${version.status.label}`
        : version.unavailable_reason || '版本信息不可用',
      disabled: !version.selectable,
    }))}
  />
}
