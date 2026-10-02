import { Button, Card, Descriptions, Drawer, Empty, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { download } from './download'

type ResultSchema = { title?: string; properties?: Record<string, ResultSchema>; items?: ResultSchema; enum?: unknown[]; oneOf?: { const?: unknown; title?: string }[] }

function ResultValue({ value, schema }: { value: unknown; schema?: ResultSchema }) {
  if (value == null) return <>未提供</>
  if (typeof value === 'boolean') return <>{value ? '是' : '否'}</>
  if (Array.isArray(value)) return <Space orientation="vertical">{value.map((item, index) => <ResultValue key={index} value={item} schema={schema?.items} />)}</Space>
  if (typeof value === 'object') return <Descriptions size="small" column={1} items={Object.entries(value)
    .filter(([key]) => !/(?:^|_)(?:id|ids)$/.test(key)).map(([key, item]) => ({ key, label: schema?.properties?.[key]?.title ?? '字段名称不可用',
      children: <ResultValue value={item} schema={schema?.properties?.[key]} /> }))} />
  if (schema?.enum || schema?.oneOf) return <>{schema.oneOf?.find(item => item.const === value)?.title ?? '结果名称不可用'}</>
  return <>{String(value)}</>
}

function Result({ turn }: { turn: Schema<'TurnView'> }) {
  const titles = (turn.output_schema.properties ?? {}) as Record<string, ResultSchema>
  return turn.result && <Space orientation="vertical" size="small" style={{ width: '100%' }}>
    <Tag>{turn.result_label}</Tag>
    {Object.entries(turn.result.data).filter(([key]) => !/(?:^|_)(?:id|ids)$/.test(key)).map(([key, value]) => <div key={key} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      <Typography.Text type="secondary">{titles[key]?.title ?? '字段名称不可用'}：</Typography.Text>
      <ResultValue value={value} schema={titles[key]} />
    </div>)}
    {turn.result.warnings.map((warning, index) => <Typography.Text type="warning" key={index}>{warning}</Typography.Text>)}
  </Space>
}

export function Timeline({ conversationId, page, onRefresh, onError }: { conversationId: string; page: Schema<'MessagePage'>; onRefresh: () => void; onError: (error: unknown) => void }) {
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
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text || (message.role === 'assistant' && message.status === 'PENDING' ? '等待回复' : '')}</Typography.Paragraph>
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
            </Space><Result turn={turn} />
          </Space>}
        </Card>
      })}
    </Space>
    {runId && <ExecutionDetail conversationId={conversationId} runId={runId} onClose={() => setRunId(undefined)} />}
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
