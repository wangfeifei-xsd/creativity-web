import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

type Version = Schema<'ToolVersionView'>
type Values = { label: string; input: string; output: string; adapter: string; required: boolean;
  types: string[]; scopes: string[]; timeout: number; maxSize: number; attempts: number;
  delay: number; ttl: number; freshness: number; volatile: boolean }
const stringify = (value: unknown) => JSON.stringify(value, null, 2)
const initialInput = { type: 'object', properties: { values: { type: 'array', title: '数值列表',
  items: { type: 'string', pattern: '^-?[0-9]+(\\.[0-9]+)?$' }, maxItems: 1000 } }, required: ['values'], additionalProperties: false }
const initialOutput = { type: 'object', properties: { sum: { type: 'string', title: '合计' } }, required: ['sum'], additionalProperties: false }

export function ToolVersionEditor({ tool, version, onClose, onSaved }: {
  tool: Schema<'ToolView'>; version?: Version; onClose: () => void; onSaved: () => void
}) {
  const { session } = useSession()
  const bindings = useQuery<Schema<'BindingOption'>[]>(`/admin/v1/tool-bindings?tool_id=${tool.tool_id}`)
  const [form] = Form.useForm<Values>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState('contract')
  const definition = version?.definition
  const workspace = session.workspace
  const available = bindings.data?.filter(b => b.source_type === tool.source_type) ?? []
  async function save(values: Values) {
    if (!workspace || busy) return
    setBusy(true); setError(undefined)
    try {
      const input: unknown = JSON.parse(values.input)
      const output: unknown = JSON.parse(values.output)
      if (!input || typeof input !== 'object' || !('properties' in input) || !input.properties || typeof input.properties !== 'object') {
        throw new Error('输入结构须包含参数字段定义')
      }
      const selected = available.find(b => b.binding.adapter_key === values.adapter)
      if (!selected) throw new Error('请选择有效的连接绑定')
      const body = { input_schema: input, output_schema: output, model_fields_allowed: Object.keys(input.properties),
        binding: selected.binding, effect_type: selected.effect_type, required_scopes: values.scopes,
        allowed_data_domains: [workspace.data_scope_id], environments: [workspace.environment],
        subject_requirements: { required: values.required, allowed_types: values.types ?? [] },
        timeout_seconds: values.timeout, max_result_size: values.maxSize,
        retry_policy: { max_attempts: values.attempts, delay_ms: values.delay },
        cache_policy: { ttl_seconds: values.ttl, freshness_seconds: values.freshness, volatile: values.volatile },
        idempotency_policy: 'none' }
      await send(version ? `/admin/v1/tool-versions/${version.version.version_id}` : `/admin/v1/tools/${tool.tool_id}/versions`,
        version ? 'PATCH' : 'POST', version ? { revision: version.revision, definition: body } : { version_label: values.label, definition: body })
      onSaved()
    } catch (failure) {
      setError(failure instanceof SyntaxError ? new Error('输入或输出结构不是有效的 JSON') : failure)
      if (failure instanceof ApiError) {
        const names: Record<string, keyof Values> = { input_schema: 'input', output_schema: 'output', binding: 'adapter', version_label: 'label',
          required_scopes: 'scopes', timeout_seconds: 'timeout', max_result_size: 'maxSize' }
        form.setFields(failure.fields.flatMap(field => {
          const name = names[String(field.path[field.path[0] === 'definition' ? 1 : 0])]
          return name ? [{ name, errors: [field.message] }] : []
        }))
      }
    }
    finally { setBusy(false) }
  }
  return <Modal open width={840} title={version ? '编辑工具草稿' : '新增工具版本'} onCancel={onClose}
    style={{ top: 24 }} styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
    closable={!busy} maskClosable={!busy} footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button>
      <Button type="primary" loading={busy} onClick={() => form.submit()}>保存</Button></Space>}>
    <ErrorNotice error={error} />
    {bindings.error ? <ErrorState error={bindings.error} onRetry={bindings.reload} /> : !bindings.data ? <LoadingState /> :
      <Form form={form} layout="vertical" disabled={busy} onFinish={save} onFinishFailed={() => setActiveTab('contract')}
        initialValues={{ label: '', input: stringify(definition?.input_schema ?? initialInput), output: stringify(definition?.output_schema ?? initialOutput),
          adapter: definition?.binding.adapter_key ?? available[0]?.binding.adapter_key, required: definition?.subject_requirements.required ?? tool.source_type !== 'builtin',
          types: definition?.subject_requirements.allowed_types ?? [], scopes: definition?.required_scopes ?? ['run:create'],
          timeout: definition?.timeout_seconds ?? 10, maxSize: definition?.max_result_size ?? 262144,
          attempts: definition?.retry_policy.max_attempts ?? 1, delay: definition?.retry_policy.delay_ms ?? 100,
          ttl: definition?.cache_policy.ttl_seconds ?? 0, freshness: definition?.cache_policy.freshness_seconds ?? 60,
          volatile: definition?.cache_policy.volatile ?? false }}>
        {!version && <Form.Item name="label" label="版本名称" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item>}
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'contract', label: '契约', forceRender: true, children: <>
            <Form.Item name="input" label="输入结构" rules={[{ required: true }]}><Input.TextArea rows={12} spellCheck={false} /></Form.Item>
            <Form.Item name="output" label="输出结构" rules={[{ required: true }]}><Input.TextArea rows={8} spellCheck={false} /></Form.Item>
          </> },
          { key: 'binding', label: '连接绑定', forceRender: true, children: <>
            <Form.Item name="adapter" label="来源连接" rules={[{ required: true }]}><Select options={available.map(b => ({ value: b.binding.adapter_key,
              label: `${b.name} · ${b.effect_label}${b.unavailable_reason ? ` · ${b.unavailable_reason}` : ''}` }))} /></Form.Item>
          </> },
          { key: 'permission', label: '权限', forceRender: true, children: <>
            <Typography.Paragraph>{workspace?.environment_name ?? '环境未确认'} · {workspace?.data_scope_name ?? '业务数据域未确认'}</Typography.Paragraph>
            <Form.Item name="scopes" label="必要授权" rules={[{ required: true }]}><Select mode="multiple" options={session.actions.map(a => ({ value: a.action_key, label: a.label }))} /></Form.Item>
            <Form.Item name="required" label="要求业务主体" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="types" label="允许的主体类型"><Select mode="tags" /></Form.Item>
          </> },
          { key: 'policy', label: '执行策略', forceRender: true, children: <>
            <Form.Item name="timeout" label="超时（秒）" rules={[{ required: true }]}><InputNumber min={1} max={120} /></Form.Item>
            <Form.Item name="maxSize" label="结果体积上限（字节）" rules={[{ required: true }]}><InputNumber min={256} max={2097152} /></Form.Item>
            <Form.Item name="attempts" label="最多尝试次数" rules={[{ required: true }]}><InputNumber min={1} max={3} /></Form.Item>
            <Form.Item name="delay" label="重试间隔（毫秒）" rules={[{ required: true }]}><InputNumber min={0} max={2000} /></Form.Item>
            <Form.Item name="ttl" label="缓存有效期（秒，0 为关闭）" rules={[{ required: true }]}><InputNumber min={0} max={3600} /></Form.Item>
            <Form.Item name="freshness" label="数据最大时效（秒）" rules={[{ required: true }]}><InputNumber min={1} max={86400} /></Form.Item>
            <Form.Item name="volatile" label="涉及价格或库存" valuePropName="checked"><Switch /></Form.Item>
          </> },
        ]} />
      </Form>}
  </Modal>
}
