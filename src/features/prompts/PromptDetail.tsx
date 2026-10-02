import { Alert, App, Button, Collapse, Descriptions, Form, Input, Modal, Select, Space, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { apiClient, ApiError } from '../../api/client'
import { applyFormErrors } from '../../api/form-errors'
import { useQuery } from '../../api/useQuery'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { PromptDebug } from './Debug'
import { TemplateFields, VariableFields } from './EditorFields'
import { editorValues, fromEditor, type EditorValues } from './editor-values'
import { PromptPreview } from './Preview'
import { PromptVersions, References } from './Versions'
import { contentOf, emptyContent, errorText, send, type Prompt, type Schema, type Version } from './types'

export function PromptDetail({ promptId, onBack }: { promptId: string; onBack: () => void }) {
  const resource = useQuery<Prompt>(`/admin/v1/prompts/${promptId}`)
  const versions = useQuery<Version[]>(`/admin/v1/prompts/${promptId}/versions`)
  const [selected, setSelected] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const current = versions.data?.find(item => item.version.version_id === selected) ?? versions.data?.[0]
  const refresh = () => { resource.reload(); versions.reload() }
  return <PageContainer title={resource.data?.name ?? '提示词详情'} actions={<Space><Button onClick={onBack}>返回列表</Button><Button onClick={refresh}>刷新</Button>
    {resource.data?.actions.some(action => action.action_key === 'version:edit') && <Button onClick={() => { setLabel(''); setError(undefined); setCreating(true) }}>新建草稿</Button>}</Space>}>
    {resource.error || versions.error ? <ErrorState error={resource.error || versions.error} onRetry={refresh} /> : !resource.data || !versions.data ? <LoadingState /> : <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Descriptions items={[{ key: 'purpose', label: '用途', children: resource.data.purpose }]} />
      {current ? <>
        <Space><Select aria-label="提示词版本" value={current.version.version_id} onChange={setSelected} style={{ minWidth: 250 }} options={versions.data.map(item => ({ value: item.version.version_id, label: `${item.version.version_label} · ${item.status.label}` }))} />
          <StatusTag status={current.status} /><Typography.Text>修订 {current.revision}</Typography.Text></Space>
        <Workbench key={`${current.version.version_id}:${current.revision}`} current={current} versions={versions.data} prompt={resource.data} onChanged={refresh} />
      </> : <Alert type="info" title="暂无版本" />}
    </Space>}
    <Modal title="新建草稿" open={creating} confirmLoading={busy} onCancel={() => setCreating(false)} onOk={async () => {
      setBusy(true); setError(undefined)
      try {
        const draft = await send<Version>(`/admin/v1/prompts/${promptId}/versions`, { version_label: label, content: current ? contentOf(current) : emptyContent })
        setSelected(draft.version.version_id); setCreating(false); refresh()
      } catch (error) { setError(errorText(error)) }
      finally { setBusy(false) }
    }}>
      {error && <Alert type="error" title={error} />}
      <Form layout="vertical"><Form.Item label="版本名称" required><Input value={label} onChange={event => setLabel(event.target.value)} /></Form.Item></Form>
    </Modal>
  </PageContainer>
}
function Workbench({ current, versions, prompt, onChanged }: {
  current: Version; versions: Version[]; prompt: Prompt; onChanged: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<EditorValues>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [latest, setLatest] = useState<Version>()
  const editable = current.version.state === 'DRAFT' && current.actions.some(action => action.action_key === 'version:edit')
  async function save() {
    setBusy(true); setError(undefined)
    try {
      const content = fromEditor(await form.validateFields())
      await send(`/admin/v1/prompt-versions/${current.version.version_id}`, { revision: current.revision, content }, 'PATCH')
      void message.success('草稿已保存'); onChanged()
    } catch (error) {
      applyFormErrors(form, error); setError(errorText(error))
      if (error instanceof ApiError && error.status === 409) {
        try { setLatest(await apiClient.request(`/admin/v1/prompt-versions/${current.version.version_id}`)) }
        catch (readError) { setError(errorText(readError)) }
      }
    } finally { setBusy(false) }
  }
  async function download(format: 'text' | 'json') {
    setBusy(true); setError(undefined)
    try {
      const artifact = await send<Schema<'Artifact'>>(`/admin/v1/prompt-versions/${current.version.version_id}/exports`, { format })
      const file = await apiClient.download(`/admin/v1/artifacts/${artifact.artifact_id}/content`)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a'); link.href = url; link.download = file.name ?? artifact.name
      link.click(); URL.revokeObjectURL(url)
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  const controls = <Space wrap>{editable && <Button type="primary" loading={busy} onClick={() => void save()}>保存草稿</Button>}
    {current.actions.some(action => action.action_key === 'data:export') && <><Button loading={busy} onClick={() => void download('json')}>导出结构化配置</Button><Button loading={busy} onClick={() => void download('text')}>导出文本</Button></>}</Space>
  return <Space orientation="vertical" style={{ width: '100%' }}>
    {error && <Alert type="error" title={error} />}
    {latest && <Alert type="warning" title={`当前内容已更新至修订 ${latest.revision}`} description={<>
      <Collapse items={[
        { key: 'mine', label: '本次编辑内容', children: <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(form.getFieldsValue(true), null, 2)}</pre> },
        { key: 'latest', label: '最新已保存内容', children: <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(latest.version.content, null, 2)}</pre> },
      ]} /><Button onClick={onChanged}>载入最新版本</Button>
    </>} />}
    <Form component={false} form={form} initialValues={editorValues(contentOf(current))} layout="vertical">
      <Tabs items={[
        { key: 'edit', label: '编辑', forceRender: true, children: <Space orientation="vertical" style={{ width: '100%' }}>{controls}<TemplateFields editable={editable} /></Space> },
        { key: 'variables', label: '变量', forceRender: true, children: <Space orientation="vertical" style={{ width: '100%' }}>{controls}<VariableFields editable={editable} /></Space> },
        { key: 'preview', label: '预览', children: <PromptPreview version={current} /> },
        { key: 'debug', label: '调试', children: <PromptDebug version={current} /> },
        { key: 'versions', label: '版本', children: <PromptVersions current={current} versions={versions} prompt={prompt} onChanged={onChanged} /> },
        { key: 'references', label: '引用', children: <References promptId={prompt.prompt_id} /> },
      ]} />
    </Form>
  </Space>
}
