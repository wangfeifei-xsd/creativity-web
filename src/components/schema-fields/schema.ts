export type SchemaObject = Record<string, unknown>
export type SchemaNode = SchemaObject | boolean
export type FieldRow = {
  key: string; name: string; path: string[]; schema: SchemaNode; required: boolean; item?: boolean; children?: FieldRow[]
}
export type ComparisonRow = { key: string; name: string; before?: FieldRow; after?: FieldRow; changed: boolean; children?: ComparisonRow[] }

export const typeNames: Record<string, string> = {
  string: '文本', number: '数值', integer: '整数', boolean: '布尔值', object: '对象', array: '数组', null: '空值',
}
const fieldNames: Record<string, string> = {
  business_status: '业务状态', schema_version: '结果格式标识', data: '业务数据', warnings: '提示信息', evidence_refs: '证据引用',
}
export function isObject(value: unknown): value is SchemaObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function parseSchema(text: string): SchemaObject {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('JSON 格式不正确，请检查括号、引号和逗号') }
  if (!isObject(value)) throw new Error('输入输出结构必须为 JSON 对象')
  return value
}
export const schemaRules = [{ validator: (_: unknown, value: string) => {
  try { parseSchema(value); return Promise.resolve() } catch (error) { return Promise.reject(error) }
} }]
export function fieldTitle(row: FieldRow): string {
  return row.item ? '数组元素' : (isObject(row.schema) && typeof row.schema.title === 'string' && row.schema.title) || fieldNames[row.name] || '未命名字段'
}
export function schemaType(schema: SchemaNode): string {
  return isObject(schema) && typeof schema.type === 'string' && schema.type in typeNames ? schema.type : 'advanced'
}
export function typeLabel(schema: SchemaNode): string {
  if (typeof schema === 'boolean') return schema ? '任意类型' : '不允许'
  if (Array.isArray(schema.type)) return schema.type.map(type => typeNames[String(type)] ?? '未知类型').join(' / ')
  return typeNames[schemaType(schema)] ?? (schema.$ref ? '引用结构' : '自定义结构')
}
export function schemaRows(schema: SchemaNode, path: string[] = []): FieldRow[] {
  if (!isObject(schema)) return []
  const rows: FieldRow[] = isObject(schema.properties) ? Object.entries(schema.properties).map(([name, node]) => {
    const nextPath = [...path, 'properties', name]
    const child = (isObject(node) || typeof node === 'boolean') ? node : {}
    const children = schemaRows(child, nextPath)
    return { key: JSON.stringify(nextPath), name, path: nextPath, schema: child,
      required: Array.isArray(schema.required) && schema.required.includes(name), ...(children.length ? { children } : {}) }
  }) : []
  if (isObject(schema.items) || typeof schema.items === 'boolean') {
    const nextPath = [...path, 'items'], children = schemaRows(schema.items, nextPath)
    rows.push({ key: JSON.stringify(nextPath), name: 'items', path: nextPath, schema: schema.items, item: true,
      required: false, ...(children.length ? { children } : {}) })
  }
  return rows
}
export function jsonValueKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonValueKey).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jsonValueKey(value[key])}`).join(',')}}`
  return JSON.stringify(value) ?? ''
}
export function compareRows(before: FieldRow[], after: FieldRow[]): ComparisonRow[] {
  const previous = new Map(before.map(row => [row.key, row])), current = new Map(after.map(row => [row.key, row]))
  return [...new Set([...current.keys(), ...previous.keys()])].map(key => {
    const left = previous.get(key), right = current.get(key), field = right ?? left!
    const children = compareRows(left?.children ?? [], right?.children ?? [])
    return { key, name: fieldTitle(field), before: left, after: right,
      changed: !left || !right || left.required !== right.required || jsonValueKey(left.schema) !== jsonValueKey(right.schema),
      ...(children.length ? { children } : {}) }
  })
}
export function schemaAt(root: SchemaObject, path: string[]): SchemaNode {
  let value: unknown = root
  for (const key of path) value = isObject(value) ? value[key] : undefined
  if (!isObject(value) && typeof value !== 'boolean') throw new Error('字段已变更，请重新打开编辑')
  return value
}

