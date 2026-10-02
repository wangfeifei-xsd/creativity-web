import { Alert, Button, Descriptions, Modal, Space } from 'antd'
import { useRef, useState } from 'react'
import { type ApiPath, ApiError } from '../api/client'
import { useQuery, isAbort } from '../api/useQuery'
import { ErrorNotice, type Schema } from './Management'
import { send } from '../api/management'
import { ErrorState, LoadingState } from './States'

export function ImpactDialog({ title, previewPath, submitPath, onClose, onSaved }: {
  title: string; previewPath: ApiPath; submitPath: ApiPath; onClose: () => void; onSaved: () => void
}) {
  const query = useQuery<Schema<'ImpactView'>>(previewPath)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  return <Modal open title={title} onCancel={onClose} closable={!busy} maskClosable={!busy} footer={<Space>
    <Button disabled={busy} onClick={onClose}>取消</Button><Button danger type="primary" loading={busy}
      disabled={!query.data?.can_execute || (error instanceof ApiError && error.status === 409)} onClick={async () => {
        if (!query.data || active.current) return
        active.current = true; setBusy(true); setError(undefined)
        try { await send(submitPath, 'POST', { revision: query.data.revision }); onSaved() }
        catch (failure) { if (!isAbort(failure)) setError(failure) }
        finally { active.current = false; setBusy(false) }
      }}>确认{title}</Button></Space>}>
    <Space orientation="vertical" style={{ width: '100%' }}>
      <ErrorNotice error={error} />
      {error instanceof ApiError && error.status === 409 && <Button onClick={() => { setError(undefined); query.reload() }}>重新读取影响</Button>}
      {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <>
        <Descriptions column={1} items={[
          { key: 'name', label: '渠道', children: query.data.channel_name },
          { key: 'keys', label: '有效 Key', children: `${query.data.active_keys} 个` },
          { key: 'clients', label: '接入服务', children: `${query.data.active_clients} 个` },
          { key: 'tasks', label: '未完成任务', children: query.data.unfinished_tasks === null ? '暂不可确认' : `${query.data.unfinished_tasks} 个` },
        ]} />
        {query.data.blockers.map(blocker => <Alert key={blocker} type="warning" title={blocker} />)}
      </>}
    </Space>
  </Modal>
}
