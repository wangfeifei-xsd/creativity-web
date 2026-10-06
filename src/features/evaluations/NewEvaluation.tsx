import { Alert, Form, Input, InputNumber, Modal, Select, Switch } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import type { Dataset, Evaluation } from './types'

export function NewEvaluation({ datasets, onClose, onSaved, promptId }: { datasets: Dataset[]; onClose: () => void; onSaved: (value: Evaluation) => void; promptId?: string }) {
  const [form] = Form.useForm()
  const [datasetId, setDatasetId] = useState(datasets[0]?.dataset_id)
  const dataset = useQuery<Dataset>(datasetId ? `/admin/v1/evaluation-datasets/${datasetId}` : null)
  const agents = useQuery<Schema<'AgentList'>>('/admin/v1/agents')
  const evaluations = useQuery<Schema<'EvaluationList'>>('/admin/v1/evaluations')
  const [agentId, setAgentId] = useState<string>()
  const agent = useQuery<Schema<'AgentDetail'>>(agentId ? `/admin/v1/agents/${agentId}` : null)
  const prompts = useQuery<Schema<'PromptVersionView'>[]>(promptId ? `/admin/v1/prompts/${promptId}/versions` : null)
  const versions = agent.data?.versions.filter(v => !promptId || prompts.data?.some(p => p.version.version_id === v.definition.bindings.prompt_id))
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const mode = Form.useWatch('execution_mode', form)
  const baselineId = Form.useWatch('baseline_evaluation_id', form)
  const candidateIds = Form.useWatch('candidates', form) as string[] | undefined
  const baselineOptions = baselineId
    ? (evaluations.data?.items.find(e => e.evaluation_id === baselineId)?.candidates as { version_id: string; version_label: string }[] | undefined)?.map(c => ({ value: c.version_id, label: c.version_label }))
    : versions?.filter(v => candidateIds?.includes(v.version_id)).map(v => ({ value: v.version_id, label: v.version_label }))
  async function create(values: Record<string, unknown>) {
    setBusy(true); setError(undefined)
    try {
      const ids = values.candidates as string[]
      const candidates = ids.map(id => ({ version_id: id, revision: agent.data?.versions.find(v => v.version_id === id)?.revision }))
      const task = await send<Evaluation>('/admin/v1/evaluations', 'POST', { experiment_prompt_id: promptId ?? null, name: values.name, dataset_version_id: values.dataset_version_id, candidates, baseline_candidate_version_id: values.baseline || null, baseline_evaluation_id: values.baseline_evaluation_id || null, execution_mode: values.execution_mode, concurrency: values.concurrency, budget: { max_runs: values.max_runs, token_limit: values.token_limit, cost_limit: values.cost_amount ? { amount: String(values.cost_amount), currency: values.cost_currency } : null }, minimum_pass_rate: Number(values.minimum_pass_rate) / 100, maximum_regression: Number(values.maximum_regression) / 100, release_target: !!values.release_target }); onSaved(task)
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Modal open title={promptId ? '提示词实验' : '发起评测'} width={680} onCancel={onClose} onOk={() => form.submit()} confirmLoading={busy} okText="开始评测" cancelText="取消">
    <ErrorNotice error={error ?? agents.error ?? evaluations.error ?? prompts.error ?? (datasetId ? dataset.error : undefined) ?? (agentId ? agent.error : undefined)} />
    <Form name="evaluation" form={form} layout="vertical" onFinish={create} disabled={busy} initialValues={{ execution_mode: 'fixture', concurrency: 2, max_runs: 100, token_limit: 1000000, minimum_pass_rate: 100, maximum_regression: 0, release_target: !promptId }}>
      <Form.Item name="name" label="任务名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item label="样本集"><Select value={datasetId} onChange={value => { setDatasetId(value); form.setFieldValue('dataset_version_id', undefined) }} options={datasets.map(d => ({ value: d.dataset_id, label: d.name }))} /></Form.Item>
      <Form.Item name="dataset_version_id" label="样本与标签版本" rules={[{ required: true }]}><Select options={dataset.data?.versions?.map(v => ({ value: v.version_id, label: `${v.version_label} · ${v.cases.length} 条` }))} /></Form.Item>
      <Form.Item label="智能体"><Select value={agentId} onChange={value => { setAgentId(value); form.setFieldsValue({ candidates: [], baseline: undefined }) }} options={agents.data?.items.map(a => ({ value: a.agent_id, label: a.name }))} /></Form.Item>
      <Form.Item name="candidates" label="候选版本" rules={[{ required: true, type: 'array', min: promptId ? 2 : 1, message: promptId ? '至少选择两个候选版本' : '请选择候选版本' }]}><Select mode="multiple" options={versions?.map(v => ({ value: v.version_id, label: `${v.version_label} · ${v.status.label}` }))} /></Form.Item>
      <Form.Item hidden={!!promptId} name="baseline_evaluation_id" label="历史基线报告"><Select allowClear onChange={() => form.setFieldValue('baseline', undefined)} options={evaluations.data?.items.filter(e => e.state.value === 'COMPLETED').map(e => ({ value: e.evaluation_id, label: `${e.name} · ${e.dataset_version_label}` }))} /></Form.Item>
      <Form.Item name="baseline" label={baselineId ? '历史基线版本' : '同批基线版本'} rules={[{ required: !!baselineId || !!promptId }]}><Select allowClear options={baselineOptions} /></Form.Item>
      <Form.Item hidden={!!promptId} name="execution_mode" label="执行模式"><Select options={[{ value: 'fixture', label: '固定数据评测' }, { value: 'live_readonly', label: '实时只读评测' }]} /></Form.Item>
      {mode === 'live_readonly' && <Alert title="外部数据可能变化，实时报告不能用作固定数据发布证据" type="warning" style={{ marginBottom: 16 }} />}
      <Form.Item hidden={!!promptId} name="release_target" label="用于正式发布" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="concurrency" label="同时执行上限（个）"><InputNumber min={1} max={16} /></Form.Item>
      <Form.Item name="max_runs" label="运行次数预算（次，含重跑）"><InputNumber min={1} max={10000} /></Form.Item>
      <Form.Item name="token_limit" label="Token 预算（个）"><InputNumber min={1} max={1000000000} /></Form.Item>
      <Form.Item name="cost_amount" label="金额预算"><InputNumber min={0.01} stringMode /></Form.Item>
      <Form.Item name="cost_currency" label="预算币种" initialValue="CNY"><Select options={[{ value: 'CNY', label: '人民币（元）' }, { value: 'USD', label: '美元' }]} /></Form.Item>
      <Form.Item name="minimum_pass_rate" label="最低通过率（%）"><InputNumber min={0} max={100} /></Form.Item>
      <Form.Item name="maximum_regression" label="允许通过率下降（百分点）"><InputNumber min={0} max={100} /></Form.Item>
    </Form>
  </Modal>
}
