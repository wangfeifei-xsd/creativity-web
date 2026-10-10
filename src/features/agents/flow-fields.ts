import { fieldTitle, isObject, type SchemaObject } from '../../components/schema-fields/schema'
import type { Definition } from './types'

export type Step = Definition['steps'][number]
export type Edge = Definition['edges'][number]
export type FlowIssue = { path?: string | null; message: string }
export type StepTab = 'base' | 'inputs' | 'output' | 'branches'
export const stepKinds = { model: '模型调用', tool: '工具调用', compute: '固定计算' }
export const businessStatuses: Record<string, string> = { COMPLETED: '已完成', NEEDS_INPUT: '需要补充信息', NO_MATCH: '没有匹配结果', INSUFFICIENT_DATA: '数据不足', PARTIAL: '部分完成' }

export function fieldSchema(schema: SchemaObject, path: string): SchemaObject {
  let current = schema
  for (const key of path ? path.split('.') : []) {
    const child = isObject(current.properties) ? current.properties[key] : undefined
    if (!isObject(child)) return {}
    current = child
  }
  return current
}
export function fieldName(schema: SchemaObject, path: string): string {
  if (!path) return '完整数据'
  return fieldTitle({ key: path, name: path.split('.').at(-1)!, schema: fieldSchema(schema, path), required: false, path: [] })
}
export function fieldChoices(schema: SchemaObject, rootLabel?: string, topLevel = false) {
  const choices: { value: string; label: string; schema: SchemaObject }[] = rootLabel ? [{ value: '', label: rootLabel, schema }] : []
  function visit(current: SchemaObject, prefix: string, titles: string[], depth: number) {
    if (!isObject(current.properties) || depth > 24) return
    for (const [key, value] of Object.entries(current.properties)) {
      if (!isObject(value)) continue
      const path = prefix ? `${prefix}.${key}` : key
      const names = [...titles, fieldName(current, key)]
      choices.push({ value: path, label: `${names.join(' / ')} · ${path}`, schema: value })
      // 执行器只支持对象路径；数组可整体引用，不生成无法执行的元素路径。
      if (!topLevel) visit(value, path, names, depth + 1)
    }
  }
  visit(schema, '', [], 0)
  return choices
}
export function withCurrentChoice(choices: { value: string; label: string }[], value?: string | null) {
  return value != null && !choices.some(item => item.value === value)
    ? [...choices, { value, label: `字段不可用 · ${value}` }] : choices
}
export function displayValue(value: unknown, path = ''): string {
  if (path === 'business_status' && typeof value === 'string') return businessStatuses[value] ?? '状态名称不可用'
  if (value === true) return '是'
  if (value === false) return '否'
  if (value === null) return '空值'
  if (value === undefined) return '未设置'
  return typeof value === 'string' ? value : JSON.stringify(value)
}
export function edgeLabel(definition: Definition, edge: Edge, includePriority = true): string {
  if (edge.otherwise) return '其余情况'
  if (!edge.condition) return '直接进入'
  const schema = definition.steps.find(step => step.key === edge.source)?.output_schema ?? {}
  const { path, operator, value } = edge.condition
  const priority = definition.edges.filter(item => item.source === edge.source && !item.otherwise).indexOf(edge) + 1
  const multiple = definition.edges.filter(item => item.source === edge.source && !item.otherwise).length > 1
  return `${includePriority && multiple ? `${priority}. ` : ''}${fieldName(schema, path)} ${({ eq: '等于', ne: '不等于', exists: '存在' })[operator]}${operator === 'exists' ? '' : ` ${displayValue(value, path)}`}`
}
export function outgoingEdges(definition: Definition, source: string) {
  // 条件保留执行优先级，兜底始终在所有条件之后展示；不改写原始配置。
  return definition.edges.map((edge, index) => ({ edge, index })).filter(item => item.edge.source === source)
    .sort((a, b) => Number(!!a.edge.otherwise) - Number(!!b.edge.otherwise))
}
export function moveBranch(definition: Definition, index: number, offset: -1 | 1): Definition {
  const current = definition.edges[index]
  const siblings = outgoingEdges(definition, current.source).filter(item => !item.edge.otherwise)
  const position = siblings.findIndex(item => item.index === index)
  const target = siblings[position + offset]
  if (position < 0 || !target) return definition
  const edges = [...definition.edges]
  ;[edges[index], edges[target.index]] = [edges[target.index], edges[index]]
  return { ...definition, edges }
}
export function locateFlowIssue(definition: Definition, path = ''): { node?: string; tab: StepTab; field?: string } {
  const clean = path.replace(/^(body\.)?(definition\.)?/, '')
  const kind = clean.startsWith('edges.') ? 'edges' : 'steps'
  const rest = clean.slice(kind.length + 1)
  const byName = [...definition.steps].sort((a, b) => b.key.length - a.key.length).find(step => rest === step.key || rest.startsWith(`${step.key}.`))
  const index = Number(rest.split('.')[0])
  const node = byName?.key ?? (Number.isInteger(index) ? kind === 'edges' ? definition.edges[index]?.source : definition.steps[index]?.key : undefined)
  const field = byName ? rest.slice(byName.key.length + 1).split('.')[0] : rest.split('.')[1]
  return { node, field, tab: kind === 'edges' ? 'branches' : field === 'inputs' || field === 'input_schema' ? 'inputs' : field === 'output_schema' ? 'output' : 'base' }
}
