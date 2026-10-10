import { describe, expect, it } from 'vitest'
import { parseFlowJson } from './flow-json'

const step = { key: 'finish', name: '结束', kind: 'compute', operator: 'object', inputs: {}, input_schema: { type: 'object' }, output_schema: { type: 'object' }, max_retries: 0, failure_policy: 'fail' }
const flow = { start_step: 'finish', steps: [step], edges: [{ source: 'finish', target: 'END' }] }

describe('流程 JSON 编辑', () => {
  it('保留完整输入映射、结构和条件', () => {
    const value = { ...flow, steps: [{ ...step, inputs: { note: { source: 'constant', value: { text: '用户资料' } } } }], edges: [{ source: 'finish', target: 'END', condition: { path: 'ready', operator: 'eq', value: true } }] }
    expect(parseFlowJson(JSON.stringify(value))).toEqual(value)
  })
  it.each([null, [], { ...flow, steps: [null] }, { ...flow, steps: [{ ...step, inputs: { x: null } }] }, { ...flow, edges: [null] }])('拒绝会破坏画布的结构 %j', value => {
    expect(() => parseFlowJson(JSON.stringify(value))).toThrow()
  })
  it.each([{ ...flow, start_step: 'missing' }, { ...flow, steps: [{ ...step, key: 'END' }] }, { ...flow, steps: [step, step] }, { ...flow, edges: [{ source: 'finish', target: 'missing' }] }, { ...flow, bindings: {} }])('拒绝错误引用或修改流程外配置 %j', value => {
    expect(() => parseFlowJson(JSON.stringify(value))).toThrow()
  })
})
