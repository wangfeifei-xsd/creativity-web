import { App, Button, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Tabs, Tree } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { fileTree } from './file-tree'
import { SkillToolBindings } from './SkillToolBindings'

type Version = Schema<'SkillVersionView'>
type Settings = Schema<'SkillSettings'>
type Values = Settings
const capabilities = [{ value: 'text', label: '文本生成' }, { value: 'tools', label: '工具调用' },
  { value: 'structured_output', label: '结构化输出' }, { value: 'streaming', label: '流式输出' },
  { value: 'vision', label: '视觉理解' }, { value: 'embedding', label: '向量生成' }]

export function SkillEditor({ version, onClose, onSaved }: { version: Version; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<Values>()
  const { modal } = App.useApp()
  const tools = useQuery<Schema<'SkillToolOption'>[]>('/admin/v1/skills/tool-options')
  const agents = useQuery<Schema<'SkillAgentOption'>[]>('/admin/v1/skills/agent-options')
  const [requirements, setRequirements] = useState(version.settings.tool_requirements ?? [])
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [removed, setRemoved] = useState<string[]>([])
  const [selected, setSelected] = useState<string>()
  const [newPath, setNewPath] = useState('')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [activeTab, setActiveTab] = useState('files')
  const paths = [...new Set([...version.files.map(f => f.relative_path), ...Object.keys(texts)])].filter(path => !removed.includes(path))
  async function select(path: string) {
    setSelected(path)
    if (path in texts) return
    setReading(true); setError(undefined)
    try {
      const file = await apiClient.request<Schema<'SkillFileContent'>>(`/admin/v1/skill-versions/${version.version_id}/files?path=${encodeURIComponent(path)}`)
      if (file.text === null) throw new Error('此文件不能作为文本编辑')
      setTexts(current => ({ ...current, [path]: file.text! }))
    } catch (failure) { setError(failure) } finally { setReading(false) }
  }
  async function save(values: Values) {
    if (busy) return
    setBusy(true); setError(undefined)
    try {
      await send(`/admin/v1/skills/${version.version_id}/configuration`, 'PATCH', {
        revision: version.revision, settings: { ...version.settings, ...values, tool_requirements: requirements,
          tool_bindings: Object.fromEntries(requirements.filter(r => values.tool_bindings?.[r.tool_code]).map(r => [r.tool_code, values.tool_bindings![r.tool_code]])) },
        files: Object.entries(texts).filter(([path]) => !removed.includes(path)).map(([relative_path, text]) => ({ relative_path, text })), remove_paths: removed,
      })
      onSaved()
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  function add() {
    if (!newPath.trim()) return
    if (paths.includes(newPath)) { setError(new Error('此路径已经存在')); return }
    setTexts(current => ({ ...current, [newPath]: '' })); setRemoved(current => current.filter(path => path !== newPath)); setSelected(newPath); setNewPath('')
  }
  return <Modal open title="编辑技能包" width={980} onCancel={onClose} closable={!busy} maskClosable={!busy} style={{ top: 24 }}
    styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }} footer={<Space><Button onClick={onClose} disabled={busy}>取消</Button>
      <Button type="primary" loading={busy} onClick={() => form.submit()}>保存</Button></Space>}>
    <ErrorNotice error={error || tools.error || agents.error} />
    <Form form={form} layout="vertical" onFinish={save} disabled={busy} onFinishFailed={() => setActiveTab('settings')}
      initialValues={version.settings}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'files', label: '文件编辑', children: <><Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input aria-label="新文件路径" placeholder="references/example.md" value={newPath} onChange={event => setNewPath(event.target.value)} />
          <Button onClick={add}>新增文件</Button></Space.Compact>
          <Row gutter={[16, 16]}><Col xs={24} md={7}><Tree defaultExpandAll treeData={fileTree(paths)} selectedKeys={selected ? [selected] : []}
            onSelect={keys => { if (keys[0]) void select(String(keys[0])) }} /></Col><Col xs={24} md={17}>
            {selected && <><Form.Item label={selected}><Input.TextArea aria-label="文件正文" value={texts[selected] ?? ''} rows={16} spellCheck={false}
              disabled={reading || !(selected in texts)} onChange={event => setTexts(current => ({ ...current, [selected]: event.target.value }))} /></Form.Item>
              {selected !== 'SKILL.md' && <Button danger onClick={() => modal.confirm({ title: '移除包内文件', content: selected, okText: '移除', cancelText: '取消', onOk: () => { setRemoved(current => [...current, selected]); setSelected(undefined) } })}>移除文件</Button>}</>}
          </Col></Row></> },
        { key: 'settings', label: '加载设置', forceRender: true, children: <>
          <Form.Item name="loading_mode" label="加载方式"><Select options={[{ value: 'mandatory', label: '始终加载' }, { value: 'on_demand', label: '按需加载' }]} /></Form.Item>
          <Form.Item name="priority" label="加载优先级" extra="数字越小越先加载，同优先级遵循智能体配置顺序。"><InputNumber min={-1000} max={1000} /></Form.Item>
          <Form.Item name="context_budget" label="上下文上限（UTF-8 字节）"><InputNumber min={1} max={200000} /></Form.Item>
          <Form.Item name="allowed_agents" label="授权智能体" extra="留空表示由智能体绑定与当前权限共同决定。"><Select mode="multiple" options={[
            ...(agents.data?.map(agent => ({ value: agent.agent_id, label: agent.name })) ?? []),
            ...(version.settings.allowed_agents ?? []).filter(id => !agents.data?.some(agent => agent.agent_id === id)).map(id => ({ value: id, label: '智能体名称不可用' })),
          ]} /></Form.Item>
          <Form.Item name="conflict_groups" label="互斥规则组"><Select mode="tags" /></Form.Item>
          <Form.Item name="change_note" label="变更说明"><Input.TextArea rows={3} /></Form.Item>
        </> },
        { key: 'dependencies', label: '工具与模型', forceRender: true, children: <>
          <SkillToolBindings requirements={requirements} options={tools.data ?? []} />
          {requirements.map(requirement => <Button key={requirement.tool_code} onClick={() => setRequirements(current => current.filter(r => r.tool_code !== requirement.tool_code))}>移除依赖 {requirement.tool_code}</Button>)}
          <Form.Item label="新增工具依赖"><Select value={undefined} placeholder="选择工具" options={(tools.data ?? []).filter(t => !requirements.some(r => r.tool_code === t.tool_code)).map(t => ({ value: t.version_id, label: t.name, disabled: !t.available }))}
            onChange={id => { const tool = tools.data?.find(t => t.version_id === id); if (!tool) return
              const { tool_code, version_label, source_type, input_schema, output_schema } = tool
              setRequirements(current => [...current, { tool_code, version_label, source_type, input_schema, output_schema }])
              form.setFieldValue(['tool_bindings', tool_code], id)
            }} /></Form.Item>
          <Form.Item name="required_model_capabilities" label="模型能力要求"><Select mode="multiple" options={capabilities} /></Form.Item>
        </> },
        { key: 'variables', label: '输入变量', forceRender: true, children: <Form.List name="input_variables">{(fields, { add, remove }) => <>
          {fields.map(field => <Space key={field.key} wrap align="start">
            <Form.Item name={[field.name, 'name']} label="变量名" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name={[field.name, 'label']} label="显示名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name={[field.name, 'value_type']} label="类型"><Select style={{ width: 120 }} options={[
              { value: 'string', label: '文本' }, { value: 'number', label: '数值' }, { value: 'boolean', label: '是或否' },
              { value: 'object', label: '对象' }, { value: 'array', label: '列表' }]} /></Form.Item>
            <Form.Item name={[field.name, 'required']} valuePropName="checked" label="必填"><Checkbox /></Form.Item>
            <Button onClick={() => remove(field.name)}>移除变量</Button>
          </Space>)}<Button onClick={() => add({ name: '', label: '', value_type: 'string', required: true })}>新增变量</Button>
        </>}</Form.List> },
      ]} />
    </Form>
  </Modal>
}
