import { Collapse, Descriptions, Empty, Space, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { SchemaView } from '../../components/schema-fields/SchemaFields'
import { FlowGraph } from './FlowGraph'
import { FlowBranches } from './FlowBranches'
import { displayValue, fieldName, stepKinds } from './flow-fields'
import { type Definition, type Options } from './types'
import './agents.css'

export function Flow({ definition, options, compact = false }: { definition: Definition; options?: Options; compact?: boolean }) {
  const [selected, setSelected] = useState(definition.start_step)
  const [tab, setTab] = useState('branches')
  const step = definition.steps.find(item => item.key === selected) ?? definition.steps.find(item => item.key === definition.start_step)
  const label = (key?: string | null) => key === 'END' ? '结束' : definition.steps.find(item => item.key === key)?.name ?? '步骤不可用'
  const dependency = step?.dependency ?? (step?.kind === 'model' ? definition.bindings.model_route_id : null)
  const inspector = <aside className="agent-flow-inspector" aria-label="步骤详情">{step ? <>
      <Typography.Title level={5}>{step.name}</Typography.Title>
      <Typography.Text type="secondary">{stepKinds[step.kind]} · {step.timeout_seconds} 秒</Typography.Text>
      <Tabs size="small" activeKey={tab} onChange={setTab} items={[
        { key: 'branches', label: '后续流转', children: <FlowBranches definition={definition} source={step.key} /> },
        { key: 'base', label: '基础配置', children: <Descriptions column={1} size="small" items={[
          { key: 'kind', label: '类型', children: stepKinds[step.kind] },
          { key: 'timeout', label: '超时', children: `${step.timeout_seconds} 秒` },
          { key: 'failure', label: '失败处理', children: ({ fail: '终止并报错', partial: '返回部分结果', retry: `最多重试 ${step.max_retries} 次` })[step.failure_policy] },
          ...(step.kind !== 'compute' ? [{ key: 'dependency', label: step.kind === 'tool' ? '工具' : '模型路由', children: dependency ? options?.dependencies.find(item => item.version_id === dependency)?.name ?? '资源名称不可用' : '未配置' }] :
            [{ key: 'operator', label: '操作', children: ({ object: '对象组装', input: '等待补充', approval: '等待审批' })[step.operator ?? 'object'] }]),
        ]} /> },
        { key: 'inputs', label: '输入映射', children: <Space orientation="vertical" className="agent-flow-full-width" size="middle">
          {Object.entries(step.inputs ?? {}).map(([key, source]) => <div className="agent-flow-mapping-summary" key={key}><Typography.Text strong>{fieldName(step.input_schema, key)}</Typography.Text>
            <div><Typography.Text type="secondary">← {source.source === 'constant' ? `固定值：${displayValue(source.value, key)}` : `${source.source === 'input' ? '运行输入' : label(source.step)} / ${fieldName(source.source === 'input' ? definition.input_schema : definition.steps.find(item => item.key === source.step)?.output_schema ?? {}, source.path ?? '')}`}</Typography.Text></div>
          </div>)}
          <SchemaView value={step.input_schema} label="步骤输入结构" compact />
        </Space> },
        { key: 'output', label: '输出结构', children: <SchemaView value={step.output_schema} label="步骤输出结构" compact /> },
      ]} />
    </> : <Empty description="请选择步骤" />}</aside>
  return <div className={`agent-flow-workspace${compact ? ' is-compact' : ''}`}>
    <FlowGraph definition={definition} selected={step?.key} onSelect={setSelected} onEdge={index => { setSelected(definition.edges[index].source); setTab('branches') }} />
    {compact ? <Collapse size="small" items={[{ key: 'step', label: `步骤配置 · ${step?.name ?? '请选择步骤'}`, children: inspector }]} /> : inspector}
  </div>
}
