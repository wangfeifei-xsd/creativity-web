import { Alert, Button, Form, Input, InputNumber, Select, Space, Tag, Upload } from 'antd'
import { useRef, useState } from 'react'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { ErrorNotice, type Schema } from '../../components/Management'

type Property = { type?: string; title?: string; enum?: (string | number)[] }

export function Composer({ conversationId, detail, onSent }: { conversationId: string; detail: Schema<'ConversationDetail'>; onSent: () => void }) {
  const [form] = Form.useForm()
  const [attachments, setAttachments] = useState<Schema<'Artifact'>[]>([])
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const attempt = useRef<{ signature: string; id: string } | null>(null)
  const inFlight = useRef(false)
  const can = (key: string) => detail.conversation.actions.some(a => a.action_key === key)
  const properties = (detail.input_schema.properties ?? {}) as Record<string, Property>
  const required = (detail.input_schema.required ?? []) as string[]
  const disabled = !can('send') || !detail.executable
  async function submit(values: Record<string, unknown>) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(undefined)
    try {
      const input: Record<string, unknown> = {}
      for (const [key, property] of Object.entries(properties)) {
        const value = key === 'message' ? values.content : (values.arguments as Record<string, unknown> | undefined)?.[key]
        if (value !== undefined && value !== '') {
          if (property.type === 'object' || property.type === 'array') {
            try { input[key] = JSON.parse(String(value)) } catch { throw new Error(`请检查${property.title ?? '业务参数'}的填写格式`) }
          } else input[key] = value
        }
      }
      const body = { content: values.content, input: Object.keys(properties).length || detail.input_schema.additionalProperties === false ? input : undefined,
        attachments: attachments.map(a => ({ type: 'attachment', artifact_id: a.artifact_id })) }
      const signature = JSON.stringify(body)
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() }
      await send(`/admin/v1/conversations/${conversationId}/messages`, 'POST', { ...body, client_message_id: attempt.current.id })
      form.resetFields(); setAttachments([]); attempt.current = null; onSent()
    } catch (failure) { setError(failure) }
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
        <Form.Item key={key} name={['arguments', key]} label={property.title ?? '业务参数'} rules={[{ required: required.includes(key), message: '请填写业务参数' }]}>
          {property.enum ? <Select options={property.enum.map(value => ({ value, label: String(value) }))} />
            : property.type === 'integer' || property.type === 'number' ? <InputNumber precision={property.type === 'integer' ? 0 : undefined} />
              : property.type === 'boolean' ? <Select options={[{ value: true, label: '是' }, { value: false, label: '否' }]} />
                : <Input.TextArea autoSize={{ minRows: 1, maxRows: 5 }} />}
        </Form.Item>)}
      <Space wrap>{attachments.map(a => <Tag key={a.artifact_id} closable={!busy} onClose={() => setAttachments(v => v.filter(item => item.artifact_id !== a.artifact_id))}>{a.name}</Tag>)}</Space>
      <Form.Item style={{ marginTop: 12 }}><Space>
        {can('upload') && <Upload showUploadList={false} disabled={disabled || busy || uploading} beforeUpload={async file => {
          if (file.size > 20 * 1024 * 1024) { setError(new Error('附件不能超过 20 MB')); return false }
          if (attachments.length >= 10) { setError(new Error('最多添加 10 个附件')); return false }
          setUploading(true); setError(undefined)
          try {
            const artifact = await apiClient.request<Schema<'Artifact'>>(`/admin/v1/conversations/${conversationId}/attachments?name=${encodeURIComponent(file.name)}`,
              { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
            setAttachments(v => [...v, artifact])
          } catch (failure) { setError(failure) } finally { setUploading(false) }
          return false
        }}><Button loading={uploading}>上传附件</Button></Upload>}
        <Button htmlType="submit" type="primary" aria-label="发送" aria-busy={busy} loading={busy} disabled={disabled || uploading || busy}>发送</Button>
      </Space></Form.Item>
    </Form>
  </Space>
}
