import { RunViewer } from '../../components/run-viewer/RunViewer'
import { App, Button, Collapse, Descriptions, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, EditorDialog, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { Composer } from './Composer'
import { Timeline } from './Timeline'
import { download } from './download'

export function ConversationDetail({ conversationId }: { conversationId: string }) {
  const { modal } = App.useApp()
  const navigate = useNavigate()
  const detail = useQuery<Schema<'ConversationDetail'>>(`/admin/v1/conversations/${conversationId}`, true)
  const [cursors, setCursors] = useState<string[]>([])
  const history = useQuery<Schema<'MessagePage'>>(`/admin/v1/conversations/${conversationId}/messages?limit=50${cursors.length ? `&cursor=${encodeURIComponent(cursors.at(-1)!)}` : ''}`, true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const refresh = () => { detail.reload(); history.reload() }
  const activeRun = detail.data?.conversation.active_run_id
  const reloadDetail = detail.reload
  const reloadHistory = history.reload
  useEffect(() => {
    if (!activeRun) return
    const timer = window.setInterval(() => { reloadDetail(); reloadHistory() }, 3000)
    return () => window.clearInterval(timer)
  }, [activeRun, reloadDetail, reloadHistory])
  async function mutate(action: 'archive' | 'restore' | 'export' | 'delete') {
    if (busy) return
    setBusy(true); setError(undefined)
    try {
      if (action === 'export') {
        const artifact = await send<Schema<'Artifact'>>(`/admin/v1/conversations/${conversationId}/exports`, 'POST')
        await download(artifact.download_path)
      } else if (action === 'delete') {
        const preview = await apiClient.request<Schema<'DeletionImpact'>>(`/admin/v1/conversations/${conversationId}/deletion-preview`)
        modal.confirm({ title: '删除会话', okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
          content: <><p>{preview.explanation}</p><p>消息 {preview.messages} 条；摘要 {preview.summaries} 份；运行 {preview.runs} 次。</p>
            <p>撤销记忆 {preview.exclusive_memories} 条；更新来源 {preview.shared_memories} 条。</p></>,
          onOk: async () => {
            try {
              const job = await send<Schema<'DeletionView'>>(`/admin/v1/conversations/${conversationId}`, 'DELETE')
              navigate(`/conversations/deletions/${job.deletion_id}`)
            } catch (failure) { setError(failure); throw failure }
          } })
      } else { await send(`/admin/v1/conversations/${conversationId}/${action}`, 'POST'); refresh() }
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <LoadingState />
  const value = detail.data
  return <PageContainer title={value.conversation.title} actions={<Space wrap>
    <Link to="/conversations">返回会话列表</Link><Button onClick={refresh} disabled={busy}>刷新</Button>
    <ActionButtons actions={value.conversation.actions} disabled={busy} handlers={{ title: () => setEditing(true),
      archive: () => void mutate('archive'), restore: () => void mutate('restore'), delete: () => void mutate('delete'), export: () => void mutate('export') }} />
  </Space>}>
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <ErrorNotice error={error} />{activeRun && <RunViewer key={activeRun} runId={activeRun} />}
      <Descriptions items={[
        { key: 'agent', label: '智能体', children: value.conversation.agent_name },
        { key: 'subject', label: '主体', children: value.conversation.subject_name ?? '名称不可用' },
        { key: 'state', label: '状态', children: value.conversation.status_label },
        { key: 'environment', label: '环境', children: value.conversation.environment_label },
        { key: 'expires', label: '计划清理时间', children: formatTimestamp(value.conversation.expires_at) },
      ]} />
      {history.error ? <ErrorState error={history.error} onRetry={history.reload} /> : !history.data ? <LoadingState /> :
        <Timeline conversationId={conversationId} page={history.data} onRefresh={refresh} onError={setError} />}
      <Space><Button disabled={!cursors.length} onClick={() => setCursors(v => v.slice(0, -1))}>上一页</Button>
        <Button disabled={!history.data?.next_cursor} onClick={() => setCursors(v => [...v, history.data!.next_cursor!])}>下一页</Button></Space>
      {(value.summaries.length > 0 || value.contexts.length > 0) && <Collapse items={[{
        key: 'context', label: '摘要与上下文', children: <Space orientation="vertical" style={{ width: '100%' }}>
          {value.summaries.map(summary => <div key={summary.summary_id}>
            <Typography.Text strong>摘要版本 {summary.version}</Typography.Text>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{summary.content}</Typography.Paragraph>
            <Typography.Text type="secondary">来源消息序号：{summary.source_sequences.join('、')} · {formatTimestamp(summary.created_at)}</Typography.Text>
          </div>)}
          {value.contexts.map((context, index) => <Typography.Paragraph key={context.run_id}>
            上下文 {index + 1}：包含 {context.included_message_ids.length} 条消息；
            {context.summary_version ? `摘要版本 ${context.summary_version}` : '未使用摘要'}；
            删减记录：{String(context.truncation.reason ?? '无截断')}
            {Array.isArray(context.truncation.omitted_sequences) && context.truncation.omitted_sequences.length > 0
              ? `（消息序号 ${context.truncation.omitted_sequences.join('、')}）` : ''}
          </Typography.Paragraph>)}
        </Space>,
      }]} />}
      {value.conversation.status === 'ACTIVE' && <Composer conversationId={conversationId} detail={value} onSent={() => { setCursors([]); refresh() }} />}
    </Space>
    {editing && <EditorDialog title="修改标题" initial={{ title: value.conversation.title, revision: value.conversation.revision }}
      fields={[{ name: 'title', label: '标题', required: true }]} onClose={() => setEditing(false)}
      onSaved={() => { setEditing(false); detail.reload() }} onSave={values => send(`/admin/v1/conversations/${conversationId}`, 'PATCH', values)} />}
  </PageContainer>
}

export function DeletionProgress({ deletionId }: { deletionId: string }) {
  const query = useQuery<Schema<'DeletionView'>>(`/admin/v1/deletions/${deletionId}`, true)
  const status = query.data?.status
  const reload = query.reload
  useEffect(() => {
    if (!status || status === 'COMPLETED') return
    const timer = window.setInterval(reload, 5000)
    return () => window.clearInterval(timer)
  }, [status, reload])
  return <PageContainer title="删除进度" actions={<Space><Link to="/conversations">返回会话列表</Link><Button onClick={query.reload}>刷新</Button></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Descriptions column={1} items={[
      { key: 'state', label: '状态', children: query.data.status_label },
      { key: 'requested', label: '提交时间', children: formatTimestamp(query.data.requested_at) },
      { key: 'completed', label: '完成时间', children: query.data.completed_at ? formatTimestamp(query.data.completed_at) : '尚未完成' },
    ]} />}
  </PageContainer>
}
