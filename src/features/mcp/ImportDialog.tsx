import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { useQuery } from '../../api/useQuery'

export function ImportDialog({ id, snapshot, tool, targets, onClose, onSaved }: {
  id: string; snapshot: Schema<'McpDiscovery'>; tool: Schema<'RemoteTool'>; targets: Schema<'McpImport'>[]; onClose: () => void; onSaved: () => void
}) {
  const { session } = useSession()
  const [form] = Form.useForm()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const targetId = Form.useWatch<string | undefined>('target_tool_id', form)
  const target = useQuery<Schema<'ToolDetail'>>(targetId ? `/admin/v1/tools/${targetId}` : null)
  async function submit(values: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(undefined)
    try {
      const current = targetId ? target.data?.versions[0]?.definition : undefined
      if (targetId && (!current || !target.data)) throw new Error('请等待目标工具配置加载完成')
      const output = current?.output_schema ?? JSON.parse(String(values.output_schema)) as unknown
      if (!output || Array.isArray(output) || typeof output !== 'object') throw new Error('输出结构须为 JSON 对象')
      await send(`/admin/v1/mcp-connections/${id}/imports`, 'POST', {
        ...values, version_label: '当前配置', ...(current && target.data ? {
          name: target.data.tool.name, description: target.data.tool.description, owner: target.data.tool.owner,
          version_label: '当前配置', effect_type: current.effect_type, required_scopes: current.required_scopes,
          timeout_seconds: current.timeout_seconds, max_result_size: current.max_result_size,
          subject_required: current.subject_requirements.required,
        } : {}), discovery_id: snapshot.discovery_id, remote_tool_name: tool.name, output_schema: output,
      })
      onSaved()
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  return <Modal open title={targetId ? '重新绑定工具' : '导入本地工具'} width={660} onCancel={onClose} closable={!busy} maskClosable={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button><Button type="primary" loading={busy} disabled={!!targetId && !target.data} onClick={() => form.submit()}>{targetId ? '重新绑定' : '导入工具'}</Button></Space>}>
    <ErrorNotice error={error ?? target.error} />
    <Form form={form} layout="vertical" disabled={busy} onFinish={submit} initialValues={{ name: tool.title ?? '', description: tool.description,
      timeout_seconds: 10, max_result_size: 262144, subject_required: true,
      output_schema: tool.output_schema ? JSON.stringify(tool.output_schema, null, 2) : '',
    }}>
      <Form.Item name="target_tool_id" label="目标工具"><Select allowClear placeholder="创建新工具"
        options={Array.from(new Map(targets.filter(item => item.remote_tool_name === tool.name).map(item => [item.local_tool_id, { value: item.local_tool_id, label: item.name }])).values())} /></Form.Item>
      {targetId ? <Typography.Paragraph>保留原工具契约、权限和执行策略，仅更新同契约的来源绑定；保存后须重新发布。</Typography.Paragraph> : <>
      <Form.Item name="name" label="本地显示名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="description" label="用途" rules={[{ required: true }]}><Input.TextArea /></Form.Item>
      <Form.Item name="owner" label="负责人" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="effect_type" label="实际影响" rules={[{ required: true }]}><Select options={[
        { value: 'READ_ONLY', label: '只读', disabled: tool.annotations?.readOnlyHint !== true },
        { value: 'IDEMPOTENT_WRITE', label: '幂等写入' }, { value: 'EXTERNAL_WRITE', label: '外部写入' },
      ]} /></Form.Item>
      <Form.Item name="required_scopes" label="必要业务权限" rules={[{ required: true }]}><Select mode="multiple" optionFilterProp="label"
        options={session.actions.map(action => ({ value: action.action_key, label: action.label }))} /></Form.Item>
      <Form.Item name="timeout_seconds" label="超时（秒）" rules={[{ required: true }]}><InputNumber min={1} max={120} /></Form.Item>
      <Form.Item name="max_result_size" label="结果上限（字节）" rules={[{ required: true }]}><InputNumber min={256} max={2097152} /></Form.Item>
      <Form.Item name="subject_required" label="需要受信业务主体" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="output_schema" label="输出校验结构" rules={[{ required: true }]}><Input.TextArea rows={7} /></Form.Item>
      </>}
    </Form>
  </Modal>
}
