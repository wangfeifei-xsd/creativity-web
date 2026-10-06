import { Input, Select, Space } from 'antd'
import { useDirectory } from '../api/useDirectory'

export type DirectoryPage<T> = { items: T[]; total: number; offset: number; limit: number }

export function DirectoryFilters({ directory, label, statuses }: { directory: ReturnType<typeof useDirectory>; label: string; statuses: { value: string; label: string }[] }) {
  return <Space wrap className="query-filters"><Input.Search aria-label={label} placeholder={label} allowClear onSearch={directory.searchFor} style={{ width: 240 }} />
    <Select aria-label="筛选状态" placeholder="全部状态" allowClear value={directory.status} onChange={directory.statusFor} options={statuses} style={{ width: 130 }} /></Space>
}
