import { useDirectory } from '../../api/useDirectory'
import { actionsAsOptions, send } from '../../api/management'
import { Button, Modal, Space, Tag, Tooltip } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { Table } from '../../components/Table'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { DirectoryFilters, type DirectoryPage } from '../../components/Directory'
import { ChannelDetail } from './ChannelDetail'

export function ChannelsPage() {
  const params = useParams()
  const channelId = params['*']?.split('/')[0]
  return channelId ? <ChannelDetail key={channelId} channelId={channelId} /> : <ChannelList />
}
function CreateChannel({ onClose, onSaved }: { onClose: () => void; onSaved: (channelId: string) => void }) {
  const query = useQuery<Schema<'ChannelCreateOptions'>>('/admin/v1/channel-create-options')
  const createdId = useRef<string | undefined>(undefined)
  if (query.error || !query.data) return <Modal open title="开通渠道" onCancel={onClose} footer={<Button onClick={onClose}>取消</Button>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />}</Modal>
  const options = query.data
  return <EditorDialog title="开通渠道" onClose={onClose} onSaved={() => { if (createdId.current) onSaved(createdId.current) }}
    initial={{ retention_days: 90, independent_actions: [] }} fields={[
      { name: 'name', label: '渠道名称', required: true },
      { name: 'owner', label: '负责人', required: true },
      { name: 'first_admin_user_id', label: '首位管理员', kind: 'select', options: options.accounts, required: true },
      { name: 'retention_days', label: '数据保存天数（天）', kind: 'number', required: true },
      { name: 'independent_actions', label: '独立授权', kind: 'multiple', options: actionsAsOptions(options.independent_actions) },
    ]} onSave={async values => { const { retention_days, ...body } = values
      const created = await send<Schema<'ChannelView'>>('/admin/v1/channels', 'POST', { ...body, retention_policy: { retention_days } })
      createdId.current = created.channel_id
    }} />
}
function ChannelList() {
  const directory = useDirectory()
  const query = useQuery<DirectoryPage<Schema<'ChannelView'>>>(`/admin/v1/channels/page?${directory.parameters}`)
  const { session } = useSession()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  return <PageContainer title="渠道管理" actions={<Space wrap><DirectoryFilters directory={directory} label="筛选渠道" statuses={[{ value: 'ACTIVE', label: '启用' }, { value: 'SUSPENDED', label: '暂停' }, { value: 'ARCHIVED', label: '归档' }]} />
    <Button onClick={query.reload}>刷新</Button><ActionButtons actions={session.actions} handlers={{ 'channel:create': () => setCreating(true) }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="channel_id" dataSource={query.data.items} pagination={directory.pagination(query.data.total)} scroll={{ x: 1050 }} columns={[
        { title: '渠道名称', render: (_, row) => <Link to={`/channels/${row.channel_id}`}>{row.name}</Link> },
        { title: '负责人', dataIndex: 'owner' },
        { title: '状态', render: (_, row) => <Tag>{row.status_label}</Tag> }, { title: '开通时间', width: 210, render: (_, row) => formatTimestamp(row.created_at) },
        { title: '配置状态', width: 360, render: (_, row) => row.configuration_status?.length ? <Space wrap size={[4, 4]}>
          {row.configuration_status.map(item => <Tooltip key={item.key} title={item.message}>
            <Link to={item.path} aria-label={`${item.label}：${item.completed ? '已完成' : '未完成'}`}>
              <Tag color={item.completed ? 'success' : 'error'} style={{ marginInlineEnd: 0 }}
                icon={item.completed ? <CheckCircleOutlined aria-hidden /> : <CloseCircleOutlined aria-hidden />}>{item.label}</Tag>
            </Link>
          </Tooltip>)}
        </Space> : '未提供' },
      ]} />}
    {creating && <CreateChannel onClose={() => setCreating(false)} onSaved={id => { setCreating(false); navigate(`/channels/${id}?tab=environments`) }} />}
  </PageContainer>
}
