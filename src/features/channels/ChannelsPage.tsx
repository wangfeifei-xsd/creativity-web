import { actionsAsOptions, send } from '../../api/management'
import { Button, Input, Modal, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { ChannelDetail } from './ChannelDetail'

export function ChannelsPage() {
  const params = useParams()
  const channelId = params['*']?.split('/')[0]
  return channelId ? <ChannelDetail key={channelId} channelId={channelId} /> : <ChannelList />
}
function CreateChannel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const query = useQuery<Schema<'ChannelCreateOptions'>>('/admin/v1/channel-create-options')
  if (query.error || !query.data) return <Modal open title="开通渠道" onCancel={onClose} footer={<Button onClick={onClose}>取消</Button>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />}</Modal>
  const options = query.data
  return <EditorDialog title="开通渠道" onClose={onClose} onSaved={onSaved}
    initial={{ environment: 'test', retention_days: 90, independent_actions: [] }} fields={[
      { name: 'name', label: '渠道名称', required: true }, { name: 'channel_code', label: '渠道编码', required: true },
      { name: 'owner', label: '负责人', required: true }, { name: 'business_type', label: '业务分类' },
      { name: 'first_admin_user_id', label: '首位管理员', kind: 'select', options: options.accounts, required: true },
      { name: 'environment', label: '初始环境', kind: 'select', options: options.environments, required: true },
      { name: ['data_scope', 'name'], label: '数据域名称', required: true },
      { name: ['data_scope', 'external_scope_type'], label: '外部数据域类型', required: true },
      { name: ['data_scope', 'external_scope_id'], label: '外部数据域编号', required: true },
      { name: 'retention_days', label: '数据保存天数（天）', kind: 'number', required: true },
      { name: 'independent_actions', label: '独立授权', kind: 'multiple', options: actionsAsOptions(options.independent_actions) },
    ]} onSave={values => { const { retention_days, ...body } = values
      return send('/admin/v1/channels', 'POST', { ...body, business_type: body.business_type || null, retention_policy: { retention_days } })
    }} />
}
function ChannelList() {
  const query = useQuery<Schema<'ChannelView'>[]>('/admin/v1/channels?limit=200')
  const { session } = useSession()
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  return <PageContainer title="渠道管理" actions={<Space wrap><Input aria-label="筛选渠道" placeholder="渠道名称" value={filter} onChange={e => setFilter(e.target.value)} allowClear />
    <Button onClick={query.reload}>刷新</Button><ActionButtons actions={session.actions} handlers={{ 'channel:create': () => setCreating(true) }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="channel_id" dataSource={query.data.filter(row => row.name.includes(filter))} scroll={{ x: 750 }} columns={[
        { title: '渠道名称', render: (_, row) => <Link to={`/channels/${row.channel_id}`}>{row.name}</Link> },
        { title: '业务分类', render: (_, row) => row.business_type_name ?? '未填写' }, { title: '负责人', dataIndex: 'owner' },
        { title: '状态', render: (_, row) => <Tag>{row.status_label}</Tag> }, { title: '开通时间', render: (_, row) => formatTimestamp(row.created_at) },
      ]} />}
    {creating && <CreateChannel onClose={() => setCreating(false)} onSaved={() => { setCreating(false); query.reload() }} />}
  </PageContainer>
}
