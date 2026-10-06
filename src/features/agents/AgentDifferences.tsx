import { Card, Col, Collapse, Descriptions, Empty, Row, Space, Typography } from 'antd'
import { formatAmount } from '../../api/presentation'
import { Table } from '../../components/Table'
import { SchemaComparison } from '../../components/schema-fields/SchemaComparison'
import { SchemaView } from '../../components/schema-fields/SchemaFields'
import { isObject } from '../../components/schema-fields/schema'
import { type Definition, type Detail, type Options, workflowNames } from './types'

export function AgentDifferences({ detail, options }: { detail: Detail; options?: Options }) {
  const released = detail.versions.find(version => version.version_id === detail.release_version_id)?.definition
  const draft = detail.versions.filter(version => version.status.value === 'DRAFT').at(-1)?.definition
  if (!detail.differences.length) return <Empty description="暂无差异" />
  return <Space orientation="vertical" style={{ width: '100%' }} size={20}>{detail.differences.map(item => <Card size="small" title={item.label} key={item.field}>
    {['input_schema', 'output_schema'].includes(item.field) ? <SchemaComparison before={item.before} after={item.after} label={item.label} /> :
      <Row gutter={[24, 20]}><Col xs={24} lg={12}><Typography.Title level={5}>当前发布</Typography.Title><DifferenceValue field={item.field} value={item.before} definition={released} options={options} /></Col>
        <Col xs={24} lg={12}><Typography.Title level={5}>草稿</Typography.Title><DifferenceValue field={item.field} value={item.after} definition={draft} options={options} /></Col></Row>}
  </Card>)}</Space>
}

