import { Button, Form, Modal, Space } from 'antd'
import { useRef, useState } from 'react'
import { applyFormErrors } from '../../api/form-errors'
import { isAbort } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { PasswordFields } from './PasswordFields'

export function ChangePasswordDialog({ onSubmit, onClose }: {
  onSubmit: (values: Schema<'PasswordChange'>) => Promise<void>
  onClose: () => void
}) {
  const [form] = Form.useForm<Schema<'PasswordChange'>>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  async function submit(values: Schema<'PasswordChange'>) {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError(undefined)
    try { await onSubmit(values) }
    catch (failure) {
      if (!isAbort(failure)) { setError(failure); applyFormErrors(form, failure) }
    } finally { submitting.current = false; setBusy(false) }
  }
  return <Modal open title="修改密码" onCancel={onClose} destroyOnHidden
    closable={!busy} maskClosable={!busy} keyboard={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button>
      <Button type="primary" loading={busy} disabled={busy} onClick={() => form.submit()}>修改密码并重新登录</Button></Space>}>
    <ErrorNotice error={error} />
    <Form form={form} layout="vertical" onFinish={submit} disabled={busy} onValuesChange={() => setError(undefined)}>
      <PasswordFields requireCurrentPassword />
    </Form>
  </Modal>
}
