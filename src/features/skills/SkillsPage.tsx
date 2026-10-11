import { Button, Collapse, Descriptions, Form, Input, Modal, Select, Space, Tabs, Typography, Upload } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { useResourceSummaries } from '../resources/useResourceSummaries'
import { resourceColumns } from '../resources/resourceColumns'
import { ResourceActions } from '../resources/ResourceManagement'
import { SkillEditor } from './SkillEditor'
import { SkillFiles } from './SkillFiles'
import { SkillTests } from './SkillTests'
import { SkillToolBindings } from './SkillToolBindings'

type Detail = Schema<'SkillDetail'>

export function SkillsPage() {
  const { '*': path } = useParams()
  return path ? <SkillDetail key={path} skillId={path} /> : <SkillList />
}

function SkillList() {
  const [search, setSearch] = useState('')
  const query = useQuery<Schema<'SkillList'>>(`/admin/v1/skills?search=${encodeURIComponent(search)}`)
  const [editor, setEditor] = useState<'create' | 'import'>()
  const summaries = useResourceSummaries('skill', query.data?.items.map(row => row.skill_id) ?? [], query.data)
  const navigate = useNavigate()
  return <PageContainer title="技能管理" actions={<Space><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setEditor('create'), import: () => setEditor('import') }} /></Space>}>
    <Input.Search aria-label="技能名称或用途" placeholder="技能名称或用途" allowClear onSearch={setSearch} style={{ maxWidth: 360, marginBottom: 16 }} />
    <ErrorNotice error={summaries.error} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="skill_id" dataSource={query.data.items} scroll={{ x: 650 }} columns={[
        { title: '技能名称', render: (_, row) => <Link to={`/skills/${row.skill_id}`}>{row.name}</Link> },
        { title: '用途', dataIndex: 'description', ellipsis: true }, { title: '负责人', dataIndex: 'owner' },
        { title: '标签', render: (_, row) => row.tags.join('、') || '未设置' },
        ...resourceColumns<Schema<'SkillView'>>('skill', summaries.items, row => row.skill_id, row => navigate(`/skills/${row.skill_id}?edit=1`), query.reload),
      ]} />}
    {editor && <SkillCreate mode={editor} onClose={() => setEditor(undefined)} onSaved={detail => navigate(`/skills/${detail.skill.skill_id}`)} />}
  </PageContainer>
}

