import { describe, expect, it } from 'vitest'
import { parseSchemaInput, schemaFormValues, SchemaInputError } from './input'

describe('运行输入表单', () => {
  it('清空选填结构和数值后不发送空控件值', () => {
    expect(parseSchemaInput({ payload: { type: 'object' }, items: { type: 'array' }, count: { type: 'number' } },
      { payload: '', items: '  ', count: null })).toEqual({})
  })
  it('保留枚举的原始类型并解析手填结构', () => {
    expect(parseSchemaInput({ quantity: { type: 'integer', enum: [1, 3] }, enabled: { type: 'boolean' },
      preset: { type: 'object', enum: [{ level: 1 }] }, note: { enum: [null, '备注'] }, text: { enum: ['1', ''] }, payload: { type: ['object', 'null'] } },
    { quantity: 1, enabled: false, preset: { level: 1 }, note: null, text: '1', payload: '{"label":"测试"}' })).toEqual({
      quantity: 1, enabled: false, preset: { level: 1 }, note: null, text: '1', payload: { label: '测试' },
    })
  })
  it('无效 JSON 提供中文字段提示', () => {
    try { parseSchemaInput({ payload: { type: 'object', title: '结构参数' } }, { payload: '{' }) }
    catch (error) {
      expect(error).toBeInstanceOf(SchemaInputError)
      expect(error).toMatchObject({ field: 'payload', message: '请为“结构参数”填写有效的 JSON' })
      return
    }
    throw new Error('无效输入必须被拒绝')
  })
  it('不把表单缓存的非契约字段发送给运行接口', () => {
    expect(parseSchemaInput({ request: { type: 'string' } }, { request: '测试', stale: '旧字段' })).toEqual({ request: '测试' })
  })
  it('可空和联合类型按 JSON 保留零、假值、空值与文本', () => {
    const properties = { count: { type: ['number', 'null'] }, flag: { type: ['boolean', 'null'] },
      note: { type: ['string', 'null'] }, mixed: { type: ['string', 'number'] } }
    expect(parseSchemaInput(properties, { count: '0', flag: 'false', note: 'null', mixed: '"0"' }))
      .toEqual({ count: 0, flag: false, note: null, mixed: '0' })
    expect(parseSchemaInput(properties, { count: 'null', flag: 'null', note: '"中文"', mixed: '0' }))
      .toEqual({ count: null, flag: null, note: '中文', mixed: 0 })
    expect(parseSchemaInput(properties, { count: '', flag: '  ' })).toEqual({})
  })
  it('JSON 与表单往返保留参数类型并清空已删除的选填字段', () => {
    const properties = { count: { type: ['number', 'null'] }, flag: { type: 'boolean' },
      note: { type: 'string', enum: ['', '备注'] }, items: { type: 'array' },
      option: { type: 'object' }, stale: { type: 'string' } }
    const input = { count: null, flag: false, note: '', items: [], option: { number: 0 } }
    const fields = schemaFormValues(properties, input)
    expect(fields.stale).toBeUndefined()
    expect(parseSchemaInput(properties, fields)).toEqual(input)
  })
  it('JSON 无法由字段表单表示时拒绝切换，避免参数静默丢失或改类型', () => {
    const properties = { text: { type: 'string' }, choice: { enum: [0, 1] } }
    expect(() => schemaFormValues(properties, [])).toThrow('JSON 对象')
    expect(() => schemaFormValues(properties, { unknown: 1 })).toThrow('未包含的参数')
    expect(() => schemaFormValues(properties, { text: null })).toThrow('无法显示为字段值')
    expect(() => schemaFormValues(properties, { choice: 2 })).toThrow('无法显示为枚举选项')
  })
  it('对象枚举匹配不受 JSON 属性顺序影响', () => {
    const properties = { choice: { type: 'object', enum: [{ label: '零', value: 0 }] } }
    const input = { choice: { value: 0, label: '零' } }
    expect(parseSchemaInput(properties, schemaFormValues(properties, input))).toEqual(input)
  })
  it('原型同名业务字段正常提交，未声明同名字段不能在模式切换时丢弃', () => {
    const properties = JSON.parse('{"__proto__":{"type":"string"},"constructor":{"type":"number"}}')
    const output = parseSchemaInput(properties, JSON.parse('{"__proto__":"业务数据","constructor":0}'))
    expect(JSON.stringify(output)).toBe('{"__proto__":"业务数据","constructor":0}')
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype)
    expect(parseSchemaInput(properties, {})).toEqual({})
    expect(() => schemaFormValues({}, { toString: '业务数据' })).toThrow('未包含的参数')
  })
})
