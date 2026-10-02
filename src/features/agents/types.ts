import type { Schema } from '../../components/Management'

export type Definition = Schema<'AgentDefinition-Output'>
export type Version = Schema<'AgentVersionView'>
export type Detail = Schema<'AgentDetail'>
export type Options = Schema<'AgentOptions'>
export const workflowNames = { structured: '单步结构化任务', template: '固定场景流程', tool_loop: '受约束工具循环', stateful: '有状态流程' }
export const dependencyNames: Record<string, string> = { prompt: '提示词', model_route: '模型路由', tool: '工具', skill: '技能', model: '模型', model_connection: '模型连接' }
export const pretty = (value: unknown) => JSON.stringify(value, null, 2)
export function parseObject(text: string): Record<string, unknown> {
  const result: unknown = JSON.parse(text)
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('请输入 JSON 对象')
  return result as Record<string, unknown>
}
