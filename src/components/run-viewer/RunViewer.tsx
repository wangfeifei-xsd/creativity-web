import { Alert, Button, Collapse, Descriptions, Space, Timeline, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, ApiError } from '../../api/client'
import { download } from '../../features/conversations/download'
import { followRunEvents } from '../../api/event-stream'
import { formatTimestamp } from '../../api/presentation'
import { ActionButtons, ErrorNotice, type Schema } from '../Management'
import { ContentDeletion } from '../ContentDeletion'
import { DeletionSteps } from '../DeletionSteps'
import { ErrorState, LoadingState } from '../States'
import { Interruption } from './Interruption'

export type RunDetail = Schema<'RunDetail'>

type Attempt = { attempt_id: string; state_label: string; kind_label: string; started_at: string; finished_at: string | null; error: { message: string } | null }
type Step = { step_id: string; name: string; state_label: string; attempts: Attempt[] }
type Trace = { items: Step[]; next_sequence: number | null }
const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])
const businessLabels: Record<string, string> = { COMPLETED: '已完成', NEEDS_INPUT: '待补充信息', NO_MATCH: '暂无匹配', INSUFFICIENT_DATA: '信息不足', PARTIAL: '部分完成' }
function pretty(value: unknown) { return JSON.stringify(value, null, 2) }

async function readRun(runId: string, signal?: AbortSignal): Promise<[RunDetail, Trace]> {
  const [value, timeline] = await Promise.all([
    apiClient.request<RunDetail>(`/admin/v1/runs/${runId}/detail`, { signal }),
    apiClient.request<Trace>(`/admin/v1/runs/${runId}/trace`, { signal }),
  ])
  if (value?.run_id !== runId || !Array.isArray(value.actions) || !Array.isArray(timeline?.items)) {
    throw new ApiError('运行响应格式不正确，请刷新重试', 502, null)
  }
  return [value, timeline]
}

export function RunViewer({ runId, onCompleted }: { runId: string; onCompleted?: () => void }) {
  return <RunContent key={runId} runId={runId} onCompleted={onCompleted} />
}

