import { App, Button, Drawer, Space, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, ErrorNotice, type Schema } from '../../components/Management'
import { StatusTag } from '../../components/StatusTag'
import { Table } from '../../components/Table'

import { type Kind, type Summary } from './useResourceSummaries'

export function ResourceActions({ kind, summary, onEdit, onChanged }: { kind: Kind; summary?: Summary; onEdit: () => void; onChanged: () => void }) {
  const { modal, message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  async function mutate(operation: 'publish' | 'unpublish' | 'delete') {
    if (!summary || busy) return
    const label = { publish: '发布', unpublish: '下架', delete: '删除' }[operation]
    if (!await modal.confirm({ title: `${label}“${summary.name}”`, content: operation === 'delete' ? '删除后无法恢复。' : undefined, okText: label, cancelText: '取消', okButtonProps: { danger: operation === 'delete' } })) return
    let confirmUsed = false
    if (operation === 'delete' && summary.usage_count > 0) {
      confirmUsed = await modal.confirm({ title: `再次确认删除“${summary.name}”`, content: `该资源曾被使用 ${summary.usage_count} 次，删除后无法恢复，是否继续？`, okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true } })
      if (!confirmUsed) return
    }
    setBusy(true); setError(undefined)
    try {
      await send(`/admin/v1/resource-management/${kind}/${summary.resource_id}/${operation}`, 'POST', { revision: summary.revision, configuration_revision: summary.configuration_revision, confirm_used: confirmUsed })
      void message.success(`${label}成功`); onChanged()
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  return <Space orientation="vertical" size={0}>
    {summary ? <ActionButtons actions={summary.actions} disabled={busy} handlers={{ edit: onEdit, publish: () => void mutate('publish'), unpublish: () => void mutate('unpublish'), delete: () => void mutate('delete') }} /> : <Typography.Text type="secondary">加载操作中</Typography.Text>}
    <ErrorNotice error={error} />
  </Space>
}

export function ResourceRecords({ kind, summary, type }: { kind: Kind; summary?: Summary; type: 'references' | 'uses' }) {
  const [open, setOpen] = useState(false)
  return <>{summary ? <Button type="link" onClick={() => setOpen(true)}>{type === 'references' ? summary.reference_count : summary.usage_count}</Button> : '—'}
    {open && summary && <RecordsDrawer kind={kind} summary={summary} initial={type} onClose={() => setOpen(false)} />}
  </>
}

function RecordsDrawer({ kind, summary, initial, onClose }: { kind: Kind; summary: Summary; initial: string; onClose: () => void }) {
  const [referencePage, setReferencePage] = useState(1)
  const references = useQuery<Schema<'ResourceReferencePage'>>(`/admin/v1/resource-management/${kind}/${summary.resource_id}/references?offset=${(referencePage - 1) * 20}&limit=20`)
  const [page, setPage] = useState(1)
  const uses = useQuery<Schema<'ResourceUsePage'>>(`/admin/v1/resource-management/${kind}/${summary.resource_id}/uses?offset=${(page - 1) * 20}&limit=20`)
  return <Drawer open width={840} title={summary.name} onClose={onClose}>
    <Tabs defaultActiveKey={initial} items={[
      { key: 'references', label: '当前引用', children: <><ErrorNotice error={references.error} /><Table rowKey={row => `${row.resource_type}:${row.resource_id}`} loading={!references.data && !references.error} dataSource={references.data?.items} pagination={{ current: referencePage, pageSize: 20, total: references.data?.total, onChange: setReferencePage, showSizeChanger: false }} columns={[{ title: '资源类型', dataIndex: 'resource_type_label' }, { title: '资源名称', dataIndex: 'name' }, { title: '状态', render: (_, row) => <StatusTag status={row.status} /> }, { title: '发布环境', render: (_, row) => row.environments.join('、') || '尚未发布' }]} /></> },
      { key: 'uses', label: '使用记录', children: <><ErrorNotice error={uses.error} /><Table rowKey="run_id" loading={!uses.data && !uses.error} dataSource={uses.data?.items} pagination={{ current: page, pageSize: 20, total: uses.data?.total, onChange: setPage, showSizeChanger: false }} columns={[
        { title: '资源', render: (_, row) => `${row.resource_name}${row.deleted ? '（已删除）' : ''}` },
        { title: '智能体', render: (_, row) => row.agent_name ?? '未记录' }, { title: '调用方', render: (_, row) => row.caller_name ?? '未记录' },
        { title: '环境', render: (_, row) => ({ dev: '开发', test: '测试', fat: '验收', prod: '生产' })[row.environment as 'dev'] ?? '环境名称不可用' },
        { title: '使用时间', render: (_, row) => formatTimestamp(row.used_at) }, { title: '运行', render: (_, row) => <Link to={`/runs/${row.run_id}`}>查看运行</Link> },
      ]} /></> },
    ]} />
  </Drawer>
}

