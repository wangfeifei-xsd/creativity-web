import { Pagination, Select, Space } from 'antd'
import { useState } from 'react'
import { useQuery } from '../../api/useQuery'
import type { DirectoryPage } from '../../components/Directory'
import { ErrorNotice, type Schema } from '../../components/Management'

export type ResourceEntry = { resource_type: string; resource_type_name: string; resource_id: string; name: string; status_label: string;
  path: string; actions: Schema<'VisibleAction'>[] }
export function ResourcePicker({ channelId, base, value, onChange, onChosen }: { channelId: string; base: Schema<'ResourceOption'>[];
  value?: string; onChange?: (value: string) => void; onChosen: (resource?: ResourceEntry) => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<{ value: string; label: string }>()
  const query = useQuery<DirectoryPage<ResourceEntry>>(`/admin/v1/channels/${channelId}/resource-options?${new URLSearchParams({ search, limit: '20', offset: String((page - 1) * 20) })}`)
  const choices = [...base.filter(item => !search || item.label.includes(search)).map(item => ({ value: `${item.resource_type}|${item.resource_id}`, label: item.label })),
    ...(query.data?.items.map(item => ({ value: `${item.resource_type}|${item.resource_id}`, label: `${item.name} · ${item.resource_type_name}` })) ?? []),
    ...(selected ? [selected] : []),
  ]
  const options = [...new Map(choices.map(item => [item.value, item])).values()]
  return <Space orientation="vertical" style={{ width: '100%' }}><Select aria-label="资源" style={{ width: '100%' }} value={value} showSearch filterOption={false}
    loading={!query.data && !query.error} options={options} onSearch={text => { setSearch(text); setPage(1) }}
    onChange={key => { setSelected(options.find(item => item.value === key)); onChange?.(key); onChosen(query.data?.items.find(item => `${item.resource_type}|${item.resource_id}` === key)) }}
    popupRender={menu => <>{menu}<Pagination size="small" current={page} pageSize={20} total={query.data?.total} onChange={setPage} showSizeChanger={false} style={{ padding: 8 }} /></>} />
    <ErrorNotice error={query.error} /></Space>
}
