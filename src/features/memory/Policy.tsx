import { Form, InputNumber, Modal, Select, Switch, Button, Space } from 'antd'
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
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Form form={form} layout="vertical" initialValues={query.data} onFinish={async (values) => {
      setBusy(true); setError(undefined)
      try { await send('/admin/v1/memory-policy', 'PUT', { ...values, revision: query.data!.revision }); onClose() }
      catch (failure) { setError(failure) } finally { setBusy(false) }
    }} disabled={busy}>
      <Form.Item name="read_enabled" label="允许读取" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="suggest_enabled" label="允许建议写入" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="allowed_types" label="允许类型"><Select mode="multiple" options={[{ value: 'PREFERENCE', label: '明确偏好' }, { value: 'FACT', label: '稳定事实' }]} /></Form.Item>
      <Form.Item name="write_mode" label="保存方式"><Select options={[{ value: 'DISABLED', label: '禁止保存' }, { value: 'CANDIDATE', label: '保存为待确认候选' }, { value: 'EXPLICIT', label: '明确保存请求可生效' }]} /></Form.Item>
      <Form.Item name="ttl_seconds" label="最长有效期（秒）" rules={[{ required: true }]}><InputNumber min={60} max={31536000} /></Form.Item>
      <Form.Item name="max_items" label="主体记忆上限（条）" rules={[{ required: true }]}><InputNumber min={1} max={1000} /></Form.Item>
      <Form.Item name="retrieval_limit" label="每次检索上限（条）" rules={[{ required: true }]}><InputNumber min={1} max={100} /></Form.Item>
      <Form.Item name="failure_mode" label="检索故障处理"><Select options={[{ value: 'OMIT', label: '继续执行并记录提示' }, { value: 'FAIL', label: '停止执行' }]} /></Form.Item>
    </Form>}
  </Modal>
}
