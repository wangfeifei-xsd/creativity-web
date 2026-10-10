import dagre from '@dagrejs/dagre'
import type { Definition } from './types'
import { edgeLabel } from './flow-fields'

export function layoutFlow(definition: Definition) {
  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({ rankdir: 'TB', align: 'UR', nodesep: 32, ranksep: 36, edgesep: 16, marginx: 20, marginy: 20 })
  graph.setDefaultEdgeLabel(() => ({}))
  const keys = new Set(definition.steps.map(step => step.key))
  // 起始步骤先加入布局，原 steps 数组及边优先级保持不变。
  const steps = [...definition.steps].sort((a, b) => Number(b.key === definition.start_step) - Number(a.key === definition.start_step))
  steps.forEach(step => graph.setNode(step.key, { width: 224, height: 84 }))
  graph.setNode('END', { width: 96, height: 40 })
  definition.edges.forEach((edge, index) => {
    if (!keys.has(edge.source) || (!keys.has(edge.target) && edge.target !== 'END')) return
    const label = edge.condition || edge.otherwise ? edgeLabel(definition, edge) : ''
    graph.setEdge(edge.source, edge.target, { width: label ? 156 : 0, height: label ? 40 : 0, labelpos: 'c', label }, String(index))
  })
  dagre.layout(graph)
  return {
    width: graph.graph().width ?? 320, height: graph.graph().height ?? 180,
    nodes: graph.nodes().map(key => ({ key, ...graph.node(key) })),
    edges: graph.edges().map(edge => ({ index: Number(edge.name), ...(graph.edge(edge) as { points: { x: number; y: number }[]; x: number; y: number; label: string }) })),
  }
}
