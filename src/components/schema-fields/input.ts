export type InputProperty = { type?: string | string[]; title?: string; enum?: unknown[] }

export function schemaInputHint(field: InputProperty): string | undefined {
  if (field.enum || !Array.isArray(field.type)) return undefined
  const examples: Record<string, string> = { string: '"文本"', number: '0', integer: '0', boolean: 'false', null: 'null', object: '{}', array: '[]' }
  return `使用 JSON 填写，例如 ${[...new Set(field.type.map(type => examples[type]).filter(Boolean))].join(' 或 ')}`
}

export class SchemaInputError extends Error {
  constructor(readonly field: string, label: string) {
    super(`请为“${label}”填写有效的 JSON`)
  }
}

/** 枚举已选值即已填写，包括契约允许的空文本、空数组和空值。 */
export function schemaRequiredValue(field: InputProperty, value: unknown): unknown {
  return value !== undefined && field.enum?.some(item => jsonValueKey(item) === jsonValueKey(value))
    ? JSON.stringify(value) : value
}

/** JSON 转回控件值时不丢弃无法在字段表单中表示的参数。 */
export function schemaFormValues(properties: Record<string, InputProperty>, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('工具参数须为 JSON 对象')
  const values = input as Record<string, unknown>
  if (Object.keys(values).some(key => !Object.hasOwn(properties, key))) throw new Error('存在字段表单未包含的参数，请继续使用 JSON 参数')
  return Object.fromEntries(Object.entries(properties).map(([key, field]) => {
    const value = Object.hasOwn(values, key) ? values[key] : undefined
    if (value === undefined) return [key, undefined]
    if (field.enum) {
      if (!field.enum.some(item => jsonValueKey(item) === jsonValueKey(value))) throw new Error(`“${field.title ?? key}”无法显示为枚举选项，请先修改 JSON 参数`)
      return [key, value]
    }
    if (Array.isArray(field.type) || ['object', 'array', 'null'].includes(field.type ?? '')) return [key, JSON.stringify(value, null, 2)]
    const type = field.type === 'integer' ? 'number' : field.type ?? 'string'
    if (value === null || typeof value !== type) throw new Error(`“${field.title ?? key}”无法显示为字段值，请先修改 JSON 参数`)
    return [key, value]
  }))
}

/** 空控件不提交为业务值；枚举选中的空值、布尔值和复杂值保留契约类型。 */
export function parseSchemaInput(properties: Record<string, InputProperty>, values: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = Object.create(null)
  for (const [key, field] of Object.entries(properties)) {
    const value = Object.hasOwn(values, key) ? values[key] : undefined
    if (value === undefined || (value === null && !field.enum?.includes(null))) continue
    if (field.enum) { input[key] = value; continue }
    const types = Array.isArray(field.type) ? field.type : [field.type]
    if ((Array.isArray(field.type) || types.some(type => type === 'object' || type === 'array' || type === 'null')) && typeof value === 'string') {
      if (!value.trim()) continue
      try { input[key] = JSON.parse(value) as unknown }
      catch { throw new SchemaInputError(key, field.title ?? '业务参数') }
    } else input[key] = value
  }
  return { ...input }
}
import { jsonValueKey } from './schema'