function fieldLabel(schema: Record<string, unknown> | undefined, path: string): string {
  const field = isObject(schema?.properties) ? schema.properties[path] : undefined
  return isObject(field) && typeof field.title === 'string' ? field.title : path || '完整内容'
}
function DifferenceValue({ field, value, definition, options }: { field: string; value: unknown; definition?: Definition; options?: Options }) {
  const resourceName = (id: unknown) => options?.dependencies.find(item => item.version_id === id || item.resource_id === id)?.name ?? '资源名称不可用'
  const stepName = (id: string | null | undefined) => id === 'END' ? '结束' : definition?.steps.find(step => step.key === id)?.name ?? '步骤名称不可用'
  if (value == null) return <Typography.Text type="secondary">尚未发布</Typography.Text>
  if (field === 'workflow_type') return <>{workflowNames[value as keyof typeof workflowNames] ?? '类型不可用'}</>
  if (field === 'entrypoint') return <>{[...options?.templates ?? [], ...options?.legacy_templates ?? []].find(item => item.key === value)?.name ?? '入口名称不可用'}</>
  if (field === 'start_step') return <>{stepName(String(value))}</>
  if (field === 'bindings' && isObject(value)) {
    const bindings = [
      ['prompt_id', 'prompt_version', '提示词'], ['model_route_id', 'model_route_version', '模型路由'], ['embedding_route_id', 'embedding_route_version', '语义检索模型路由'],
      ['tool_ids', 'tool_versions', '工具白名单'], ['skill_ids', 'skill_versions', '技能'],
    ]
    return <Space orientation="vertical" style={{ width: '100%' }}><Descriptions size="small" column={1} items={bindings.map(([key, legacy, label]) => {
      const selected = value[key] ?? value[legacy], ids = Array.isArray(selected) ? selected : selected ? [selected] : []
      return { key, label, children: ids.length ? ids.map(resourceName).join('、') : '未设置' }
    })} />
      {Array.isArray(value.skill_loading) && value.skill_loading.filter(isObject).map((loading, index) => <Card key={index} size="small" title={`${resourceName(loading.skill_id ?? loading.version_id)} · 加载设置`}><Descriptions size="small" column={1} items={[
        { key: 'mode', label: '加载方式', children: loading.loading_mode === 'mandatory' ? '始终加载' : loading.loading_mode === 'on_demand' ? '按需加载' : '沿用技能设置' },
        { key: 'selected', label: '触发按需技能', children: loading.selected ? '是' : '否' },
        { key: 'files', label: '参考资料', children: Array.isArray(loading.selected_files) ? loading.selected_files.join('、') || '不加载参考资料' : '沿用技能设置' },
        { key: 'priority', label: '优先级', children: loading.priority == null ? '沿用技能设置' : String(loading.priority) },
      ]} /></Card>)}
    </Space>
  }
  if (field === 'limits' && isObject(value)) return <Descriptions size="small" column={1} items={[
    ...Object.entries({ deadline_seconds: ['运行限时', '秒'], token_limit: ['Token 上限', '个'], max_model_rounds: ['模型轮数上限', '次'], max_tool_calls: ['工具调用上限', '次'], max_iterations: ['循环上限', '次'], loop_timeout_seconds: ['循环限时', '秒'], output_repair_attempts: ['输出修复上限', '次'] }).map(([key, [label, unit]]) => ({ key, label, children: value[key] == null ? '未设置' : `${String(value[key])} ${unit}` })),
    { key: 'cost', label: '费用上限', children: isObject(value.cost_limit) ? formatAmount(String(value.cost_limit.amount), String(value.cost_limit.currency)) : '未设置' },
  ]} />
  if (field === 'context' && isObject(value)) {
    const memory = isObject(value.memory_policy) ? value.memory_policy : undefined
    return <Descriptions size="small" column={1} items={[
      { key: 'conversation', label: '会话', children: value.conversation_enabled ? '启用' : '关闭' },
      { key: 'summary', label: '会话摘要', children: value.summary_policy === 'recent' ? '最近摘要' : '不读取' },
      { key: 'limit', label: '上下文上限', children: value.context_limit == null ? '未设置' : `${String(value.context_limit)} Token` },
      { key: 'memory', label: '长期记忆', children: memory ? <Descriptions size="small" column={1} items={[
        { key: 'read', label: '读取', children: memory.read_enabled ? '启用' : '关闭' },
        { key: 'suggest', label: '记忆建议', children: memory.suggest_enabled ? '启用' : '关闭' },
        { key: 'types', label: '允许类型', children: Array.isArray(memory.allowed_types) ? memory.allowed_types.map(type => ({ PREFERENCE: '偏好', FACT: '事实', CONSTRAINT: '约束', SUMMARY: '摘要' } as Record<string, string>)[String(type)] ?? '类型名称不可用').join('、') || '未设置' : '未设置' },
        { key: 'write', label: '写入', children: ({ DISABLED: '禁止写入', CANDIDATE: '生成候选', EXPLICIT: '明确确认' } as Record<string, string>)[String(memory.write_mode)] ?? '未设置' },
        { key: 'count', label: '检索上限', children: `${String(memory.retrieval_limit)} 条` },
        { key: 'ttl', label: '有效期', children: `${String(memory.ttl_seconds)} 秒` },
        { key: 'max', label: '条目上限', children: `${String(memory.max_items)} 条` },
        { key: 'failure', label: '读取失败处理', children: memory.failure_mode === 'FAIL' ? '终止运行' : '省略记忆' },
      ]} /> : '未启用' },
    ]} />
  }
  if (field === 'steps' && Array.isArray(value)) return <Collapse size="small" items={(value as Definition['steps']).map(step => ({ key: step.key, label: step.name, children: <Space orientation="vertical" style={{ width: '100%' }} size={16}>
    <Descriptions size="small" column={1} items={[
      { key: 'type', label: '步骤类型', children: ({ model: '模型调用', tool: '工具调用', compute: '计算与确认' })[step.kind] },
      ...(step.kind === 'compute' ? [{ key: 'operator', label: '操作', children: ({ object: '对象组装', input: '等待补充', approval: '等待审批' } as Record<string, string>)[step.operator ?? ''] ?? '操作名称不可用' }] : []),
      { key: 'timeout', label: '超时', children: `${step.timeout_seconds} 秒` },
      { key: 'retry', label: '失败处理', children: step.failure_policy === 'retry' ? `最多重试 ${step.max_retries} 次` : step.failure_policy === 'partial' ? '返回部分结果' : '终止' },
      { key: 'resource', label: '依赖资源', children: step.dependency ? resourceName(step.dependency) : '沿用智能体配置' },
    ]} />
    <Table rowKey="name" pagination={false} size="small" dataSource={Object.entries(step.inputs ?? {}).map(([name, source]) => ({ name, source }))} columns={[
      { title: '输入字段', render: (_, row) => fieldLabel(step.input_schema, row.name) },
      { title: '来源', render: (_, row) => row.source.source === 'constant' ? `固定值：${JSON.stringify(row.source.value)}` : `${row.source.source === 'input' ? '运行输入' : stepName(row.source.step)} · ${fieldLabel(row.source.source === 'input' ? definition?.input_schema : definition?.steps.find(item => item.key === row.source.step)?.output_schema, row.source.path ?? '')}` },
    ]} />
    <Typography.Text strong>输入结构</Typography.Text><SchemaView value={step.input_schema} label={`${step.name}输入结构`} />
    <Typography.Text strong>输出结构</Typography.Text><SchemaView value={step.output_schema} label={`${step.name}输出结构`} />
  </Space> }))} />
  if (field === 'edges' && Array.isArray(value)) return <Table rowKey={(_, index) => String(index)} size="small" pagination={false} dataSource={value as Definition['edges']} columns={[
    { title: '来源', render: (_, edge) => stepName(edge.source) }, { title: '去向', render: (_, edge) => stepName(edge.target) },
    { title: '条件', render: (_, edge) => edge.otherwise ? '其余情况' : edge.condition ? `${fieldLabel(definition?.steps.find(step => step.key === edge.source)?.output_schema, edge.condition.path)} ${({ eq: '等于', ne: '不等于', exists: '存在' })[edge.condition.operator]} ${edge.condition.operator === 'exists' ? '' : JSON.stringify(edge.condition.value)}` : '直接进入' },
  ]} />
  return <Typography.Text type="secondary">配置内容暂不可展示</Typography.Text>
}
