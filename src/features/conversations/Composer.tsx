import { Alert, Button, Form, Input, InputNumber, Space, Tag, Upload } from 'antd'
import { useRef, useState } from 'react'
import { uploadFile } from '../../api/files'
import { send } from '../../api/management'
import { applyFormErrors, clearFormErrors } from '../../api/form-errors'
import { ErrorNotice, type Schema } from '../../components/Management'
import { EnumSelect } from '../../components/schema-fields/EnumSelect'
import { parseSchemaInput, schemaInputHint, schemaRequiredValue, SchemaInputError, type InputProperty } from '../../components/schema-fields/input'

export function Composer({ conversationId, detail, onSent }: { conversationId: string; detail: Schema<'ConversationDetail'>; onSent: () => void }) {
  const [form] = Form.useForm()
  const [attachments, setAttachments] = useState<Schema<'UploadedFile'>[]>([])
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const attempt = useRef<{ signature: string; id: string } | null>(null)
  const inFlight = useRef(false)
  const can = (key: string) => detail.conversation.actions.some(a => a.action_key === key)
  const properties = (detail.input_schema.properties ?? {}) as Record<string, InputProperty>
  const required = (detail.input_schema.required ?? []) as string[]
  const disabled = !can('send') || !detail.executable
  async function submit(values: Record<string, unknown>) {
    if (inFlight.current) return
    clearFormErrors(form)
    inFlight.current = true; setBusy(true); setError(undefined)
    try {
      const input = parseSchemaInput(properties, { ...(values.arguments as Record<string, unknown> | undefined), message: values.content })
      const body = { content: values.content, input: Object.keys(properties).length || detail.input_schema.additionalProperties === false ? input : undefined,
        attachments: attachments.map(a => ({ type: 'attachment', url: a.url })) }
      const signature = JSON.stringify(body)
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() }
      await send(`/admin/v1/conversations/${conversationId}/messages`, 'POST', { ...body, client_message_id: attempt.current.id })
      form.resetFields(); setAttachments([]); attempt.current = null; onSent()
    } catch (failure) {
      if (failure instanceof SchemaInputError) form.setFields([{ name: ['arguments', failure.field], errors: [failure.message] }])
      applyFormErrors(form, failure, path => path[0] === 'message' ? ['content'] : ['arguments', ...path.slice(0, 1)])
      setError(failure)
    }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <ErrorNotice error={error} />
    {!detail.executable && <Alert type="info" title={detail.unavailable_reason ?? '当前暂不可发送消息'} />}
    <Form form={form} layout="vertical" onFinish={submit} disabled={disabled || busy || uploading}>
      <Form.Item name="content" label="消息" rules={[{ required: true, whitespace: true, message: '请填写消息' }]}>
        <Input.TextArea rows={3} maxLength={100000} placeholder="输入消息" />
      </Form.Item>
      {Object.entries(properties).filter(([key]) => key !== 'message').map(([key, property]) =>
        <Form.Item key={key} name={['arguments', key]} label={property.title ?? '业务参数'} extra={schemaInputHint(property)} rules={[{ required: required.includes(key), message: '请填写业务参数', transform: value => schemaRequiredValue(property, value) }]}>
          {property.enum || property.type === 'boolean' ? <EnumSelect values={property.enum ?? [true, false]} />
            : property.type === 'integer' || property.type === 'number' ? <InputNumber precision={property.type === 'integer' ? 0 : undefined} />
              : <Input.TextArea autoSize={{ minRows: 1, maxRows: 5 }} />}
        </Form.Item>)}
      <Space wrap>{attachments.map(a => <Tag key={a.url} closable={!busy} onClose={() => setAttachments(v => v.filter(item => item.url !== a.url))}>{a.name}</Tag>)}</Space>
      <Form.Item style={{ marginTop: 12 }}><Space>
        {can('upload') && <Upload showUploadList={false} disabled={disabled || busy || uploading} beforeUpload={async file => {
          if (attachments.length >= 10) { setError(new Error('最多添加 10 个附件')); return false }
          setUploading(true); setError(undefined)
          try {
            const fileInfo = await uploadFile(file)
            setAttachments(v => [...v, fileInfo])
          } catch (failure) { setError(failure) } finally { setUploading(false) }
          return false
        }}><Button loading={uploading}>上传附件</Button></Upload>}
        <Button htmlType="submit" type="primary" aria-label="发送" aria-busy={busy} loading={busy} disabled={disabled || uploading || busy}>发送</Button>
      </Space></Form.Item>
    </Form>
  </Space>
}
