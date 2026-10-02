import { Button, Form, Input, Modal, Select, Space } from 'antd'
import { useRef, useState } from 'react'
import { apiClient } from '../../api/client'
import { applyFormErrors } from '../../api/form-errors'
import { send, statuses } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

type Values = { name: string; adapter: string; business_endpoint: string; credential_ref?: string;
  secret?: string; allowed_operations: string[]; operation_paths: Record<string, string>;
  field_mapping: string; status: string }

export function IntegrationEditor({ row, onClose, onSaved }: {
  row?: Schema<'IntegrationView'>; onClose: () => void; onSaved: () => void
}) {
  const options = useQuery<Schema<'IntegrationOptions'>>('/admin/v1/integrations/options')
  const [form] = Form.useForm<Values>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(row?.revision)
  const saving = useRef(false)
  const chosen = Form.useWatch('adapter', form) as string | undefined
  const operations = (Form.useWatch('allowed_operations', form) as string[] | undefined) ?? []
  const adapter = options.data?.adapters.find(a => `${a.code}@${a.version}` === chosen)
  async function submit(values: Values) {
    if (saving.current) return
    saving.current = true; setBusy(true); setError(undefined)
    try {
      const selected = options.data?.adapters.find(a => `${a.code}@${a.version}` === values.adapter)
      if (!selected) throw new Error('请选择适配器版本')
      const fieldMapping: unknown = JSON.parse(values.field_mapping || '{}')
      let credentialRef = values.credential_ref
      if (values.secret) {
        const issued = await send<{ credential_ref: string }>('/admin/v1/integration-credentials', 'POST', { secret: values.secret })
        credentialRef = issued.credential_ref
        form.setFieldsValue({ credential_ref: credentialRef, secret: undefined })
      }
      if (!credentialRef) throw new Error('请填写业务服务凭据或已有凭据引用')
      await send(row ? `/admin/v1/integrations/${row.integration_id}` : '/admin/v1/integrations', row ? 'PATCH' : 'POST', {
        name: values.name, adapter_code: selected.code, adapter_version: selected.version,
        business_endpoint: values.business_endpoint, credential_ref: credentialRef,
        allowed_operations: values.allowed_operations,
        operation_paths: Object.fromEntries(values.allowed_operations.map(op => [op, values.operation_paths[op]])),
        field_mapping: fieldMapping, ...(row ? { revision, status: values.status } : {}),
      })
      onSaved()
    } catch (failure) { setError(failure); applyFormErrors(form, failure) }
    finally { saving.current = false; setBusy(false) }
  }
  return <Modal open title={row ? '编辑旧 HTTP 连接' : '新建旧 HTTP 连接'} onCancel={onClose} closable={!busy}
    maskClosable={!busy} width={620} footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button>
      <Button type="primary" loading={busy} onClick={() => form.submit()}>保存</Button></Space>}>
    <ErrorNotice error={error} />
    {options.error ? <ErrorState error={options.error} onRetry={options.reload} /> : !options.data ? <LoadingState /> :
      <Form form={form} layout="vertical" disabled={busy} onFinish={submit} initialValues={row ? {
        ...row, adapter: `${row.adapter_code}@${row.adapter_version}`, field_mapping: JSON.stringify(row.field_mapping, null, 2),
      } : { allowed_operations: [], field_mapping: '{}', status: 'ACTIVE' }}>
        <Form.Item name="name" label="接入名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="adapter" label="适配器版本" rules={[{ required: true }]}>
          <Select options={options.data.adapters.map(a => ({ value: `${a.code}@${a.version}`, label: `${a.name} · ${a.version}` }))}
            onChange={() => form.setFieldsValue({ allowed_operations: [], operation_paths: {} })} />
        </Form.Item>
        <Form.Item name="business_endpoint" label="业务服务地址" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="secret" label="业务服务凭据"><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item name="credential_ref" label="已有凭据引用"><Input /></Form.Item>
        <Form.Item name="allowed_operations" label="接入能力" rules={[{ required: true }]}>
          <Select mode="multiple" options={adapter?.capabilities.map(c => ({ value: c.operation, label: c.name })) ?? []} />
        </Form.Item>
        {operations.map(op => <Form.Item key={op} name={['operation_paths', op]}
          label={`${adapter?.capabilities.find(c => c.operation === op)?.name ?? '能力'}接口路径`} rules={[{ required: true }]}><Input /></Form.Item>)}
        <Form.Item name="field_mapping" label="源字段映射"><Input.TextArea rows={3} /></Form.Item>
        {row && <Form.Item name="status" label="状态"><Select options={statuses} /></Form.Item>}
      </Form>}
    {row && Boolean(error) && <Button disabled={busy} onClick={async () => {
      setBusy(true)
      try {
        const current = await apiClient.request<Schema<'IntegrationView'>>(`/admin/v1/integrations/${row.integration_id}`)
        setRevision(current.revision); setError(undefined)
      } catch (failure) { setError(failure) }
      finally { setBusy(false) }
    }}>读取最新版本，保留填写内容</Button>}
  </Modal>
}
