import { Alert, Button, Form, Input, Modal, Select, Space, Upload } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { applyFormErrors } from '../../api/form-errors'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { useResourceSummaries } from '../resources/useResourceSummaries'
import { resourceColumns } from '../resources/resourceColumns'
import { PromptDetail } from './PromptDetail'
import { errorText, send, type Prompt, type Schema, type Version } from './types'

type CreateValues = Schema<'PromptCreate'> & { format: 'text' | 'json'; data: string; version_label: string }
export function PromptsPage() {
  const query = useQuery<Schema<'PromptListView'>>('/admin/v1/prompts')
  const summaries = useResourceSummaries('prompt', query.data?.items.map(row => row.prompt_id) ?? [], query.data)
  const [selected, setSelected] = useState<string>()
  const [mode, setMode] = useState<'create' | 'import'>()
  const [form] = Form.useForm<CreateValues>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  function open(mode: 'create' | 'import') { form.resetFields(); setError(undefined); setMode(mode) }
  if (selected) return <PromptDetail promptId={selected} onBack={() => { setSelected(undefined); query.reload() }} />
  return <PageContainer title="提示词管理" actions={<Space><Button onClick={query.reload}>刷新</Button>
    {query.data?.actions.some(action => action.action_key === 'prompt:manage') && <><Button type="primary" onClick={() => open('create')}>创建提示词</Button><Button onClick={() => open('import')}>导入</Button></>}</Space>}>
    {Boolean(summaries.error) && <Alert type="error" title={errorText(summaries.error)} />}
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="prompt_id" dataSource={query.data.items} scroll={{ x: 950 }} columns={[
      { title: '名称', render: (_, row) => <Button type="link" onClick={() => setSelected(row.prompt_id)}>{row.name}</Button> },
      { title: '用途', dataIndex: 'purpose' },
      { title: '最近测试', render: (_, row) => formatTimestamp(row.last_test_at) },
      ...resourceColumns<Prompt>('prompt', summaries.items, row => row.prompt_id, row => setSelected(row.prompt_id), query.reload),
    ]} />}
    <Modal title={mode === 'import' ? '导入提示词' : '创建提示词'} open={!!mode} onCancel={() => setMode(undefined)} confirmLoading={busy} onOk={async () => {
      setBusy(true); setError(undefined)
      try {
        const values = await form.validateFields()
        const resource = { prompt_code: values.prompt_code, name: values.name, purpose: values.purpose }
        const promptId = mode === 'import'
          ? (await send<Version>('/admin/v1/prompts/import', { resource, format: values.format, data: values.data })).version.resource_id
          : (await send<Prompt>('/admin/v1/prompts', resource)).prompt_id
        setMode(undefined); query.reload(); setSelected(promptId)
      } catch (error) { applyFormErrors(form, error); setError(errorText(error)) }
      finally { setBusy(false) }
    }}>
      {error && <Alert type="error" title={error} />}
      <Form form={form} layout="vertical" initialValues={{ format: 'json', version_label: 'v1' }}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请填写名称' }]}><Input /></Form.Item>
        <Form.Item name="prompt_code" label="编码" rules={[{ required: true, message: '请填写编码' }]}><Input /></Form.Item>
        <Form.Item name="purpose" label="用途" rules={[{ required: true, message: '请填写用途' }]}><Input.TextArea rows={2} /></Form.Item>
        {mode === 'import' && <>
          <Form.Item name="format" label="文件格式"><Select options={[{ value: 'json', label: '结构化配置' }, { value: 'text', label: '文本' }]} /></Form.Item>
          <Upload accept=".json,.txt" maxCount={1} beforeUpload={async file => {
            if (file.size > 1000000) { setError('文件不能超过 1 MB'); return Upload.LIST_IGNORE }
            form.setFieldValue('data', await file.text()); return false
          }}><Button>读取文件</Button></Upload>
          <Form.Item name="data" label="提示词内容" rules={[{ required: true, message: '请填写或读取文件内容' }]}><Input.TextArea rows={8} /></Form.Item>
        </>}
      </Form>
    </Modal>
  </PageContainer>
}
