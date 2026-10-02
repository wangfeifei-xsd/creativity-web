import { RunViewer } from '../../components/run-viewer/RunViewer'
import { Alert, Button, Descriptions, Form, Input, InputNumber, Select, Space, Switch, Typography } from 'antd'
import { useState } from 'react'
import { applyFormErrors } from '../../api/form-errors'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

type Property = { type?: string; title?: string; enum?: unknown[] }
export function ToolTestPanel({ version }: { version: Schema<'ToolVersionView'> }) {
  const { session } = useSession()
  const query = useQuery<Schema<'ToolTestDescription'>>(`/admin/v1/tool-versions/${version.version.version_id}/test-description`)
  const [form] = Form.useForm<Record<string, unknown>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [result, setResult] = useState<Schema<'ToolTestResult'>>()
  const schema = version.definition.input_schema as { properties?: Record<string, Property>; required?: string[] }
  async function submit(values: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(undefined); setResult(undefined)
    try {
      const args = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]) => {
        const kind = schema.properties?.[key]?.type
        return [key, (kind === 'array' || kind === 'object') && typeof value === 'string' ? JSON.parse(value) as unknown : value]
      }))
      setResult(await send<Schema<'ToolTestResult'>>(`/admin/v1/tool-versions/${version.version.version_id}/tests`, 'POST',
        { revision: query.data?.revision, arguments: args }))
    } catch (failure) { setError(failure instanceof SyntaxError ? new Error('请按字段结构填写有效的 JSON') : failure); applyFormErrors(form, failure) }
    finally { setBusy(false) }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Descriptions size="small" title="受信身份" items={[
      { key: 'user', label: '操作成员', children: session.user.display_name },
      { key: 'channel', label: '渠道', children: session.workspace?.channel_name ?? '名称不可用' },
      { key: 'env', label: '环境', children: session.workspace?.environment_name ?? '名称不可用' },
      { key: 'domain', label: '业务数据域', children: session.workspace?.data_scope_name ?? '名称不可用' },
    ]} />
    {query.data.unavailable_reason && <Alert type="warning" title={query.data.unavailable_reason} />}
    <ErrorNotice error={error} />
    <Form form={form} layout="vertical" onFinish={submit} disabled={busy}>
      {Object.entries(schema.properties ?? {}).map(([name, field], index) => <Form.Item key={name} name={name}
        label={field.title || `参数 ${index + 1}`} valuePropName={field.type === 'boolean' ? 'checked' : 'value'}
        rules={schema.required?.includes(name) ? [{ required: true, message: '请填写此项' }] : undefined}>
        {field.enum ? <Select options={field.enum.map(value => ({ value: value as string, label: String(value) }))} />
          : field.type === 'integer' || field.type === 'number' ? <InputNumber precision={field.type === 'integer' ? 0 : undefined} />
            : field.type === 'boolean' ? <Switch /> : field.type === 'object' || field.type === 'array'
              ? <Input.TextArea rows={4} /> : <Input />}
      </Form.Item>)}
      <Button type="primary" htmlType="submit" loading={busy} disabled={!query.data.executable}>运行测试</Button>
    </Form>
    {result && <><RunViewer key={result.run_id} runId={result.run_id} />
      <Descriptions title="测试结果" items={[{ key: 'state', label: '状态', children: result.state.label },
        { key: 'run', label: '运行标识', children: <Typography.Text copyable>{result.run_id}</Typography.Text> },
        { key: 'time', label: '观测时间', children: formatTimestamp(result.result?.observed_at) }]} />
      {result.result && <><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.result.data, null, 2)}</pre>
        {result.result.evidence_refs.map(ref => <Typography.Paragraph key={ref.evidence_id}>{ref.title ?? '来源名称不可用'} · {formatTimestamp(ref.observed_at)}</Typography.Paragraph>)}
      </>}
    </>}
  </Space>
}
