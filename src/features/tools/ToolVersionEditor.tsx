import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { toolPermissionLabel } from './permissionLabel'

type Version = Schema<'ToolVersionView'>
type Values = { label: string; input: string; output: string; adapter: string; required: boolean;
  types: string[]; scopes: string[]; timeout: number; maxSize: number; attempts: number;
  delay: number; ttl: number; freshness: number; volatile: boolean; statusVersion?: string; submissions: number; checks: number; authorizationMode: 'per_call' | 'preauthorized'; allowedAgents: string[]; allowedPrincipals: string[]; constraints: string; checkDelay: number; profile?: string; skillVersion?: string; scriptPath?: string; analysis: boolean; rowsPath: string; maxRows: number }
type ExecutionOptions = { profiles: { profile_id: string; name: string; digest: string; mode: string }[]; scripts: { version_id: string; name: string; version_label: string; paths: string[] }[]; queries: { version_id: string; name: string; version_label: string }[] }
const stringify = (value: unknown) => JSON.stringify(value, null, 2)
const initialInput = { type: 'object', properties: { values: { type: 'array', title: '数值列表',
  items: { type: 'string', pattern: '^-?[0-9]+(\\.[0-9]+)?$' }, maxItems: 1000 } }, required: ['values'], additionalProperties: false }
const initialOutput = { type: 'object', properties: { sum: { type: 'string', title: '合计' } }, required: ['sum'], additionalProperties: false }
const editorFields: Record<string, string[]> = {
  contract: ['input', 'output'],
  binding: ['adapter', 'profile', 'skillVersion', 'scriptPath'],
  permission: ['scopes', 'required', 'types'],
  policy: ['analysis', 'rowsPath', 'maxRows', 'statusVersion', 'authorizationMode', 'allowedAgents', 'allowedPrincipals', 'constraints', 'checkDelay', 'submissions', 'checks', 'timeout', 'maxSize', 'attempts', 'delay', 'ttl', 'freshness', 'volatile'],
}
const tabForField = (name: unknown) => Object.entries(editorFields).find(([, fields]) => fields.includes(String(name)))?.[0] ?? 'contract'