function RunContent({ runId, onCompleted }: { runId: string; onCompleted?: () => void }) {
  const [detail, setDetail] = useState<RunDetail>()
  const [trace, setTrace] = useState<Trace>()
  const [partial, setPartial] = useState('')
  const [error, setError] = useState<unknown>()
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletionId, setDeletionId] = useState<string>()
  const cursor = useRef({ runId, sequence: 0 })
  const completed = useRef(false)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [value, timeline] = await readRun(runId, signal)
    if (signal?.aborted) return
    setDetail(value); setTrace(timeline); setError(undefined)
  }, [runId])
  useEffect(() => {
    const controller = new AbortController()
    void readRun(runId, controller.signal).then(([value, timeline]) => {
      if (!controller.signal.aborted) { setDetail(value); setTrace(timeline) }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure) })
    return () => controller.abort()
  }, [runId])
  const active = detail && !deletionId && !terminal.has(detail.state)
  const streamAllowed = active && detail.content_allowed
  useEffect(() => {
    if (detail && terminal.has(detail.state) && !completed.current) {
      completed.current = true
      onCompleted?.()
    }
  }, [detail, onCompleted])
  useEffect(() => {
    if (!streamAllowed) return
    const controller = new AbortController()
    void followRunEvents(`/admin/v1/runs/${runId}/events`, event => {
      if (event.id !== null) cursor.current = { runId, sequence: event.id }
      const envelope = event.data as { payload: { text?: string } }
      if (event.event === 'text_delta') setPartial(text => text + (envelope.payload.text ?? ''))
      if (event.event === 'completed') {
        void refresh(controller.signal).catch(setError)
      }
    }, controller.signal, cursor.current.runId === runId ? cursor.current.sequence : 0).catch(failure => {
      if (controller.signal.aborted) return
      if (failure?.code === 'EVENTS_EXPIRED') {
        setNotice('事件已过期，已切换为运行快照')
        void refresh(controller.signal).catch(setError)
      } else setError(failure)
    })
    return () => controller.abort()
  }, [streamAllowed, runId, refresh])
  // SSE 不可用或已过期时仍可查询原运行；断线不创建或取消任务。
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = setInterval(() => { void refresh(controller.signal).catch(failure => { if (!controller.signal.aborted) setError(failure) }) }, 5000)
    return () => { clearInterval(timer); controller.abort() }
  }, [active, refresh])
  async function mutate(action: 'cancel' | 'rerun') {
    setBusy(true); setError(undefined)
    try {
      const next = await apiClient.request<Schema<'AdmissionReceipt'>>(`/admin/v1/runs/${runId}/${action}`, {
        method: 'POST', body: JSON.stringify(action === 'rerun' ? { input: null } : {}),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      if (action === 'rerun') setNotice(`已创建新运行`)
      if (next.run_id !== runId) setNewRun(next.run_id)
      await refresh()
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  const [newRun, setNewRun] = useState<string>()
  if (deletionId) return <DeletionSteps deletionId={deletionId} />
  if (!detail) return error ? <ErrorState error={error} onRetry={() => void refresh().catch(setError)} /> : <LoadingState />
  const result = detail.result
  const usage = result?.usage_summary
  const storedPartial = result?.partial_output as { text?: string } | null | undefined
  return <Space orientation="vertical" style={{ width: '100%' }} size="large">
    {deleting && <ContentDeletion resourceType="run" resourceId={runId} onClose={() => setDeleting(false)} onDeleted={id => { setDeleting(false); setDeletionId(id); setPartial(''); setDetail(undefined); setTrace(undefined) }} />}
    <Space wrap><Typography.Text strong>{detail.name}</Typography.Text>
      <Button onClick={() => void refresh().catch(setError)}>刷新</Button>
      <ActionButtons actions={detail.actions} disabled={busy} handlers={{ cancel: () => void mutate('cancel'), rerun: () => void mutate('rerun'), delete: () => setDeleting(true) }} />
      {detail.conversation_id && <Link to={`/conversations/${detail.conversation_id}`}>查看会话</Link>}
      {newRun && <Link to={`/runs/${newRun}`}>查看新运行</Link>}
    </Space>
    <ErrorNotice error={error} />{notice && <Alert type="info" title={notice} />}
    <Descriptions items={[
      { key: 'state', label: '状态', children: detail.state_label },
      { key: 'purpose', label: '用途', children: detail.purpose_label },
      { key: 'created', label: '发起时间', children: formatTimestamp(detail.created_at) },
      { key: 'deadline', label: '截止时间', children: formatTimestamp(detail.deadline) },
      { key: 'completed', label: '结束时间', children: detail.completed_at ? formatTimestamp(detail.completed_at) : '尚未结束' },
    ]} />
    {detail.error && <Alert type="error" title={detail.error.message} />}
    {detail.content_allowed && ['WAITING_INPUT', 'WAITING_APPROVAL'].includes(detail.state) && <Interruption runId={runId} snapshot={detail} onResumed={refresh} />}
    {!detail.content_allowed && <Alert type="info" title="当前权限可查看执行轨迹，输入输出未授权" />}
    {result?.result && <><Typography.Text strong>{businessLabels[result.result.business_status] ?? '业务结果'}</Typography.Text>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>{pretty(result.result.data)}</pre>
      {result.result.warnings.map((warning, index) => <Alert key={index} type="warning" title={warning} />)}</>}
    {detail.content_allowed && detail.state !== 'SUCCEEDED' && (partial || storedPartial?.text) && <Collapse items={[{ key: 'partial', label: '部分内容（尚未通过结果校验）', children:
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{partial || storedPartial?.text}</pre> }]} />}
    {usage && <Descriptions title="用量" items={[
      { key: 'count', label: '模型调用', children: usage.attempt_count == null ? '未提供' : `${usage.attempt_count} 次` },
      { key: 'input', label: '输入', children: usage.input_tokens == null ? '待核实' : `${usage.input_tokens} Token` },
      { key: 'output', label: '输出', children: usage.output_tokens == null ? '待核实' : `${usage.output_tokens} Token` },
      { key: 'complete', label: '完整性', children: usage.complete ? '已核实' : '待核实' },
      { key: 'price', label: '未定价调用', children: usage.unpriced_count == null ? '未提供' : `${usage.unpriced_count} 次` },
      { key: 'amount', label: '费用', children: Object.entries((usage.amounts ?? {}) as Record<string, { reported_amount: string | null; complete: boolean }>).map(([currency, value]) => `${value.reported_amount ?? '待核实'} ${currency}${value.complete ? '' : '（未完整）'}`).join('；') || '未定价' },
    ]} />}
    {result?.artifacts.map(artifact => <Button key={artifact.artifact_id} onClick={async () => {
      try { await download(artifact.download_path) } catch (failure) { setError(failure) }
    }}>{artifact.name}</Button>)}
    {trace && <><Timeline items={trace.items.map(step => ({ key: step.step_id, content: <>
      <Typography.Text strong>{step.name}</Typography.Text> · {step.state_label}
      {step.attempts.map((attempt, index) => <div key={attempt.attempt_id}>{attempt.kind_label} {index + 1} · {attempt.state_label} · {formatTimestamp(attempt.started_at)}{attempt.error && ` · ${attempt.error.message}`}</div>)}
    </> }))} />{trace.next_sequence && <Button onClick={async () => {
      try { const next = await apiClient.request<Trace>(`/admin/v1/runs/${runId}/trace?after_sequence=${trace.next_sequence}`); setTrace({ ...next, items: [...trace.items, ...next.items] }) } catch (failure) { setError(failure) }
    }}>加载后续步骤</Button>}</>}
    <Collapse items={[
      { key: 'resource-uses', label: '资源使用', children: (detail.resource_uses ?? []).map((resource, index) => <div key={index}>{String(resource.type)}：{String(resource.name)}{resource.deleted ? '（已删除）' : ''} · {formatTimestamp(String(resource.used_at))}</div>) },
      ...(detail.content_allowed ? [{ key: 'input', label: '输入与配置快照', children: <><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{pretty(detail.input)}</pre>{detail.versions.map(v => <div key={v.version_id}>{v.name}</div>)}</> }] : []),
      ...(detail.content_allowed && detail.actual_inputs?.length ? [{ key: 'actual', label: '实际输入与加载记录', children: detail.actual_inputs.map((entry, index) => <div key={index}><Typography.Text strong>{entry.name}</Typography.Text><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{pretty(entry.value)}</pre></div>) }] : []),
      ...(detail.content_allowed && detail.evidence?.length ? [{ key: 'evidence', label: '工具证据', children: detail.evidence.map((entry, index) => <Descriptions key={index} items={[
        { key: 'title', label: '来源', children: entry.title || '名称未提供' },
        { key: 'observed', label: '观测时间', children: formatTimestamp(entry.observed_at) },
        { key: 'version', label: '来源版本', children: entry.source_version },
      ]} />) }] : []),
      { key: 'diagnostics', label: '排障详情', children: <><Typography.Paragraph copyable>{runId}</Typography.Paragraph>{trace?.items.map(step => <div key={step.step_id}><Typography.Text copyable>{step.step_id}</Typography.Text>{step.attempts.map(a => <Typography.Paragraph key={a.attempt_id} copyable>{a.attempt_id}</Typography.Paragraph>)}</div>)}</> },
    ]} />
  </Space>
}
