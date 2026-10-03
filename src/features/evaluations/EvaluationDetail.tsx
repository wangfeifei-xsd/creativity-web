import { Alert, Button, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { RunViewer } from '../../components/run-viewer/RunViewer'
import { decisions, type Candidate, type Evaluation, type Report, type Result } from './types'

export function EvaluationDetail({ identifier }: { identifier: string }) {
  const query = useQuery<Evaluation>(`/admin/v1/evaluations/${identifier}`)
  const report = useQuery<Report>(`/admin/v1/evaluations/${identifier}/comparison`)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(false)
  const [reviewedResult, setReviewedResult] = useState<Result>()
  const [resultForm] = Form.useForm()
  const [runId, setRunId] = useState<string>()
  const [checks, setChecks] = useState<Schema<'AgentValidation'>>()
  const [selected, setSelected] = useState<string>()
  const [state, setState] = useState<string>()
  const [label, setLabel] = useState<string>()
  const [form] = Form.useForm()
  const refresh = () => { query.reload(); report.reload() }
  const reloadTask = query.reload
  const reloadReport = report.reload
  useEffect(() => {
    if (!['RUNNING', 'CANCELLING'].includes(query.data?.state.value ?? '')) return
    const timer = setInterval(() => { reloadTask(); reloadReport() }, 5000)
    return () => clearInterval(timer)
  }, [query.data?.state.value, reloadTask, reloadReport])
  async function control(operation: string) {
    setBusy(true); setError(undefined)
    try { await send(`/admin/v1/evaluations/${identifier}/control`, 'POST', { revision: query.data?.revision, operation }); refresh() } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  async function rerun(row: Result) {
    setBusy(true); setError(undefined)
    try { await send(`/admin/v1/evaluation-results/${row.result_id}/rerun`, 'POST', { revision: query.data?.revision }); refresh() } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  async function saveReview(values: { decision: string; reason: string }) {
    setBusy(true); setError(undefined)
    try { await send(`/admin/v1/evaluations/${identifier}/review`, 'POST', { revision: query.data?.revision, label: values }); setReview(false); refresh() } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  async function releaseCheck() {
    if (!selected) return
    setBusy(true); setError(undefined)
    try {
      const version = await send<Schema<'AgentVersionView'>>(`/admin/v1/agent-versions/${selected}`, 'GET')
      setChecks(await send(`/admin/v1/agent-versions/${selected}/release-check`, 'POST', { revision: version.revision, evaluation_refs: [identifier] }))
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  async function saveResultReview(values: { decision: string; reason: string }) {
    if (!reviewedResult) return
    setBusy(true); setError(undefined)
    try { await send(`/admin/v1/evaluation-results/${reviewedResult.result_id}/review`, 'POST', { revision: reviewedResult.revision, label: values }); setReviewedResult(undefined); refresh() } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  const task = query.data
  const candidates = (report.data?.candidates ?? []) as Candidate[]
  const rows = (report.data?.results ?? []) as Result[]
  const labels = Array.from(new Set(rows.flatMap(r => r.labels)))
  const cost = report.data?.cost as { amounts?: Record<string, string>; unknown_count?: number; pending_count?: number; run_count?: number } | undefined
  const latency = report.data?.latency as { mean_ms?: number | null; total_ms?: number | null } | undefined
  return <PageContainer title={task.name} actions={<Space wrap><Link to="/evaluations">返回评测</Link><ActionButtons actions={task.actions} disabled={busy} handlers={{ refresh, pause: () => void control('pause'), resume: () => void control('resume'), cancel: () => void control('cancel'), review: () => setReview(true) }} /></Space>}>
    <ErrorNotice error={error ?? report.error} />
    <Descriptions items={[{ key: 'state', label: '状态', children: <StatusTag status={task.state} /> }, { key: 'dataset', label: '样本版本', children: `${task.dataset_name} · ${task.dataset_version_label}` }, { key: 'mode', label: '模式', children: task.execution_mode_label }, { key: 'time', label: '发起时间', children: formatTimestamp(task.created_at) }]} />
    {report.data?.warnings.map(w => <Alert key={w} type="warning" title={w} style={{ marginBottom: 12 }} />)}
    <Tabs items={[
      { key: 'summary', label: '对比报告', children: <><Table rowKey="candidate_id" dataSource={candidates} scroll={{ x: 850 }} columns={[
        { title: '智能体与版本', render: (_, c) => `${c.agent_name} · ${c.version_label}` }, { title: '样本数', render: (_, c) => `${c.total} 条` },
        { title: '通过率', render: (_, c) => `${(c.pass_rate * 100).toFixed(1)}%` }, { title: '相对基线', render: (_, c) => c.regression == null ? '暂无可比基线' : `${(c.regression * 100).toFixed(1)} 个百分点` },
        { title: '关键失败', render: (_, c) => `${c.critical_failures} 条` }, { title: '无效', render: (_, c) => `${c.counts.INVALID ?? 0} 条` },
        { title: '人工异议', render: (_, c) => c.human_disagreements == null ? '尚未确认' : `${c.human_disagreements} 条` },
        { title: '未完成', render: (_, c) => `${['PENDING', 'DISPATCHING', 'RUNNING', 'UNEXECUTED', 'CANCELLED'].reduce((n, s) => n + (c.counts[s] ?? 0), 0)} 条` },
        { title: '发布证据', render: (_, c) => <Tag color={c.release_passed ? 'green' : 'red'}>{c.release_passed ? '通过' : '未通过'}</Tag> },
      ]} /><Descriptions items={[
        { key: 'cost', label: '已确认费用', children: cost ? Object.entries(cost.amounts ?? {}).map(([currency, amount]) => `${amount} ${currency}`).join('、') || '暂无可定价费用' : '尚未确认' },
        { key: 'unknown', label: '费用未知', children: cost ? `${cost.unknown_count} 次调用` : '尚未确认' },
        { key: 'pending', label: '用量待核实', children: cost ? `${cost.pending_count} 次调用` : '尚未确认' },
        { key: 'latency', label: '平均运行耗时', children: latency?.mean_ms == null ? '尚未确认' : `${latency.mean_ms.toFixed(0)} 毫秒` },
        { key: 'review', label: '人工审阅', children: decisions.find(d => d.value === task.human_review?.decision)?.label ?? '尚未审阅' },
        { key: 'scope', label: '可复现性', children: report.data?.reproducible ? '固定数据可复现' : '外部数据变化或来源失效' },
      ]} /></> },
      { key: 'samples', label: '样本结果', children: <><Space wrap style={{ marginBottom: 16 }}><Select aria-label="结果筛选" allowClear placeholder="全部结果" style={{ width: 150 }} onChange={setState} options={[{ value: 'PASSED', label: '通过' }, { value: 'FAILED', label: '未通过' }, { value: 'INVALID', label: '样本无效' }, { value: 'UNEXECUTED', label: '未执行' }]} /><Select aria-label="标签筛选" allowClear placeholder="全部标签" style={{ width: 180 }} onChange={setLabel} options={labels.map(v => ({ value: v, label: v }))} /></Space><Table rowKey="result_id" dataSource={rows.filter(r => (!state || r.state === state) && (!label || r.labels.includes(label)))} scroll={{ x: 750 }} columns={[
        { title: '样本', dataIndex: 'title' }, { title: '候选', render: (_, r) => candidates.find(c => c.candidate_id === r.candidate_id)?.version_label ?? '版本不可用' }, { title: '结果', dataIndex: 'state_label' },
        { title: '失败原因', render: (_, r) => r.judgment?.violations.map(v => v.name).join('；') || r.judgment?.reason || '无' },
        { title: '确定性判定', render: (_, r) => !r.judgment ? '尚未判定' : r.judgment.human_required ? '需人工判定' : r.judgment.passed ? '通过' : '未通过' },
        { title: '语义评分', render: (_, r) => r.judgment?.semantic?.score == null ? '暂无评分' : `${(r.judgment.semantic.score * 100).toFixed(1)} 分` },
        { title: '人工结论', render: (_, r) => r.human_label ? `${decisions.find(d => d.value === r.human_label?.decision)?.label ?? '尚未复核'} · ${r.human_label.reason}` : '尚未复核' },
        { title: '相对基线', render: (_, r) => r.difference_label ?? '无可比结果' },
        { title: '执行次数', render: (_, r) => `${r.attempt_number} 次` },
        { title: '操作', render: (_, r) => <Space>{r.run_id && <Button onClick={() => setRunId(r.run_id!)}>查看运行</Button>}{['PASSED', 'FAILED'].includes(r.state) && task.actions.some(a => a.action_key === 'review_result') && <Button disabled={busy} onClick={() => { resultForm.setFieldsValue(r.human_label ?? { decision: 'approved', reason: '' }); setReviewedResult(r) }}>复核</Button>}{['PASSED', 'FAILED', 'INVALID'].includes(r.state) && <Button disabled={busy || !task.actions.some(a => a.action_key === 'rerun')} onClick={() => void rerun(r)}>重跑</Button>}</Space> },
      ]} /></> },
      { key: 'release', label: '发布检查', children: <><Space wrap style={{ marginBottom: 16 }}><Select aria-label="发布候选" style={{ width: 300, maxWidth: '100%' }} value={selected} onChange={setSelected} options={candidates.map(c => ({ value: c.version_id, label: `${c.agent_name} · ${c.version_label}` }))} /><Button onClick={() => void releaseCheck()} disabled={!selected || busy}>检查当前版本</Button></Space>
        {checks && <Table rowKey="key" dataSource={checks.checks} pagination={false} columns={[{ title: '检查项', dataIndex: 'label' }, { title: '结果', render: (_, c) => c.passed ? '通过' : '未通过' }, { title: '原因', render: (_, c) => c.passed ? '已核验' : c.issues?.map(i => i.message).join('；') }]} />}
      </> },
    ]} />
    {review && <Modal open title="审阅评测报告" onCancel={() => setReview(false)} onOk={() => form.submit()} confirmLoading={busy} okText="保存结论" cancelText="取消"><ErrorNotice error={error} /><Form form={form} layout="vertical" initialValues={{ decision: 'approved' }} onFinish={saveReview}><Form.Item name="decision" label="人工结论" rules={[{ required: true }]}><Select options={decisions} /></Form.Item><Form.Item name="reason" label="理由" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item></Form></Modal>}
    {reviewedResult && <Modal open title={`复核 · ${reviewedResult.title}`} onCancel={() => setReviewedResult(undefined)} onOk={() => resultForm.submit()} confirmLoading={busy} okText="保存结论" cancelText="取消"><ErrorNotice error={error} /><Form form={resultForm} layout="vertical" onFinish={saveResultReview}><Form.Item name="decision" label="人工结论" rules={[{ required: true }]}><Select options={decisions} /></Form.Item><Form.Item name="reason" label="复核理由" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item></Form></Modal>}
    {runId && <Modal open title="样本运行" width={1100} onCancel={() => setRunId(undefined)} footer={null}><RunViewer runId={runId} /></Modal>}
  </PageContainer>
}
