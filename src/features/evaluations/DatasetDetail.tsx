import { Alert, Button, Descriptions, Form, Input, Modal, Select, Space, Tabs, Upload } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { applyFormErrors, clearFormErrors } from '../../api/form-errors'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { decisions, parse, pretty, type Dataset, type Sample } from './types'

type CaseView = Schema<'EvaluationCaseView'>

export function DatasetDetail({ identifier }: { identifier: string }) {
  const query = useQuery<Dataset>(`/admin/v1/evaluation-datasets/${identifier}`)
  const [selected, setSelected] = useState<string>()
  const [editor, setEditor] = useState<'sample' | 'import' | 'run'>()
  const [editing, setEditing] = useState<CaseView>()
  const data = query.data
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!data) return <LoadingState />
  const version = data.versions?.find(v => v.version_id === selected) ?? data.versions?.at(-1)
  const saved = () => { setEditor(undefined); setEditing(undefined); setSelected(undefined); query.reload() }
  return <PageContainer title={data.name} actions={<Space wrap><Link to="/evaluations">返回评测</Link><Button onClick={query.reload}>刷新</Button><ActionButtons actions={data.actions ?? []} handlers={{ version: () => setEditor('sample'), import: () => setEditor('import') }} />
    {data.actions?.some(a => a.action_key === 'version') && <Button onClick={() => setEditor('run')}>从运行登记反馈</Button>}</Space>}>
    <Descriptions items={[{ key: 'owner', label: '负责人', children: data.owner }, { key: 'scope', label: '适用范围', children: data.applicability }]} />
    <Select aria-label="样本版本" style={{ width: 280, maxWidth: '100%', marginBottom: 16 }} value={version?.version_id} onChange={setSelected} options={data.versions?.map(v => ({ value: v.version_id, label: v.version_label }))} />
    {version && <><Descriptions items={[{ key: 'time', label: '固定数据时间', children: formatTimestamp(version.captured_at) }, { key: 'count', label: '样本数量', children: `${version.cases.length} 条` }]} />
      <Table rowKey="case_id" dataSource={version.cases} expandable={{ expandedRowRender: row => row.payload ? <Tabs items={[
        { key: 'input', label: '输入', children: <Json value={row.payload.input} /> }, { key: 'assertions', label: '预期与约束', children: <Json value={row.payload.assertions} /> },
        { key: 'fixture', label: '工具夹具', children: <Json value={row.payload.fixture} /> }, { key: 'source', label: '来源与人工标注', children: <><p>{row.payload.label_source}</p><p>{row.payload.human_label?.reason ?? '尚未审阅'}</p></> },
      ]} /> : <Alert title={row.valid ? '无权读取样本原文' : '来源已删除'} type="info" /> }} columns={[
        { title: '样本', dataIndex: 'title' }, { title: '标签', render: (_, row) => row.payload?.labels?.join('、') || '未提供' },
        { title: '标签来源', render: (_, row) => row.payload?.label_source ?? '无权读取' },
        { title: '人工结论', render: (_, row) => decisions.find(d => d.value === row.payload?.human_label?.decision)?.label ?? '尚未审阅' },
        { title: '操作', render: (_, row) => row.payload && version.version_id === data.current_version_id && data.actions?.some(a => a.action_key === 'review') ? <Button onClick={() => setEditing(row)}>标注</Button> : null },
      ]} />
    </>}
    {editor === 'sample' && <SampleEditor dataset={data} onClose={() => setEditor(undefined)} onSaved={saved} />}
    {editor === 'import' && <ImportDialog dataset={data} onClose={() => setEditor(undefined)} onSaved={saved} />}
    {editor === 'run' && <RunSourceDialog dataset={data} onClose={() => setEditor(undefined)} onSaved={saved} />}
    {editing?.payload && <LabelDialog dataset={data} sample={editing} onClose={() => setEditing(undefined)} onSaved={saved} />}
  </PageContainer>
}

export function Json({ value }: { value: unknown }) { return <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{pretty(value)}</pre> }

