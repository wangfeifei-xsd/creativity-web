import { describe, expect, it } from 'vitest'
import { edgeLabel, fieldChoices, locateFlowIssue, moveBranch } from './flow-fields'
import { layoutFlow } from './flow-layout'
import type { Definition } from './types'

function flow(): Definition {
  return {
    instructions: '', workflow_type: 'stateful', entrypoint: 'stateful.v1', input_schema: {}, output_schema: {},
    bindings: { skill_ids: [], tool_ids: [], skill_loading: [] },
    context: { conversation_enabled: false, context_limit: 8000, summary_policy: 'none' },
    limits: { deadline_seconds: 60, token_limit: 16000, max_model_rounds: 1, max_tool_calls: 10, max_iterations: 10, loop_timeout_seconds: 60, output_repair_attempts: 0 },
    start_step: 'find', steps: ['finish', 'analyze', 'find'].map(key => ({ key, name: key, kind: 'compute', input_schema: {},
      output_schema: { type: 'object', properties: { ready: { type: 'boolean', title: '需要分析' } } }, inputs: {}, timeout_seconds: 30, failure_policy: 'fail', max_retries: 0 })),
    edges: [{ otherwise: false, source: 'find', target: 'analyze', condition: { path: 'ready', operator: 'eq', value: true } },
      { otherwise: false, source: 'analyze', target: 'finish' }, { otherwise: false, source: 'find', target: 'finish', condition: { path: 'ready', operator: 'ne', value: false } },
      { source: 'find', target: 'END', otherwise: true }, { otherwise: false, source: 'finish', target: 'END' }],
  }
}
describe('流程展示和配置语义', () => {
  it('按连线安排先后，布局不修改步骤数组或条件优先级', () => {
    const definition = flow(), original = structuredClone(definition)
    const graph = layoutFlow(definition)
    const node = (key: string) => graph.nodes.find(item => item.key === key)!
    expect(node('find').y).toBeLessThan(node('analyze').y)
    expect(node('analyze').y).toBeLessThan(node('finish').y)
    expect(graph.edges).toHaveLength(5)
    expect(definition).toEqual(original)
    expect(edgeLabel(definition, definition.edges[0])).toBe('1. 需要分析 等于 是')
  })
  it('同源条件调序只交换相关边，其他节点和兜底保持不变', () => {
    const definition = flow()
    const changed = moveBranch(definition, 2, -1)
    expect(changed.edges.map(edge => edge.target)).toEqual(['finish', 'finish', 'analyze', 'END', 'END'])
    expect(changed.edges[1]).toEqual(definition.edges[1])
    expect(changed.edges[3]).toEqual(definition.edges[3])
    expect(moveBranch(definition, 3, -1)).toBe(definition)
  })
  it('循环、自环、孤立节点及同源多边都能布局，坐标有效', () => {
    const definition = flow()
    definition.edges.push({ otherwise: false, source: 'analyze', target: 'find' }, { otherwise: false, source: 'finish', target: 'finish' })
    definition.steps.push({ ...definition.steps[0], key: 'isolated' })
    const graph = layoutFlow(definition)
    expect(graph.nodes).toHaveLength(5)
    expect(graph.edges).toHaveLength(7)
    for (const node of graph.nodes) expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true)
    for (const edge of graph.edges) expect(edge.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })
  it('字段选择包含对象本身和嵌套属性，不生成数组元素路径', () => {
    const schema = { type: 'object', properties: { profile: { title: '档案', type: 'object', properties: { name: { title: '姓名', type: 'string' } } }, records: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } } } }
    expect(fieldChoices(schema, '完整输入').map(item => item.value)).toEqual(['', 'profile', 'profile.name', 'records'])
    expect(fieldChoices(schema, undefined, true).map(item => item.value)).toEqual(['profile', 'records'])
  })
  it('定位数字下标和包含点的步骤标识，保留字段所属分区', () => {
    const definition = flow()
    definition.steps[0].key = 'finish.order'
    expect(locateFlowIssue(definition, 'definition.steps.0.timeout_seconds')).toEqual({ node: 'finish.order', field: 'timeout_seconds', tab: 'base' })
    expect(locateFlowIssue(definition, 'steps.finish.order.output_schema')).toEqual({ node: 'finish.order', field: 'output_schema', tab: 'output' })
    expect(locateFlowIssue(definition, 'edges.find').node).toBe('find')
  })
})
