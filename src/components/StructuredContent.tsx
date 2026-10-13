import { Button, Collapse, Descriptions, Segmented, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { formatTimestamp } from '../api/presentation'
import './structured-content.css'

const fieldLabels: Record<string, string> = {
  memory: '记忆', skills: '技能', issues: '问题', loaded: '已加载', skipped: '已跳过',
  path: '文件路径', text: '正文', content: '内容', sha256: '内容摘要',
  name: '名称', title: '标题', description: '说明', role: '角色', messages: '消息',
  prompt: '提示词', system_prompt: '系统提示词', user_prompt: '用户提示词',
  input: '输入', output: '输出', result: '结果', data: '数据', context: '上下文',
  request: '请求', response: '响应', answer: '回答', query: '查询',
  tools: '工具', tool_calls: '工具调用', tool_call_id: '工具调用编号',
  function: '函数', arguments: '参数', parameters: '参数', model: '模型',
  temperature: '采样温度', max_tokens: '最大 Token 数', max_output_tokens: '最大输出 Token 数',
  usage: '用量', input_tokens: '输入 Token 数', output_tokens: '输出 Token 数', total_tokens: '总 Token 数',
  warnings: '提示', error: '错误', reason: '原因', status: '状态', type: '类型',
  metadata: '元数据', variables: '变量', resources: '资源', references: '引用',
  conversation: '会话', summary: '摘要', source_refs: '来源引用', steps: '步骤', tool_results: '工具结果',
  discoveries: '可用技能', omitted: '未加载', complete: '完整', trigger_reason: '加载原因',
  budget_units: '占用额度', used_budget: '已用额度', budget_unit: '额度单位', callable_tool_versions: '可调用工具',
  included_message_ids: '已选消息标识', excluded_message_ids: '未选消息标识',
  evidence_refs: '证据引用', version: '版本', version_id: '版本标识', skill_id: '技能标识',
  created_at: '创建时间', updated_at: '更新时间', observed_at: '观测时间', loaded_at: '加载时间',
}
const roleLabels: Record<string, string> = { system: '系统', developer: '开发者', user: '用户', assistant: '助手', tool: '工具' }

function displayLabel(labels: Record<string, string>, key: string) {
  return Object.hasOwn(labels, key) ? labels[key] : key
}

function isGroup(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object' && Object.keys(value).length > 0
}

function groupCount(value: Record<string, unknown> | unknown[]) {
  return Array.isArray(value) ? `${value.length} 项` : `${Object.keys(value).length} 个字段`
}

function TextValue({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.slice(0, 400).split('\n').slice(0, 6).join('\n')
  const long = text.length > preview.length
  return <div className="structured-content-text">
    <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{long && !expanded ? `${preview}…` : text}</Typography.Text>
    {long && <Button type="link" size="small" onClick={() => setExpanded(!expanded)}>{expanded ? '收起正文' : '展开全文'}</Button>}
  </div>
}

function ScalarValue({ value, field }: { value: unknown; field?: string }) {
  if (value == null) return <Typography.Text type="secondary">未提供</Typography.Text>
  if (value === '') return <Typography.Text type="secondary">空文本</Typography.Text>
  if (typeof value === 'boolean') return <Tag>{value ? '是' : '否'}</Tag>
  if (typeof value === 'object') return <Typography.Text type="secondary">{Array.isArray(value) ? '空列表（0 项）' : '空对象（0 个字段）'}</Typography.Text>
  if (typeof value === 'string') {
    if (field === 'role') return <Tag color="blue">{displayLabel(roleLabels, value)}</Tag>
    if (field === 'budget_unit' && value === 'utf8_bytes') return <Typography.Text>字节（UTF-8）</Typography.Text>
    if (field?.endsWith('_at') && /^\d{4}-\d{2}-\d{2}T/.test(value)) return <Typography.Text>{formatTimestamp(value)}</Typography.Text>
    return <TextValue text={value} />
  }
  return <Typography.Text>{String(value)}</Typography.Text>
}

function ArrayValue({ value, depth }: { value: unknown[]; depth: number }) {
  const [limit, setLimit] = useState(20)
  return <Space orientation="vertical" className="structured-content-stack" size="small">
    <Collapse size="small" defaultActiveKey={depth < 3 ? ['0'] : []} items={value.slice(0, limit).map((item, index) => {
      const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : undefined
      const name = row && [row.name, row.title, row.path, typeof row.role === 'string' ? displayLabel(roleLabels, row.role) : undefined].find(value => typeof value === 'string' && value)
      return { key: String(index), label: <span className="structured-content-label">第 {index + 1} 项{name ? ` · ${name}` : ''}</span>, children: <DataValue value={item} depth={depth + 1} /> }
    })} />
    {value.length > limit && <Button size="small" onClick={() => setLimit(limit + 20)}>加载更多（剩余 {value.length - limit} 项）</Button>}
  </Space>
}

function DataValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (!isGroup(value)) return <ScalarValue value={value} />
  if (Array.isArray(value)) return <ArrayValue value={value} depth={depth} />
  const fields = Object.entries(value)
  const scalars = fields.filter(([, child]) => !isGroup(child))
  const groups = fields.filter((entry): entry is [string, Record<string, unknown> | unknown[]] => isGroup(entry[1]))
  return <Space orientation="vertical" className="structured-content-stack" size="small">
    {!!scalars.length && <Descriptions bordered size="small" column={1} className="structured-content-fields" items={scalars.map(([key, child]) => ({
      key, label: displayLabel(fieldLabels, key), children: <ScalarValue value={child} field={key} />,
    }))} />}
    {!!groups.length && <Collapse size="small" defaultActiveKey={depth < 2 ? groups.map(([key]) => key) : []} items={groups.map(([key, child]) => ({
      key, label: <Space wrap size="small"><span className="structured-content-label">{displayLabel(fieldLabels, key)}</span><Typography.Text type="secondary">{groupCount(child)}</Typography.Text></Space>,
      children: <DataValue value={child} depth={depth + 1} />,
    }))} />}
  </Space>
}

export function StructuredContent({ value, label }: { value: unknown; label: string }) {
  const [mode, setMode] = useState('structured')
  return <section className="structured-content" aria-label={label}>
    <Segmented aria-label={`${label}展示方式`} value={mode} onChange={setMode}
      options={[{ label: '结构化', value: 'structured' }, { label: '原始 JSON', value: 'json' }]} />
    {mode === 'json' ? <pre className="structured-content-json">{JSON.stringify(value, null, 2) ?? '未提供'}</pre> : <DataValue value={value} />}
  </section>
}
