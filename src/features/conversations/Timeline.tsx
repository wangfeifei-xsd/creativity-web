import { Button, Card, Descriptions, Drawer, Empty, Input, Modal, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { download } from './download'

type ResultSchema = { title?: string; properties?: Record<string, ResultSchema>; items?: ResultSchema; enum?: unknown[]; oneOf?: { const?: unknown; title?: string }[] }

function fieldTitle(key: string, schema?: ResultSchema) {
  return schema?.title ?? (/\p{Script=Han}/u.test(key) ? key : '字段名称不可用')
}

function ResultValue({ value, schema }: { value: unknown; schema?: ResultSchema }) {
  if (value == null) return <>未提供</>
  if (typeof value === 'boolean') return <>{value ? '是' : '否'}</>
  if (Array.isArray(value)) return <Space orientation="vertical">{value.map((item, index) => <ResultValue key={index} value={item} schema={schema?.items} />)}</Space>
  if (typeof value === 'object') return <Descriptions size="small" column={1} items={Object.entries(value)
    .filter(([key]) => !/(?:^|_)(?:id|ids)$/.test(key)).map(([key, item]) => ({ key, label: fieldTitle(key, schema?.properties?.[key]),
      children: <ResultValue value={item} schema={schema?.properties?.[key]} /> }))} />
  if (schema?.enum || schema?.oneOf) return <>{schema.oneOf?.find(item => item.const === value)?.title ?? '结果名称不可用'}</>
  return <>{String(value)}</>
}

export function MessageContent({ role, text, status }: { role: string; text: string; status: string }) {
  let result: unknown
  if (role === 'assistant' && text) {
    try { result = JSON.parse(text) } catch { /* 普通文本消息保持原样。 */ }
  }
  if (result && typeof result === 'object' && 'schema_version' in result && result.schema_version === '1.0'
    && 'business_status' in result && typeof result.business_status === 'string'
    && 'data' in result && result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    && 'evidence_refs' in result && Array.isArray(result.evidence_refs)
    && 'warnings' in result && Array.isArray(result.warnings) && result.warnings.every(item => typeof item === 'string')) {
    return <Space orientation="vertical" style={{ width: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      <ResultValue value={result.data} />
      {result.warnings.map((warning, index) => <Typography.Text type="warning" key={index}>{warning}</Typography.Text>)}
    </Space>
  }
  return <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text || (role === 'assistant' && status === 'PENDING' ? '等待回复' : '')}</Typography.Paragraph>
}

export function ConversationResult({ turn }: { turn: Schema<'TurnView'> }) {
  const envelope = turn.output_schema as ResultSchema
  const titles = (envelope.properties?.business_status ? envelope.properties.data?.properties : envelope.properties) ?? {}
  return turn.result && <Space orientation="vertical" size="small" style={{ width: '100%' }}>
    <Tag>{turn.result_label}</Tag>
    {Object.entries(turn.result.data).filter(([key]) => !/(?:^|_)(?:id|ids)$/.test(key)).map(([key, value]) => <div key={key} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      <Typography.Text type="secondary">{fieldTitle(key, titles[key])}：</Typography.Text>
      <ResultValue value={value} schema={titles[key]} />
    </div>)}
    {turn.result.warnings.map((warning, index) => <Typography.Text type="warning" key={index}>{warning}</Typography.Text>)}
  </Space>
}

export function Timeline({ conversationId, page, onRefresh, onError, canBranch = false }: { conversationId: string; page: Schema<'MessagePage'>; onRefresh: () => void; onError: (error: unknown) => void; canBranch?: boolean }) {
  const navigate = useNavigate()
  const [branch, setBranch] = useState<{ messageId: string; key: string; title: string }>()
  const [branching, setBranching] = useState(false)
  const [runId, setRunId] = useState<string>()
  const [cancelling, setCancelling] = useState<string>()
  return <>
    {!page.items.length && <Empty description="暂无消息" />}
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {page.items.map(message => {
        const turn = page.turns.find(t => t.turn_id === message.turn_id)
        return <Card key={message.message_id} size="small" title={<Space wrap><span>{message.role_label}</span>
          <Tag color={message.status === 'COMPLETED' ? 'success' : message.status === 'FAILED' ? 'error' : 'default'}>{message.status_label}</Tag>
          <Typography.Text type="secondary">{formatTimestamp(message.created_at)}</Typography.Text></Space>}>
          {!(message.role === 'assistant' && turn?.result) && <MessageContent role={message.role} text={message.text} status={message.status} />}
          {canBranch && message.role === 'assistant' && message.status === 'COMPLETED' && <Button onClick={() => setBranch({ messageId: message.message_id, key: crypto.randomUUID(), title: '新分支' })}>从此处创建分支</Button>}
          <Space wrap>{message.attachments.map(a => <Button key={a.artifact_id} onClick={() => void download(a.download_path).catch(onError)}>
            {a.name}（{(a.size_bytes / 1024).toFixed(1)} KB）</Button>)}</Space>
          {message.role === 'assistant' && turn && <Space orientation="vertical" style={{ width: '100%' }}>
            <Space wrap><Typography.Text>第 {turn.sequence} 轮 · {turn.version_label}</Typography.Text><Tag>{turn.state_label}</Tag>
              <Typography.Text>耗时：{turn.duration_seconds == null ? '运行中' : `${turn.duration_seconds.toFixed(2)} 秒`}</Typography.Text>
              {turn.source_run_id && <Tag>补充上一轮信息</Tag>}
              {turn.can_cancel && <Button loading={cancelling === turn.run_id} disabled={turn.state === 'CANCEL_REQUESTED'} onClick={async () => {
                setCancelling(turn.run_id)
                try { await send(`/admin/v1/conversations/${conversationId}/runs/${turn.run_id}/cancel`, 'POST'); onRefresh() }
                catch (failure) { onError(failure) } finally { setCancelling(undefined) }
              }}>取消运行</Button>}
              {turn.can_view_run && <Button onClick={() => setRunId(turn.run_id)}>执行详情</Button>}
            </Space><ConversationResult turn={turn} />
          </Space>}
        </Card>
      })}
    </Space>
    {runId && <ExecutionDetail conversationId={conversationId} runId={runId} onClose={() => setRunId(undefined)} />}
    {branch && <Modal open title="创建会话分支" okText="创建" cancelText="取消" confirmLoading={branching} onCancel={() => { if (!branching) setBranch(undefined) }} onOk={async () => {
      setBranching(true)
      try {
        const result = await send<Schema<'ConversationView'>>(`/admin/v1/conversations/${conversationId}/branches`, 'POST', { message_id: branch.messageId, title: branch.title, idempotency_key: branch.key })
        setBranch(undefined); navigate(`/conversations/${result.conversation_id}`)
      } catch (failure) { onError(failure) } finally { setBranching(false) }
    }}><Input aria-label="分支标题" maxLength={255} value={branch.title} disabled={branching} onChange={event => setBranch({ ...branch, title: event.target.value })} /></Modal>}
  </>
}

function ExecutionDetail({ conversationId, runId, onClose }: { conversationId: string; runId: string; onClose: () => void }) {
  const query = useQuery<Schema<'ResultEnvelope'>>(`/admin/v1/conversations/${conversationId}/runs/${runId}`)
  return <Drawer open title="执行详情" onClose={onClose} size="large">
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <>
      <Descriptions column={1} items={[{ key: 'state', label: '状态', children: query.data.state_label },
        { key: 'run', label: '运行标识', children: query.data.run_id },
        { key: 'snapshot', label: '配置快照', children: query.data.release_snapshot_id }]} />
      <ErrorNotice error={query.data.error ? new Error(query.data.error.message) : undefined} />
    </>}
  </Drawer>
}
