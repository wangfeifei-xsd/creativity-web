import { Alert, Button, Form, Modal, Space } from 'antd'
import { useRef, useState, type ReactNode } from 'react'
import type { FormInstance } from 'antd'
import { applyFormErrors } from '../../api/form-errors'
import { isAbort } from '../../api/useQuery'
import { ErrorNotice } from '../../components/Management'

export function ModelDialog({ title, initial, children, onSave, onClose, onSaved, submitLabel = '保存' }: {
  title: string; submitLabel?: string; initial?: Record<string, unknown>; children: ReactNode | ((form: FormInstance) => ReactNode)
  onSave: (values: Record<string, unknown>) => Promise<unknown>; onClose: () => void; onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<unknown>()
  return <Modal open title={title} onCancel={onClose} destroyOnHidden maskClosable={!busy} closable={!busy}
    footer={<Space><Button onClick={onClose} disabled={busy}>取消</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>{submitLabel}</Button></Space>}>
    <ErrorNotice error={error} />
    <Form form={form} layout="vertical" initialValues={initial} disabled={busy} onValuesChange={() => setError(undefined)} onFinish={async values => {
      if (submitting.current) return
      submitting.current = true; setBusy(true); setError(undefined)
      try { await onSave(values); onSaved() } catch (failure) { if (!isAbort(failure)) { setError(failure); applyFormErrors(form, failure) } }
      finally { submitting.current = false; setBusy(false) }
    }}>{typeof children === 'function' ? children(form) : children}</Form>
  </Modal>
}
export function Missing({ reason }: { reason: string }) { return <Alert type="info" title={reason} /> }
