import { describe, expect, it } from 'vitest'
import { changeType, compareRows, deleteField, parseSchema, replaceNode, saveField, schemaAt, schemaRows } from './schema'

describe('输入输出字段结构编辑', () => {
  const schema = {
    type: 'object', additionalProperties: false, required: ['request'],
    properties: {
      request: { type: 'string', title: '诉求', minLength: 1, pattern: '\\S', 'x-source': 'input' },
      results: { type: 'array', minItems: 1, items: { type: 'object', required: ['score'], properties: { score: { type: 'number', minimum: 0 } }, additionalProperties: false } },
      extra: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    $defs: { custom: { type: 'string' } },
  }
  it('改名与必填同步，嵌套结构、高级规则及原始对象保持完整', () => {
    const updated = saveField(schema, [], 'request', 'question', { ...schema.properties.request, title: '问题' }, true)
    expect(updated.required).toEqual(['question'])
    expect(updated.properties).toEqual({ question: { ...schema.properties.request, title: '问题' }, results: schema.properties.results, extra: schema.properties.extra })
    expect(updated.$defs).toEqual(schema.$defs)
    expect(updated.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['request'])
  })
  it('在数组对象中添加和删除字段只修改对应层级', () => {
    const parent = ['properties', 'results', 'items']
    const added = saveField(schema, parent, undefined, 'reason', { type: 'string' }, true)
    expect(schemaAt(added, parent)).toMatchObject({ required: ['score', 'reason'], additionalProperties: false })
    const removed = deleteField(added, [...parent, 'properties', 'score'])
    expect(schemaAt(removed, parent)).toMatchObject({ required: ['reason'], properties: { reason: { type: 'string' } } })
    expect(removed.required).toEqual(['request'])
    expect(schemaAt(schema, parent)).toMatchObject({ required: ['score'] })
  })
  it('拒绝重复字段，允许属性名包含路径分隔符和原型同名字符', () => {
    expect(() => saveField(schema, [], 'request', 'results', { type: 'string' }, false)).toThrow('不能重复')
    const added = saveField(schema, [], undefined, '__proto__', { type: 'string' }, false)
    const nested = saveField(added, [], undefined, 'a.b/c', { type: 'boolean' }, false)
    expect(schemaAt(nested, ['properties', '__proto__'])).toEqual({ type: 'string' })
    expect(schemaAt(nested, ['properties', 'a.b/c'])).toEqual({ type: 'boolean' })
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype)
  })
  it('数组元素单独编辑，切换类型清理不再适用的子结构', () => {
    const rows = schemaRows(schema), item = rows[1].children![0]
    expect(item.item).toBe(true)
    const updated = replaceNode(schema, item.path, changeType(schema.properties.results.items, 'integer'))
    expect(schemaAt(updated, item.path)).toEqual({ type: 'integer' })
    expect(schemaAt(updated, ['properties', 'results'])).toMatchObject({ minItems: 1 })
    expect(changeType(schema.properties.request, 'string')).toEqual(schema.properties.request)
  })
  it('高级 JSON 原样保留组合约束和布尔结构，非法内容明确报错', () => {
    const advanced = { ...schema, properties: { ...schema.properties, never: false, anything: true } }
    expect(parseSchema(JSON.stringify(advanced))).toEqual(advanced)
    expect(schemaRows(advanced).find(row => row.name === 'never')?.schema).toBe(false)
    expect(() => parseSchema('{')).toThrow('JSON 格式不正确')
    expect(() => parseSchema('[]')).toThrow('必须为 JSON 对象')
  })
  it('差异按字段路径对齐新增、删除及必填变化，不受属性顺序影响', () => {
    const after = { type: 'object', properties: {
      request: { pattern: '\\S', 'x-source': 'input', minLength: 1, title: '诉求', type: 'string' },
      new_field: { type: 'integer' },
    } }
    const rows = compareRows(schemaRows(schema), schemaRows(after))
    expect(rows.find(row => row.after?.name === 'request')).toMatchObject({ changed: true, before: { required: true }, after: { required: false } })
    expect(rows.find(row => row.after?.name === 'new_field')?.before).toBeUndefined()
    expect(rows.find(row => row.before?.name === 'results')?.after).toBeUndefined()
    expect(compareRows(schemaRows(schema), schemaRows({ ...after, required: ['request'] }))[0].changed).toBe(false)
  })
})