export function ToolVersionEditor({ tool, version, onClose, onSaved }: {
  tool: Schema<'ToolView'>; version?: Version; onClose: () => void; onSaved: () => void
}) {
  const { session } = useSession()
  const bindings = useQuery<Schema<'BindingOption'>[]>(`/admin/v1/tool-bindings?tool_id=${tool.tool_id}`)
  const execution = useQuery<ExecutionOptions>(`/admin/v1/tool-execution-options?tool_id=${tool.tool_id}`)
  const [form] = Form.useForm<Values>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState('contract')
  const definition = version?.definition
  const skillVersion = Form.useWatch('skillVersion', form)
  const adapter = Form.useWatch('adapter', form)
  const analysis = Form.useWatch('analysis', form)
  const authorizationMode = Form.useWatch('authorizationMode', form)
  const writing = (bindings.data?.find(b => b.binding.adapter_key === adapter)?.effect_type ?? definition?.effect_type ?? 'READ_ONLY') !== 'READ_ONLY'
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
      if (!selected && tool.source_type !== 'sandbox') throw new Error('请选择有效的连接绑定')
      const profile = execution.data?.profiles.find(p => p.profile_id === values.profile)
      if (tool.source_type === 'sandbox' && !profile) throw new Error('请选择可用的隔离环境')
      const body = { input_schema: input, output_schema: output, model_fields_allowed: Object.keys(input.properties),
        binding: tool.source_type === 'sandbox' ? { adapter_key: 'sandbox_python', implementation_version: '1', connection_id: null, script: { profile_id: profile?.profile_id, profile_digest: profile?.digest, skill_version_id: values.skillVersion, path: values.scriptPath } } : selected?.binding, effect_type: selected?.effect_type ?? 'READ_ONLY', required_scopes: values.scopes,
        environments: [workspace.environment],
        subject_requirements: { required: values.required, allowed_types: values.types ?? [] },
        timeout_seconds: values.timeout, max_result_size: values.maxSize,
        retry_policy: { max_attempts: values.attempts, delay_ms: values.delay },
        cache_policy: { ttl_seconds: values.ttl, freshness_seconds: values.freshness, volatile: values.volatile },
        analysis_policy: values.analysis && tool.source_type === 'mcp' && !writing ? { rows_path: values.rowsPath.split('.').filter(Boolean), max_rows: values.maxRows } : null,
        idempotency_policy: writing ? 'source_key' : 'none', write_policy: writing && values.statusVersion ? { status_tool_version_id: values.statusVersion, max_submissions: values.submissions, max_checks: values.checks, authorization_mode: values.authorizationMode, allowed_agent_codes: values.allowedAgents ?? [], allowed_principal_ids: values.allowedPrincipals ?? [], argument_constraints: values.authorizationMode === 'preauthorized' ? JSON.parse(values.constraints) : null, check_delay_ms: values.checkDelay } : null }
      await send(`/admin/v1/tools/${tool.tool_id}/configuration`,
        version ? 'PATCH' : 'POST', version ? { revision: version.revision, definition: body } : { definition: body })
      onSaved()
    } catch (failure) {
      setError(failure instanceof SyntaxError ? new Error('输入或输出结构不是有效的 JSON') : failure)
      if (failure instanceof ApiError) {
        const names: Record<string, keyof Values> = { input_schema: 'input', output_schema: 'output', binding: 'adapter', version_label: 'label',
          required_scopes: 'scopes', timeout_seconds: 'timeout', max_result_size: 'maxSize' }
        const fields = failure.fields.flatMap(field => {
          const name = names[String(field.path[field.path[0] === 'definition' ? 1 : 0])]
          return name ? [{ name, errors: [field.message] }] : []
        })
        form.setFields(fields)
        if (fields[0]) setActiveTab(tabForField(fields[0].name))
      }
    }
    finally { setBusy(false) }
  }
  return <Modal open width={840} title="修改工具配置" onCancel={onClose}
    style={{ top: 24 }} styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
    closable={!busy} maskClosable={!busy} footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button>
      <Button type="primary" loading={busy} onClick={() => form.submit()}>保存</Button></Space>}>
    <ErrorNotice error={error ?? execution.error} />
    {bindings.error ? <ErrorState error={bindings.error} onRetry={bindings.reload} /> : !bindings.data ? <LoadingState /> :
      <Form form={form} layout="vertical" disabled={busy} onFinish={save} onFinishFailed={({ errorFields }) => {
        setError(undefined)
        setActiveTab(tabForField(errorFields[0]?.name[0]))
      }}
        initialValues={{ label: '', input: stringify(definition?.input_schema ?? initialInput), output: stringify(definition?.output_schema ?? initialOutput),
          adapter: definition?.binding.adapter_key ?? available[0]?.binding.adapter_key, required: definition?.subject_requirements.required ?? tool.source_type !== 'builtin',
          types: definition?.subject_requirements.allowed_types ?? [], scopes: definition?.required_scopes ?? ['run:create'],
          timeout: definition?.timeout_seconds ?? 10, maxSize: definition?.max_result_size ?? 262144,
          attempts: definition?.retry_policy.max_attempts ?? 1, delay: definition?.retry_policy.delay_ms ?? 100,
          ttl: definition?.cache_policy.ttl_seconds ?? 0, freshness: definition?.cache_policy.freshness_seconds ?? 60,
          analysis: !!definition?.analysis_policy, rowsPath: definition?.analysis_policy?.rows_path.join('.') ?? 'rows', maxRows: definition?.analysis_policy?.max_rows ?? 1000,
          volatile: definition?.cache_policy.volatile ?? false, statusVersion: definition?.write_policy?.status_tool_version_id,
          authorizationMode: definition?.write_policy?.authorization_mode ?? 'per_call', allowedAgents: definition?.write_policy?.allowed_agent_codes ?? [], allowedPrincipals: definition?.write_policy?.allowed_principal_ids ?? [], constraints: stringify(definition?.write_policy?.argument_constraints ?? definition?.input_schema ?? initialInput), checkDelay: definition?.write_policy?.check_delay_ms ?? 1000,
          submissions: definition?.write_policy?.max_submissions ?? 1, checks: definition?.write_policy?.max_checks ?? 3,
          profile: definition?.binding.script?.profile_id, skillVersion: definition?.binding.script?.skill_version_id, scriptPath: definition?.binding.script?.path }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'contract', label: '契约', forceRender: true, children: <>
            <Form.Item name="input" label="输入结构" rules={[{ required: true }]}><Input.TextArea rows={12} spellCheck={false} /></Form.Item>
            <Form.Item name="output" label="输出结构" rules={[{ required: true }]}><Input.TextArea rows={8} spellCheck={false} /></Form.Item>
          </> },
          { key: 'binding', label: '连接绑定', forceRender: true, children: <>
            {tool.source_type !== 'sandbox' && <Form.Item name="adapter" label="来源连接" rules={[{ required: true }]}><Select options={available.map(b => ({ value: b.binding.adapter_key,
              label: `${b.name} · ${b.effect_label}${b.unavailable_reason ? ` · ${b.unavailable_reason}` : ''}` }))} /></Form.Item>
            }
            {tool.source_type === 'sandbox' && <>
              <Form.Item name="profile" label="隔离环境" rules={[{ required: true }]}><Select options={execution.data?.profiles.filter(p => p.mode === 'python').map(p => ({ value: p.profile_id, label: p.name }))} /></Form.Item>
              <Form.Item name="skillVersion" label="技能" rules={[{ required: true }]}><Select options={execution.data?.scripts.map(s => ({ value: s.version_id, label: s.name }))} /></Form.Item>
              <Form.Item name="scriptPath" label="脚本文件" rules={[{ required: true }]}><Select options={execution.data?.scripts.find(s => s.version_id === skillVersion)?.paths.map(path => ({ value: path, label: path }))} /></Form.Item>
            </>}
          </> },
          { key: 'permission', label: '权限', forceRender: true, children: <>
            <Typography.Paragraph>{workspace?.environment_name ?? '环境未确认'}</Typography.Paragraph>
            <Form.Item name="scopes" label="必要授权" rules={[{ required: true }]}><Select mode="multiple" labelRender={({ value }) => toolPermissionLabel(String(value), session.actions)} options={session.actions.map(a => ({ value: a.action_key, label: a.label }))} /></Form.Item>
            <Form.Item name="required" label="要求业务主体" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="types" label="允许的主体类型"><Select mode="tags" /></Form.Item>
          </> },
          { key: 'policy', label: '执行策略', forceRender: true, children: <>
            {tool.source_type === 'mcp' && !writing && <><Form.Item name="analysis" label="只读分析源" valuePropName="checked"><Switch /></Form.Item>{analysis && <><Form.Item name="rowsPath" label="行列表字段路径"><Input /></Form.Item><Form.Item name="maxRows" label="最大返回行数"><InputNumber min={1} max={10000} /></Form.Item></>}</>}
            {writing && <><Form.Item name="statusVersion" label="来源状态核查工具" rules={[{ required: true }]}><Select options={execution.data?.queries.map(q => ({ value: q.version_id, label: q.name }))} /></Form.Item>
              <Form.Item name="authorizationMode" label="写入授权方式" rules={[{ required: true }]}><Select options={[{ value: 'per_call', label: '逐次确认' }, { value: 'preauthorized', label: '预授权自动执行', disabled: (bindings.data?.find(b => b.binding.adapter_key === adapter)?.effect_type ?? definition?.effect_type) !== 'IDEMPOTENT_WRITE' }]} /></Form.Item>
              {authorizationMode === 'preauthorized' && <>
                <Form.Item name="allowedAgents" label="允许的 Agent 编码" rules={[{ required: true }]}><Select mode="tags" /></Form.Item>
                <Form.Item name="allowedPrincipals" label="允许的执行身份标识" rules={[{ required: true }]}><Select mode="tags" /></Form.Item>
                <Form.Item name="constraints" label="自动执行参数边界（JSON Schema）" rules={[{ required: true }]}><Input.TextArea rows={7} spellCheck={false} /></Form.Item>
                <Form.Item name="checkDelay" label="自动核查间隔（毫秒）"><InputNumber min={0} max={5000} /></Form.Item>
              </>}
              <Form.Item name="submissions" label="提交上限（次）"><InputNumber min={1} max={3} /></Form.Item><Form.Item name="checks" label="来源核查上限（次）"><InputNumber min={1} max={10} /></Form.Item></>}
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
