import { type Definition, parseObject } from './types'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/** 先校验画布所需结构；完整业务契约继续由保存及发布接口复核。 */
export function parseFlowJson(source: string): Pick<Definition, 'start_step' | 'steps' | 'edges'> {
  const value = parseObject(source)
  if (Object.keys(value).some(key => !['start_step', 'steps', 'edges'].includes(key))) throw new Error('流程 JSON 仅包含 start_step、steps 和 edges')
  if (!text(value.start_step) || !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 64 || !Array.isArray(value.edges) || value.edges.length > 256) throw new Error('请填写起始步骤、1 至 64 个步骤及最多 256 条连线')
  const keys = new Set<string>()
  for (const step of value.steps) {
    if (!object(step) || !text(step.key) || !text(step.name) || !['model', 'tool', 'compute'].includes(String(step.kind)) || !object(step.input_schema) || !object(step.output_schema) || !object(step.inputs)) throw new Error('每个步骤须包含标识、名称、类型、输入输出结构和输入映射')
    if (step.key === 'END') throw new Error('步骤标识不能使用保留的结束标识')
    if (keys.has(step.key)) throw new Error('步骤标识不能重复')
    keys.add(step.key)
    if (Object.values(step.inputs).some(mapping => !object(mapping) || !['input', 'step', 'constant'].includes(String(mapping.source)))) throw new Error('输入映射须声明运行输入、步骤输出或固定值来源')
  }
  if (!keys.has(value.start_step)) throw new Error('起始步骤不存在')
  for (const edge of value.edges) {
    if (!object(edge) || !text(edge.source) || !keys.has(edge.source) || !text(edge.target) || (edge.target !== 'END' && !keys.has(edge.target))) throw new Error('连线必须引用存在的步骤或 END')
    if (edge.condition != null && (!object(edge.condition) || !text(edge.condition.path) || !['eq', 'ne', 'exists'].includes(String(edge.condition.operator)))) throw new Error('连线条件须包含字段路径和有效比较方式')
  }
  return value as Pick<Definition, 'start_step' | 'steps' | 'edges'>
}
