import { RunViewer } from '../../components/run-viewer/RunViewer'
import { Alert, Button, Descriptions, Form, Input, InputNumber, Segmented, Space, Typography } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { applyFormErrors, clearFormErrors } from '../../api/form-errors'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { EnumSelect } from '../../components/schema-fields/EnumSelect'
import { parseSchemaInput, schemaFormValues, schemaInputHint, schemaRequiredValue, SchemaInputError, type InputProperty } from '../../components/schema-fields/input'

export function ToolTestPanel({ version }: { version: Schema<'ToolVersionView'> }) {
  const { session } = useSession()
  const query = useQuery<Schema<'ToolTestDescription'>>(`/admin/v1/tool-versions/${version.version.version_id}/test-description`)
  const [form] = Form.useForm<Record<string, unknown>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [result, setResult] = useState<Schema<'ToolTestResult'>>()
  const [jsonMode, setJsonMode] = useState(false)
  const schema = version.definition.input_schema as { properties?: Record<string, InputProperty>; required?: string[] }
  function changeMode(next: boolean) {
    if (next === jsonMode) return
    clearFormErrors(form); setError(undefined)
    try {
      if (next) form.setFieldValue('argumentsJson', JSON.stringify(parseSchemaInput(schema.properties ?? {}, form.getFieldsValue(true)), null, 2))
      else form.setFieldsValue(schemaFormValues(schema.properties ?? {}, JSON.parse(String(form.getFieldValue('argumentsJson') ?? '{}'))))
      setJsonMode(next)
    } catch (failure) {
      setError(failure instanceof SyntaxError ? new Error('请按字段结构填写有效的 JSON') : failure)
      if (failure instanceof SchemaInputError) form.setFields([{ name: failure.field, errors: [failure.message] }])
    }
  }
  async function submit(values: Record<string, unknown>) {
    if (busy) return
    clearFormErrors(form)
    setBusy(true); setError(undefined); setResult(undefined)
    try {
      const args = jsonMode ? JSON.parse(String(values.argumentsJson ?? '{}')) as unknown : parseSchemaInput(schema.properties ?? {}, values)
      setResult(await send<Schema<'ToolTestResult'>>(`/admin/v1/tool-versions/${version.version.version_id}/tests`, 'POST',
        { revision: query.data?.revision, arguments: args }))
    } catch (failure) {
      setError(failure instanceof SyntaxError ? new Error('请按字段结构填写有效的 JSON') : failure)
      if (jsonMode && failure instanceof ApiError && failure.fields.length) {
        form.setFields([{ name: 'argumentsJson', errors: [...new Set(failure.fields.map(field => {
          const label = schema.properties?.[String(field.path[0])]?.title ?? '工具参数'
          return `${label}：${field.message}`
        }))] }])
      } else applyFormErrors(form, failure, path => path.slice(0, 1))
      if (failure instanceof SchemaInputError) form.setFields([{ name: failure.field, errors: [failure.message] }])
    }
    finally { setBusy(false) }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Descriptions size="small" title="受信身份" items={[
      { key: 'user', label: '操作成员', children: session.user.display_name },
      { key: 'channel', label: '渠道', children: session.workspace?.channel_name ?? '名称不可用' },
      { key: 'env', label: '环境', children: session.workspace?.environment_name ?? '名称不可用' },
    ]} />
    {query.data.unavailable_reason && <Alert type="warning" title={query.data.unavailable_reason} />}
    <ErrorNotice error={error} />
    <Segmented aria-label="参数填写方式" disabled={busy} value={jsonMode ? 'json' : 'form'} onChange={value => changeMode(value === 'json')}
      options={[{ value: 'form', label: '字段表单' }, { value: 'json', label: 'JSON 参数' }]} />
    <Form form={form} layout="vertical" onFinish={submit} disabled={busy}>
      {jsonMode ? <Form.Item name="argumentsJson" label="工具参数（JSON）" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item> : Object.entries(schema.properties ?? {}).map(([name, field], index) => <Form.Item key={name} name={name}
        label={field.title || `参数 ${index + 1}`} extra={schemaInputHint(field)}
        rules={schema.required?.includes(name) ? [{ required: true, message: '请填写此项', transform: value => schemaRequiredValue(field, value) }] : undefined}>
        {field.enum || field.type === 'boolean' ? <EnumSelect values={field.enum ?? [true, false]} />
          : field.type === 'integer' || field.type === 'number' ? <InputNumber precision={field.type === 'integer' ? 0 : undefined} />
            : field.type === 'object' || field.type === 'array'
              ? <Input.TextArea rows={4} /> : <Input />}
      </Form.Item>)}
      <Button type="primary" htmlType="submit" loading={busy} disabled={!query.data.executable}>运行测试</Button>
    </Form>
    {result && <><RunViewer key={result.run_id} runId={result.run_id} />
      {result.result && <Descriptions title="测试结果" items={[{ key: 'state', label: '状态', children: result.state.label },
        { key: 'run', label: '运行标识', children: <Typography.Text copyable>{result.run_id}</Typography.Text> },
        { key: 'time', label: '观测时间', children: formatTimestamp(result.result?.observed_at) },
        { key: 'coverage', label: '结果完整性', children: ({ complete: '完整', empty: '无记录', missing: '信息缺失', partial: '部分结果' } as Record<string, string>)[String(result.result?.coverage.result_status)] ?? '未声明' },
        { key: 'verification', label: '验证来源', children: result.result?.coverage.verification === 'controlled_fixture' ? '受控测试服务' : '未标注' },
      ]} />}
      {result.result && <><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.result.data, null, 2)}</pre>
        {result.result.evidence_refs.map(ref => <Typography.Paragraph key={ref.evidence_id}>{ref.title ?? '来源名称不可用'} · {formatTimestamp(ref.observed_at)}</Typography.Paragraph>)}
      </>}
    </>}
  </Space>
}
