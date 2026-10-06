import { useDirectory } from '../../api/useDirectory'
import { Button, Input, Select, Space, Tag } from 'antd'
import { Table } from '../../components/Table'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { type DirectoryPage } from '../../components/Directory'
import { ErrorNotice } from '../../components/Management'
import type { ResourceEntry } from '../members/ResourcePicker'

export function ChannelResources({ channelId }: { channelId: string }) {
  const directory = useDirectory()
  const [kind, setKind] = useState<string>()
  const { session } = useSession()
  const params = directory.parameters
  if (kind) params.set('kind', kind)
  const query = useQuery<DirectoryPage<ResourceEntry>>(`/admin/v1/channels/${channelId}/resources?${params}`)
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle"><Space wrap className="query-filters">
    <Input.Search aria-label="搜索渠道资源" placeholder="资源名称" onSearch={directory.searchFor} allowClear />
    <Select aria-label="资源类型" placeholder="全部类型" allowClear style={{ width: 140 }} onChange={value => { setKind(value); directory.searchFor(directory.search) }} options={[
      { value: 'agent', label: '智能体' }, { value: 'model', label: '模型' }, { value: 'prompt', label: '提示词' },
      { value: 'tool', label: '工具' }, { value: 'skill', label: '技能' }, { value: 'mcp_connection', label: 'MCP 连接' },
    ]} /><Button onClick={query.reload}>刷新</Button>
  </Space><ErrorNotice error={query.error} />
    <Table<ResourceEntry> rowKey={row => `${row.resource_type}|${row.resource_id}`} dataSource={query.data?.items} loading={!query.data && !query.error}
      pagination={directory.pagination(query.data?.total)} columns={[
        { title: '资源', render: (_, row) => session.workspace?.channel_id === channelId ? <Link to={row.path}>{row.name}</Link> : row.name },
        { title: '类型', dataIndex: 'resource_type_name' }, { title: '状态', render: (_, row) => <Tag>{row.status_label}</Tag> },
      ]} />
  </Space>
}
