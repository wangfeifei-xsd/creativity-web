import { Alert, App, Button, Collapse, Descriptions, Form, Space, Tabs } from 'antd'
import { useState } from 'react'
import { apiClient, ApiError } from '../../api/client'
import { applyFormErrors } from '../../api/form-errors'
import { useQuery } from '../../api/useQuery'
import { EditorDialog } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { useResourceSummaries } from '../resources/useResourceSummaries'
import { ResourceActions } from '../resources/ResourceManagement'
import { PromptDebug } from './Debug'
import { TemplateFields, VariableFields } from './EditorFields'
import { editorValues, fromEditor, type EditorValues } from './editor-values'
import { PromptPreview } from './Preview'
import { PromptExperiments } from './Experiments'
import { contentOf, errorText, send, type Prompt, type Schema, type Version } from './types'

export function PromptDetail({ promptId, onBack }: { promptId: string; onBack: () => void }) {
  const resource = useQuery<Prompt>(`/admin/v1/prompts/${promptId}`)
  const configuration = useQuery<Version>(`/admin/v1/prompts/${promptId}/configuration`)
  const summaries = useResourceSummaries('prompt', [promptId], configuration.data)
  const [editingInfo, setEditingInfo] = useState(false)
  const refresh = () => { resource.reload(); configuration.reload() }
  return <PageContainer title={resource.data?.name ?? '提示词详情'} actions={<Space><Button onClick={onBack}>返回列表</Button><Button onClick={refresh}>刷新</Button>
    <ResourceActions kind="prompt" summary={summaries.items[promptId]} onEdit={() => setEditingInfo(true)} onChanged={onBack} /></Space>}>
    {resource.error || configuration.error ? <ErrorState error={resource.error || configuration.error} onRetry={refresh} /> : !resource.data || !configuration.data ? <LoadingState /> : <>
      <Descriptions items={[{ key: 'purpose', label: '用途', children: resource.data.purpose }]} />
      <Workbench key={configuration.data.revision} current={configuration.data} prompt={resource.data} onChanged={refresh} />
    </>}
    {editingInfo && resource.data && <EditorDialog title="编辑提示词信息" initial={{ name: resource.data.name, purpose: resource.data.purpose, revision: resource.data.revision }}
      fields={[{ name: 'name', label: '名称', required: true }, { name: 'purpose', label: '用途', required: true }]}
      latestRevision={async () => (await apiClient.request<Prompt>(`/admin/v1/prompts/${promptId}`)).revision}
      onClose={() => setEditingInfo(false)} onSaved={() => { setEditingInfo(false); refresh() }}
      onSave={values => send(`/admin/v1/prompts/${promptId}`, values, 'PATCH')} />}
  </PageContainer>
}
function Workbench({ current, prompt, onChanged }: {
  current: Version; prompt: Prompt; onChanged: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<EditorValues>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [latest, setLatest] = useState<Version>()
  const editable = current.actions.some(action => action.action_key === 'version:edit')
  async function save() {
    setBusy(true); setError(undefined)
    try {
      const content = fromEditor(await form.validateFields())
      await send(`/admin/v1/prompts/${current.version.resource_id}/configuration`, { revision: current.revision, content }, 'PATCH')
      void message.success('配置已保存'); onChanged()
    } catch (error) {
      applyFormErrors(form, error); setError(errorText(error))
      if (error instanceof ApiError && error.status === 409) {
        try { setLatest(await apiClient.request(`/admin/v1/prompts/${current.version.resource_id}/configuration`)) }
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
  const controls = <Space wrap>{editable && <Button type="primary" loading={busy} onClick={() => void save()}>保存</Button>}
    {current.actions.some(action => action.action_key === 'data:export') && <><Button loading={busy} onClick={() => void download('json')}>导出结构化配置</Button><Button loading={busy} onClick={() => void download('text')}>导出文本</Button></>}</Space>
  return <Space orientation="vertical" style={{ width: '100%' }}>
    {error && <Alert type="error" title={error} />}
    {latest && <Alert type="warning" title={`当前内容已更新至修订 ${latest.revision}`} description={<>
      <Collapse items={[
        { key: 'mine', label: '本次编辑内容', children: <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(form.getFieldsValue(true), null, 2)}</pre> },
        { key: 'latest', label: '最新已保存内容', children: <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(latest.version.content, null, 2)}</pre> },
      ]} /><Button onClick={onChanged}>载入最新内容</Button>
    </>} />}
    <Form component={false} form={form} initialValues={editorValues(contentOf(current))} layout="vertical">
      <Tabs items={[
        { key: 'edit', label: '编辑', forceRender: true, children: <Space orientation="vertical" style={{ width: '100%' }}>{controls}<TemplateFields editable={editable} /></Space> },
        { key: 'variables', label: '变量', forceRender: true, children: <Space orientation="vertical" style={{ width: '100%' }}>{controls}<VariableFields editable={editable} /></Space> },
        { key: 'preview', label: '预览', children: <PromptPreview version={current} /> },
        { key: 'debug', label: '调试', children: <PromptDebug version={current} /> },
        { key: 'experiments', label: '实验', children: <PromptExperiments promptId={prompt.prompt_id} /> },
      ]} />
    </Form>
  </Space>
}
