import { Form, Input, InputNumber, Modal, Select, Switch, Button, Space } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

export function MemoryPolicy({ onClose }: { onClose: () => void }) {
  const query = useQuery<Schema<'PolicyView'>>('/admin/v1/memory-policy')
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  return <Modal open title="渠道记忆策略" onCancel={onClose} closable={!busy} maskClosable={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button><Button type="primary" aria-label={busy ? '保存中' : '保存'} disabled={!query.data || busy} loading={busy} onClick={() => form.submit()}>保存</Button></Space>}>
    <ErrorNotice error={error} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Form form={form} layout="vertical" initialValues={{ ...query.data, attributes: (query.data.attributes ?? []).map(a => ({ ...a, schema: JSON.stringify(a.value_schema, null, 2) })) }} onFinish={async (values) => {
      setBusy(true); setError(undefined)
      try { await send('/admin/v1/memory-policy', 'PUT', { ...values, attributes: (values.attributes ?? []).map((a: { key: string; label: string; memory_type: string; schema: string }) => ({ key: a.key, label: a.label, memory_type: a.memory_type, value_schema: JSON.parse(a.schema) })), revision: query.data!.revision }); onClose() }
      catch (failure) { setError(failure) } finally { setBusy(false) }
    }} disabled={busy}>
      <Form.Item name="read_enabled" label="允许读取" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="suggest_enabled" label="允许后台整理" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={['consolidation', 'enabled']} label="定时归档与画像" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name={['consolidation', 'idle_seconds']} label="会话空闲时间（秒）" rules={[{ required: true }]}><InputNumber min={60} max={604800} /></Form.Item>
      <Form.Item name={['consolidation', 'batch_messages']} label="每批消息数（条）" rules={[{ required: true }]}><InputNumber min={2} max={100} /></Form.Item>
      <Form.List name="attributes">{(fields, { add, remove }) => <>
        {fields.map(field => <div key={field.key}>
          <Form.Item name={[field.name, 'label']} label="画像属性名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
          <Form.Item name={[field.name, 'key']} label="属性标识" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name={[field.name, 'memory_type']} label="属性类型"><Select options={[{ value: 'PREFERENCE', label: '偏好' }, { value: 'FACT', label: '权威事实' }]} /></Form.Item>
          <Form.Item name={[field.name, 'schema']} label="值格式（JSON Schema）" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Button danger onClick={() => remove(field.name)}>移除属性</Button>
        </div>)}
        <Button onClick={() => add({ memory_type: 'PREFERENCE', schema: '{"type":"string","minLength":1,"maxLength":100}' })}>添加画像属性</Button>
      </>}</Form.List>
      <Form.Item name="allowed_types" label="允许类型"><Select mode="multiple" options={[{ value: 'PREFERENCE', label: '明确偏好' }, { value: 'FACT', label: '稳定事实' }]} /></Form.Item>
      <Form.Item name="write_mode" label="保存方式"><Select options={[{ value: 'DISABLED', label: '禁止保存' }, { value: 'CANDIDATE', label: '保存为待确认候选' }, { value: 'EXPLICIT', label: '明确保存请求可生效' }]} /></Form.Item>
      <Form.Item name="ttl_seconds" label="最长有效期（秒）" rules={[{ required: true }]}><InputNumber min={60} max={31536000} /></Form.Item>
      <Form.Item name="max_items" label="主体记忆上限（条）" rules={[{ required: true }]}><InputNumber min={1} max={1000} /></Form.Item>
      <Form.Item name="retrieval_limit" label="每次检索上限（条）" rules={[{ required: true }]}><InputNumber min={1} max={100} /></Form.Item>
      <Form.Item name="failure_mode" label="检索故障处理"><Select options={[{ value: 'OMIT', label: '继续执行并记录提示' }, { value: 'FAIL', label: '停止执行' }]} /></Form.Item>
    </Form>}
  </Modal>
}
