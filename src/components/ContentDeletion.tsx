import { Alert, Button, Modal, Space } from 'antd'
import { Table } from './Table'
import { useEffect, useState } from 'react'
import { send } from '../api/management'
import { ErrorNotice, type Schema } from './Management'
import { LoadingState } from './States'

export function ContentDeletion({ resourceType, resourceId, onClose, onDeleted }: {
  resourceType: Schema<'LifecycleTarget'>['resource_type']; resourceId: string; onClose: () => void; onDeleted: (id: string) => void
}) {
  const [impact, setImpact] = useState<Schema<'LifecycleImpact'>>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void send<Schema<'LifecycleImpact'>>('/admin/v1/data-lifecycle/deletion-preview', 'POST', { resource_type: resourceType, resource_id: resourceId })
      .then(value => { if (active) setImpact(value) }).catch(failure => { if (active) setError(failure) })
    return () => { active = false }
  }, [resourceType, resourceId])
  return <Modal open title="删除内容" onCancel={onClose} closable={!busy} maskClosable={!busy} footer={<Space>
    <Button disabled={busy} onClick={onClose}>取消</Button><Button danger type="primary" disabled={!impact || !!error} loading={busy} onClick={async () => {
      setBusy(true); setError(undefined)
      try { const job = await send<Schema<'LifecycleProgress'>>('/admin/v1/data-lifecycle/deletions', 'POST', { resource_type: resourceType, resource_id: resourceId }); onDeleted(job.deletion_id) }
      catch (failure) { setError(failure) }
      finally { setBusy(false) }
    }}>确认删除</Button>
  </Space>}>
    <ErrorNotice error={error} />
    {impact ? <Space orientation="vertical" style={{ width: '100%' }}><Alert type="warning" title={impact.explanation} />
      <Table rowKey="resource_type" pagination={false} dataSource={impact.resources} columns={[{ title: '影响内容', dataIndex: 'label' }, { title: '数量', render: (_, row) => `${row.count} 项` }]} />
    </Space> : !error && <LoadingState />}
  </Modal>
}
