import { RunViewer } from '../../components/run-viewer/RunViewer'
import { Alert, Button, Collapse, Descriptions, Form, Input, Modal, Select, Space, Table, Typography } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { applyFormErrors } from '../../api/form-errors'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { BindingFields, RenderResult } from './Preview'
import { parseBindings, type BindingValues } from './binding-values'
import { contentOf, errorText, jsonDisplay, send, type RouteOption, type Schema, type Version } from './types'

export function PromptDebug({ version }: { version: Version }) {
  const id = version.version.version_id, promptId = version.version.resource_id
  const tests = useQuery<Schema<'PromptTestView'>[]>(`/admin/v1/prompt-versions/${id}/tests`)
  const samples = useQuery<Schema<'PromptSampleView'>[]>(`/admin/v1/prompts/${promptId}/samples`)
  const routes = useQuery<RouteOption[]>('/admin/v1/prompt-model-routes')
  const [form] = Form.useForm<Schema<'PromptTestRequest'>>()
  const [sampleForm] = Form.useForm<BindingValues & { title: string; constraints?: string }>()
  const [sampleOpen, setSampleOpen] = useState(false)
  const [selected, setSelected] = useState<Schema<'PromptTestView'>>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const canRun = version.actions.some(action => action.action_key === 'run:create')
  const canEdit = version.actions.some(action => action.action_key === 'prompt:manage')
  const canReveal = version.actions.some(action => action.action_key === 'data:read_sensitive')
  async function submit(prepare: boolean) {
    setError(undefined); setBusy(true)
    try {
      const values = await form.validateFields()
      const test = await send<Schema<'PromptTestView'>>(`/admin/v1/prompt-versions/${id}/${prepare ? 'test-descriptors' : 'tests'}`, { ...values, revision: version.revision })
      setSelected(test); tests.reload()
    } catch (error) { applyFormErrors(form, error); setError(errorText(error)); tests.reload() }
    finally { setBusy(false) }
  }
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    {error && <Alert type="error" title={error} />}
    {!!samples.error && <ErrorState error={samples.error} onRetry={samples.reload} />}
    {!!routes.error && <ErrorState error={routes.error} onRetry={routes.reload} />}
    <Form form={form} layout="vertical">
      <Form.Item name="model_route_version" label="模型路由版本" rules={[{ required: true, message: '请选择模型路由版本' }]}><Select loading={!routes.data && !routes.error} options={routes.data?.map(route => ({ value: route.version_id, label: `${route.name ?? '名称不可用'} · ${route.version_label}` }))} /></Form.Item>
      <Form.Item name="sample_id" label="固定样例" rules={[{ required: true, message: '请选择样例' }]}><Select options={samples.data?.map(sample => ({ value: sample.sample_id, label: sample.title }))} /></Form.Item>
      <Space wrap>
        {canRun && <><Button type="primary" loading={busy} onClick={() => void submit(false)}>开始调试</Button><Button loading={busy} onClick={() => void submit(true)}>保存测试快照</Button></>}
        {canEdit && <Button onClick={() => setSampleOpen(true)}>添加样例</Button>}
        <Button onClick={tests.reload}>刷新测试</Button>
      </Space>
    </Form>
    {tests.error ? <ErrorState error={tests.error} onRetry={tests.reload} /> : !tests.data ? <LoadingState /> : <Table rowKey="test_id" dataSource={tests.data} columns={[
      { title: '样例', dataIndex: 'sample_title' }, { title: '版本', dataIndex: 'version_label' },
      { title: '草稿修订', render: (_, row) => row.draft_revision ?? '已发布版本' },
      { title: '模型路由', render: (_, row) => row.model_route_name || '名称不可用' },
      { title: '状态', render: (_, row) => <StatusTag status={row.status} /> },
      { title: '测试时间', render: (_, row) => formatTimestamp(row.created_at) },
      { title: '操作', render: (_, row) => <Button onClick={() => setSelected(row)}>查看快照</Button> },
    ]} />}
    <Modal title="添加样例" open={sampleOpen} onCancel={() => setSampleOpen(false)} confirmLoading={busy} onOk={async () => {
      setError(undefined); setBusy(true)
      try {
        const values = await sampleForm.validateFields()
        await send(`/admin/v1/prompts/${promptId}/samples`, { title: values.title, input: parseBindings(contentOf(version).variables ?? [], values), expected_constraints: (values.constraints ?? '').split('\n').filter(Boolean) })
        sampleForm.resetFields(); setSampleOpen(false); samples.reload()
      } catch (error) { applyFormErrors(sampleForm, error); setError(errorText(error)) }
      finally { setBusy(false) }
    }}>
      {sampleOpen && error && <Alert title={error} type="error" />}
      <Form form={sampleForm} layout="vertical"><Form.Item name="title" label="样例名称" rules={[{ required: true, message: '请填写样例名称' }]}><Input /></Form.Item>
        <BindingFields variables={contentOf(version).variables ?? []} />
        <Form.Item name="constraints" label="输出约束（每行一项）"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="测试快照" open={!!selected} onCancel={() => setSelected(undefined)} footer={null} width={850}>
      {selected && <Space orientation="vertical" style={{ width: '100%' }}>
        <Descriptions items={[{ key: 'version', label: '提示词版本', children: selected.version_label }, { key: 'time', label: '测试时间', children: formatTimestamp(selected.created_at) }]} />
        {canReveal && selected.masked && <Button onClick={async () => {
          try { setSelected(await apiClient.request(`/admin/v1/prompt-tests/${selected.test_id}?reveal=true`)) }
          catch (error) { setError(errorText(error)) }
        }}>查看完整渲染和结果</Button>}
        {!selected.run_id && canRun && <Button loading={busy} onClick={async () => {
          setBusy(true)
          try { setSelected(await send(`/admin/v1/prompt-tests/${selected.test_id}/submit`, {})); tests.reload() }
          catch (error) { setError(errorText(error)) }
          finally { setBusy(false) }
        }}>执行此快照</Button>}
        {error && <Alert type="error" title={error} />}
        {selected.run_id && <RunViewer key={selected.run_id} runId={selected.run_id} />}<RenderResult value={selected.rendered} />
        <Typography.Title level={5}>模型结果</Typography.Title>
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selected.output == null ? (selected.masked ? '内容已脱敏' : '暂无结果') : jsonDisplay(selected.output)}</Typography.Paragraph>
        <Collapse items={[{ key: 'snapshot', label: '模板配置快照', children: <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(selected.snapshot.content, null, 2)}</pre> }]} />
      </Space>}
    </Modal>
  </Space>
}