function SampleEditor({ dataset, onClose, onSaved }: { dataset: Dataset; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  async function save(values: Record<string, string>) {
    setBusy(true); setError(undefined); clearFormErrors(form)
    try {
      const current = dataset.versions?.at(-1)
      if (current?.cases.some(c => !c.payload)) throw new Error('当前版本含无权读取或已失效样本，请导入完整新版本')
      const sample: Sample = { source_mode: 'all', case_key: values.case_key, title: values.title, input: parse(values.input, {}), assertions: parse(values.assertions, []), label_source: values.label_source, labels: values.labels?.split(/[，,]/).filter(Boolean) ?? [], fixture: parse(values.fixture, []) }
      await send(`/admin/v1/evaluation-datasets/${dataset.dataset_id}/versions`, 'POST', { revision: dataset.revision, version_label: values.version_label, captured_at: new Date().toISOString(), reference_versions: current?.reference_versions ?? [], cases: [...(current?.cases.map(c => c.payload) ?? []), sample] }); onSaved()
    } catch (failure) {
      setError(failure)
      applyFormErrors(form, failure, path => path[0] === 'cases'
        ? path[1] === (dataset.versions?.at(-1)?.cases.length ?? 0) ? [String(path[2] ?? 'assertions')] : []
        : path)
    } finally { setBusy(false) }
  }
  return <Modal open title="新增样本版本" width={720} onCancel={onClose} onOk={() => form.submit()} confirmLoading={busy} okText="保存" cancelText="取消"><ErrorNotice error={error} />
    <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
      {[['version_label', '新版本名称'], ['title', '样本标题'], ['case_key', '样本定位键'], ['label_source', '标签来源']].map(([name, label]) => <Form.Item key={name} name={name} label={label} rules={[{ required: true }]}><Input /></Form.Item>)}
      <Form.Item name="labels" label="标签"><Input /></Form.Item>
      <Form.Item name="input" label="输入（JSON）" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="assertions" label="预期与断言（JSON）" rules={[{ required: true }]}><Input.TextArea rows={5} /></Form.Item>
      <Form.Item name="fixture" label="工具夹具（JSON）"><Input.TextArea rows={3} /></Form.Item>
    </Form></Modal>
}

function LabelDialog({ dataset, sample, onClose, onSaved }: { dataset: Dataset; sample: CaseView; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  async function save(values: { version_label: string; decision: string; reason: string }) {
    setBusy(true)
    try { await send(`/admin/v1/evaluation-cases/${sample.case_id}`, 'PATCH', { revision: dataset.revision, version_label: values.version_label, case: { ...sample.payload, human_label: { decision: values.decision, reason: values.reason } } }); onSaved() } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Modal open title={`标注 · ${sample.title}`} onCancel={onClose} onOk={() => form.submit()} confirmLoading={busy} okText="生成新版本" cancelText="取消"><ErrorNotice error={error} /><Form form={form} layout="vertical" onFinish={save} initialValues={{ decision: 'approved' }}>
    <Form.Item name="version_label" label="新版本名称" rules={[{ required: true }]}><Input /></Form.Item>
    <Form.Item name="decision" label="人工结论" rules={[{ required: true }]}><Select options={decisions} /></Form.Item>
    <Form.Item name="reason" label="理由" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
  </Form></Modal>
}

function ImportDialog({ dataset, onClose, onSaved }: { dataset: Dataset; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const [preview, setPreview] = useState<Schema<'ImportPreview'>>()
  const [body, setBody] = useState<Record<string, unknown>>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  async function submit(values: Record<string, string>) {
    setBusy(true); setError(undefined)
    try { const request = { ...values, revision: dataset.revision, mapping: parse(values.mapping, {}), captured_at: new Date().toISOString(), commit: false }; setBody(request); setPreview(await send(`/admin/v1/evaluation-datasets/${dataset.dataset_id}/imports`, 'POST', request)) } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  async function commit() {
    setBusy(true); setError(undefined)
    try { await send(`/admin/v1/evaluation-datasets/${dataset.dataset_id}/imports`, 'POST', { ...body, commit: true, preview_digest: preview?.preview_digest }); onSaved() } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Modal open title="导入样本" width={800} onCancel={onClose} footer={<Space><Button onClick={onClose}>取消</Button><Button onClick={() => form.submit()} loading={busy}>预览</Button><Button type="primary" onClick={() => void commit()} disabled={!preview || preview.error_count > 0 || busy}>确认导入</Button></Space>}>
    <ErrorNotice error={error} /><Form form={form} layout="vertical" initialValues={{ format: 'jsonl' }} onFinish={submit} onValuesChange={() => setPreview(undefined)}>
      <Form.Item name="version_label" label="新版本名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="format" label="文件格式"><Select options={[{ value: 'jsonl', label: 'JSONL' }, { value: 'csv', label: 'CSV' }]} /></Form.Item>
      <Form.Item label="选择文件"><Upload accept=".jsonl,.csv" maxCount={1} beforeUpload={async file => { form.setFieldValue('content', await file.text()); setPreview(undefined); return false }}><Button>选择样本文件</Button></Upload></Form.Item>
      <Form.Item name="mapping" label="字段映射（来源字段 → 样本字段）"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="content" label="样本内容" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item>
    </Form>
    {preview && <><p>可导入 {preview.valid_count} 条，错误 {preview.error_count} 条</p><Table rowKey="row_number" dataSource={preview.rows} columns={[{ title: '行号', dataIndex: 'row_number' }, { title: '样本', render: (_, row) => row.case?.title ?? '不合法样本' }, { title: '检查结果', render: (_, row) => row.errors.join('；') || '通过' }]} /></>}
  </Modal>
}

function RunSourceDialog({ dataset, onClose, onSaved }: { dataset: Dataset; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  async function save(values: Record<string, string>) {
    setBusy(true)
    try { const { input_paths, assertions, reason, ...rest } = values; await send(`/admin/v1/evaluation-datasets/${dataset.dataset_id}/from-run`, 'POST', { ...rest, revision: dataset.revision, input_paths: input_paths.split(/[，,\n]/).map(v => v.trim()).filter(Boolean), assertions: parse(assertions, []), review: { decision: 'approved', reason } }); onSaved() } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Modal open title="登记经审阅反馈" onCancel={onClose} onOk={() => form.submit()} confirmLoading={busy} okText="登记" cancelText="取消"><ErrorNotice error={error} /><Form form={form} layout="vertical" onFinish={save}>
    {[['run_id', '来源运行引用'], ['title', '样本标题'], ['case_key', '样本定位键'], ['version_label', '新版本名称'], ['label_source', '标签来源'], ['input_paths', '脱敏后保留的输入字段'], ['reason', '审阅理由']].map(([name, label]) => <Form.Item key={name} name={name} label={label} rules={[{ required: true }]}><Input /></Form.Item>)}
    <Form.Item name="assertions" label="预期与断言（JSON）" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
  </Form></Modal>
}
