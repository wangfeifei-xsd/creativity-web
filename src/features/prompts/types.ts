import type { components } from '../../api/generated/schema'
import { apiClient } from '../../api/client'
import { isFormValidationError } from '../../api/form-errors'

export type Schema<K extends keyof components['schemas']> = components['schemas'][K]
export type Content = Schema<'PromptContent'>
export type Variable = Schema<'PromptVariable'>
export type Version = Schema<'PromptVersionView'>
export type Prompt = Schema<'PromptView'>
export type JsonValue = Schema<'JsonValue'>
export type RouteOption = Schema<'PromptRouteOption'>
export const sourceOptions = [
  { value: 'input', label: '调用输入' }, { value: 'tool', label: '工具结果' },
  { value: 'memory', label: '记忆' }, { value: 'platform', label: '平台上下文' },
]
export const typeOptions = [
  { value: 'string', label: '文本' }, { value: 'integer', label: '整数' },
  { value: 'number', label: '数值' }, { value: 'boolean', label: '布尔值' },
  { value: 'object', label: '对象' }, { value: 'array', label: '数组' },
]
export const sensitivityOptions = [
  { value: 'public', label: '公开' }, { value: 'internal', label: '内部' },
  { value: 'sensitive', label: '敏感' }, { value: 'secret', label: '机密' },
]
export const emptyContent: Content = {
  instruction_blocks: { system: '', output_requirements: '' }, message_templates: [], variables: [], change_note: '',
}
export const contentOf = (version: Version): Content => version.version.content as Content
export function send<T>(path: `/admin/v1/${string}`, body: unknown, method = 'POST') {
  return apiClient.request<T>(path, { method, body: JSON.stringify(body) })
}
export function errorText(error: unknown) {
  if (isFormValidationError(error)) return ''
  return error instanceof Error ? error.message : '操作失败，请重试'
}
export function jsonDisplay(value: unknown): string {
  if (value === null || value === undefined) return '未设置'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
export function diffDisplay(value: JsonValue, field: string) {
  const labels = field.endsWith('.source') ? sourceOptions : field.endsWith('.type') ? typeOptions : field.endsWith('.sensitivity') ? sensitivityOptions : []
  return labels.find(option => option.value === value)?.label ?? jsonDisplay(value)
}