function SkillCreate({ mode, onClose, onSaved }: { mode: 'create' | 'import'; onClose: () => void; onSaved: (value: Detail) => void }) {
  const [form] = Form.useForm()
  const [archive, setArchive] = useState<string>()
  const [filename, setFilename] = useState<string>()
  const [preview, setPreview] = useState<Schema<'SkillImportPreview'>>()
  const tools = useQuery<Schema<'SkillToolOption'>[]>('/admin/v1/skills/tool-options')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  async function upload(file: File) {
    setBusy(true); setPreview(undefined); setArchive(undefined); setFilename(undefined)
    form.setFieldValue('tool_bindings', {})
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('压缩包不能超过 8 MiB')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const parts: string[] = []
      for (let start = 0; start < bytes.length; start += 8192) parts.push(String.fromCharCode(...bytes.subarray(start, start + 8192)))
      const encoded = btoa(parts.join(''))
      const result = await send<Schema<'SkillImportPreview'>>('/admin/v1/skills/imports/preview', 'POST', { archive_base64: encoded })
      setPreview(result); setArchive(encoded); setFilename(file.name); setError(undefined)
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
    return false
  }
  async function save(values: Record<string, unknown>) {
    setBusy(true); setError(undefined)
    try {
      if (mode === 'import' && !archive) throw new Error('请选择技能归档包')
      const result = await send<Detail>(mode === 'import' ? '/admin/v1/skills/imports' : '/admin/v1/skills', 'POST',
        mode === 'import' ? { skill_code: values.skill_code, owner: values.owner, name: values.name || null, archive_base64: archive,
          tool_bindings: values.tool_bindings ?? {} } : values)
      onSaved(result)
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  return <Modal open title={mode === 'import' ? '导入技能包' : '新增技能'} onCancel={onClose} width={720}
    maskClosable={!busy} closable={!busy} footer={<Space><Button onClick={onClose} disabled={busy}>取消</Button>
      <Button type="primary" loading={busy} onClick={() => form.submit()}>保存</Button></Space>}
    styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}>
    <ErrorNotice error={error} />
    <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
      <Form.Item name="skill_code" label="技能编码" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item>
      <Form.Item name="name" label={mode === 'import' ? '本地显示名称' : '技能名称'} rules={[{ required: mode === 'create' }]}><Input maxLength={128} /></Form.Item>
      <Form.Item name="owner" label="负责人" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
      {mode === 'create' ? <><Form.Item name="description" label="用途" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="instructions" label="技能指令" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item></> :
        <Form.Item label="技能归档包"><Upload beforeUpload={upload} showUploadList={false} accept=".zip,.tar,.gz,.tgz"><Button>选择文件</Button></Upload>
          {filename && <Typography.Text>{filename}</Typography.Text>}</Form.Item>}
      {mode === 'import' && preview && <>
        <Table size="small" tableLayout="fixed" rowKey="relative_path" pagination={false} dataSource={preview.files} columns={[
          { title: '文件', render: (_, file) => <span style={{ overflowWrap: 'anywhere' }}>{file.relative_path}</span> },
          { title: '大小', width: 80, render: (_, file) => <span style={{ whiteSpace: 'nowrap' }}>{file.size_bytes} 字节</span> },
          { title: '加载状态', width: 96, render: (_, file) => file.unavailable_reason ?? '可加载' },
        ]} />
        <SkillToolBindings requirements={preview.settings.tool_requirements ?? []} options={tools.data ?? []} />
        <ErrorNotice error={tools.error} />
        <Collapse size="small" items={[{ key: 'instructions', label: '查看技能指令', children: <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{preview.instruction_preview}</pre> }]} />
      </>}
    </Form>
  </Modal>
}

function SkillDetail({ skillId }: { skillId: string }) {
  const query = useQuery<Detail>(`/admin/v1/skills/${skillId}`)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editor, setEditor] = useState<'resource' | 'version' | undefined>(() => searchParams.get('edit') === '1' ? 'version' : undefined)
  const [validation, setValidation] = useState<Schema<'SkillValidation'>>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState('files')
  const navigate = useNavigate()
  const summaries = useResourceSummaries('skill', [skillId], query.data)
  const detail = query.data
  const summary = detail?.versions.find(v => v.version_id === skillId)
  const versionQuery = useQuery<Schema<'SkillVersionView'>>(summary ? `/admin/v1/skills/${skillId}/configuration` : null, false, summary?.revision)
  const version = versionQuery.data?.revision === summary?.revision ? versionQuery.data : undefined
  function closeEditor() {
    setEditor(undefined)
    if (searchParams.has('edit')) {
      const next = new URLSearchParams(searchParams); next.delete('edit')
      setSearchParams(next, { replace: true })
    }
  }
  async function mutate(action: 'validate' | 'export') {
    if (!version || !detail || busy) return
    setBusy(true); setError(undefined)
    try {
      if (action === 'validate') {
        setValidation(await send<Schema<'SkillValidation'>>(`/admin/v1/skill-versions/${version.version_id}/validate`, 'POST'))
        setActiveTab('dependencies')
      } else if (action === 'export') {
        const artifact = await send<Schema<'Artifact'>>(`/admin/v1/skill-versions/${version.version_id}/exports`, 'POST')
        const file = await apiClient.download(`/admin/v1/artifacts/${artifact.artifact_id}/content`)
        const url = URL.createObjectURL(file.blob)
        const link = document.createElement('a'); link.href = url; link.download = file.name ?? artifact.name
        link.click(); URL.revokeObjectURL(url)
      }
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail) return <LoadingState />
  return <PageContainer title={detail.skill.name} actions={<Space wrap><Link to="/skills">返回技能列表</Link>
    <Button onClick={query.reload}>刷新</Button><Button onClick={() => setEditor('resource')}>编辑信息</Button><ResourceActions kind="skill" summary={summaries.items[skillId]} onEdit={() => setEditor('version')} onChanged={() => navigate('/skills')} /></Space>}>
    <ErrorNotice error={error ?? versionQuery.error} />
    <Descriptions items={[
      { key: 'status', label: '状态', children: summaries.items[skillId]?.status.label ?? '加载中' },
      { key: 'owner', label: '负责人', children: detail.skill.owner },
      { key: 'description', label: '用途', children: detail.skill.description },
    ]} />
    <Space wrap style={{ marginBlock: 16 }}>
      {version && <ActionButtons actions={version.actions} handlers={busy ? {} : { validate: () => void mutate('validate'), test: () => setActiveTab('tests'), export: () => void mutate('export') }} />}
    </Space>
    {!version && summary && (versionQuery.error ? <ErrorState error={versionQuery.error} onRetry={versionQuery.reload} /> : <LoadingState />)}
    {version && <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
      { key: 'files', label: '包文件', children: <SkillFiles key={`${version.version_id}:${version.revision}`} version={version} /> },
      { key: 'metadata', label: '元数据', children: <><Descriptions items={[
        { key: 'mode', label: '加载方式', children: version.settings.loading_mode === 'mandatory' ? '始终加载' : '按需加载' },
        { key: 'priority', label: '加载优先级', children: version.settings.priority },
        { key: 'budget', label: '上下文上限', children: `${version.settings.context_budget} 字节` },
        { key: 'changes', label: '变更说明', children: version.settings.change_note || '未填写' },
      ]} /><Typography.Title level={5} style={{ marginTop: 24 }}>入口元数据</Typography.Title><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(version.metadata, null, 2)}</pre></> },
      { key: 'preview', label: '加载预览', children: <Tabs items={[
        { key: 'discovery', label: '发现阶段', children: <pre style={{ whiteSpace: 'pre-wrap' }}>{version.discovery_preview}</pre> },
        { key: 'instructions', label: '完整指令', children: <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{version.instruction_preview}</pre> },
      ]} /> },
      { key: 'dependencies', label: '依赖检查', children: validation ? <><Typography.Paragraph>{validation.valid ? '依赖检查通过' : '依赖检查未通过'}</Typography.Paragraph>
        {validation.issues.map((issue, index) => <Typography.Paragraph type="danger" key={index}>{issue.message}</Typography.Paragraph>)}
        <Table rowKey={(_, index) => String(index)} dataSource={validation.dependencies} columns={[
          { title: '工具', render: (_, dep) => dep.name ?? '目标工具未绑定' },
          { title: '检查结果', render: (_, dep) => dep.reason ?? '可用' },
        ]} /></> : <Button onClick={() => void mutate('validate')} loading={busy}>检查当前依赖</Button> },
      { key: 'tests', label: '测试', children: <SkillTests key={`${version.version_id}:${version.revision}`} version={version} /> },
    ]} />}
    {editor === 'resource' && <ResourceEditor detail={detail} onClose={closeEditor} onSaved={() => { closeEditor(); query.reload() }} />}
    {editor === 'version' && version && <SkillEditor version={version} onClose={closeEditor} onSaved={() => { closeEditor(); setValidation(undefined); query.reload() }} />}
  </PageContainer>
}

function ResourceEditor({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  async function save(values: Record<string, unknown>) {
    setBusy(true)
    try { await send(`/admin/v1/skills/${detail.skill.skill_id}`, 'PATCH', { ...values, status: 'ACTIVE', revision: detail.skill.revision }); onSaved() }
    catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Modal open title="编辑技能" onCancel={onClose} onOk={() => form.submit()} okText="保存" cancelText="取消" confirmLoading={busy}>
    <ErrorNotice error={error} /><Form form={form} layout="vertical" onFinish={save} initialValues={{ ...detail.skill, status: detail.skill.status.value }}>
      <Form.Item name="name" label="技能名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="description" label="用途" rules={[{ required: true }]}><Input.TextArea /></Form.Item>
      <Form.Item name="owner" label="负责人" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="tags" label="标签"><Select mode="tags" /></Form.Item>
    </Form>
  </Modal>
}