// 仅替换本次编辑的节点，保留其余字段、扩展关键字及高级校验规则。
export function replaceNode(root: SchemaObject, path: string[], node: SchemaNode): SchemaObject {
  if (!path.length) {
    if (!isObject(node)) throw new Error('输入输出结构必须为对象')
    return node
  }
  const [key, ...rest] = path
  const next = isObject(root[key]) ? root[key] : {}
  return { ...root, [key]: rest.length ? replaceNode(next, rest, node) : node }
}
export function saveField(root: SchemaObject, parentPath: string[], oldName: string | undefined, name: string, node: SchemaNode, required: boolean): SchemaObject {
  if (!name.trim()) throw new Error('请填写字段标识')
  const parent = schemaAt(root, parentPath)
  if (!isObject(parent)) throw new Error('此结构不能添加字段，请使用高级 JSON 编辑')
  const properties = isObject(parent.properties) ? parent.properties : {}
  if (name !== oldName && Object.hasOwn(properties, name)) throw new Error('同一对象内的字段标识不能重复')
  const entries = Object.entries(properties).map(([key, value]) => key === oldName ? [name, node] : [key, value])
  if (oldName === undefined) entries.push([name, node])
  const names = (Array.isArray(parent.required) ? parent.required : []).filter(key => key !== oldName && key !== name)
  if (required) names.push(name)
  return replaceNode(root, parentPath, { ...parent, properties: Object.fromEntries(entries),
    ...(names.length || Object.hasOwn(parent, 'required') ? { required: names } : {}) })
}
export function deleteField(root: SchemaObject, path: string[]): SchemaObject {
  const parentPath = path.slice(0, -2), name = path.at(-1)!
  const parent = schemaAt(root, parentPath)
  if (!isObject(parent) || !isObject(parent.properties)) throw new Error('字段不存在')
  const properties = Object.fromEntries(Object.entries(parent.properties).filter(([key]) => key !== name))
  return replaceNode(root, parentPath, { ...parent, properties,
    ...(Array.isArray(parent.required) ? { required: parent.required.filter(key => key !== name) } : {}) })
}
export function changeType(schema: SchemaObject, type: string): SchemaObject {
  if (type === 'advanced' || type === schemaType(schema)) return { ...schema }
  // 明确切换类型时重建该节点，避免遗留原类型的约束和子结构。
  return { ...(typeof schema.title === 'string' ? { title: schema.title } : {}),
    ...(typeof schema.description === 'string' ? { description: schema.description } : {}), type,
    ...(type === 'object' ? { properties: {}, additionalProperties: false } : {}),
    ...(type === 'array' ? { items: { type: 'string' } } : {}) }
}
export function constraintLabel(schema: SchemaNode): string {
  if (!isObject(schema)) return '—'
  const items: string[] = []
  if (Array.isArray(schema.enum)) items.push(`可选值：${schema.enum.map(value => JSON.stringify(value)).join('、')}`)
  if (Object.hasOwn(schema, 'const')) items.push(`固定值：${JSON.stringify(schema.const)}`)
  for (const [key, label] of Object.entries({ minLength: '最少字符', maxLength: '最多字符', minimum: '最小值', maximum: '最大值', minItems: '最少元素', maxItems: '最多元素', pattern: '匹配规则', format: '格式' })) {
    if (Object.hasOwn(schema, key)) items.push(`${label}：${String(schema[key])}`)
  }
  if (schema.additionalProperties === false) items.push('不允许额外字段')
  const basic = new Set(['type', 'title', 'description', 'properties', 'required', 'items', 'enum', 'const', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern', 'format', 'additionalProperties'])
  if (Object.keys(schema).some(key => !basic.has(key)) || isObject(schema.additionalProperties) || Array.isArray(schema.items)) items.push('含高级规则')
  return items.join('；') || '—'
}
