import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Popconfirm, Space, Tag, Typography } from 'antd'
import type { Definition } from './types'
import { edgeLabel, outgoingEdges } from './flow-fields'

export function FlowBranches({ definition, source, onEdit, onAdd, onDelete, onMove, disabled }: {
  definition: Definition; source: string; onEdit?: (index: number) => void; onAdd?: () => void; onDelete?: (index: number) => void; onMove?: (index: number, offset: -1 | 1) => void; disabled?: boolean
}) {
  const edges = outgoingEdges(definition, source)
  const conditions = edges.filter(item => !item.edge.otherwise)
  return <Space orientation="vertical" size="middle" className="agent-flow-full-width">
    {edges.length > 1 && <Typography.Text type="secondary">按顺序判断，首个满足的条件生效；其余情况走兜底。</Typography.Text>}
    {!edges.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未配置后续流转" />}
    {edges.map(({ edge, index }, order) => <Card size="small" key={index} className="agent-flow-branch"
      title={<Space><Tag>{edge.otherwise ? '兜底' : order + 1}</Tag>{edge.otherwise ? '其余情况' : edge.condition ? '条件分支' : '直接进入'}</Space>}
      extra={onMove && !edge.otherwise && conditions.length > 1 && <Space size={0}>
        <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label={`提高第 ${order + 1} 条分支优先级`} disabled={disabled || !order} onClick={() => onMove(index, -1)} />
        <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label={`降低第 ${order + 1} 条分支优先级`} disabled={disabled || order === conditions.length - 1} onClick={() => onMove(index, 1)} /></Space>}>
      {edge.condition && <Typography.Paragraph>{edgeLabel(definition, edge, false)}</Typography.Paragraph>}
      <div>→ {edge.target === 'END' ? '结束' : definition.steps.find(step => step.key === edge.target)?.name ?? '步骤不可用'}</div>
      {onEdit && <Space className="agent-flow-branch-actions"><Button size="small" disabled={disabled} onClick={() => onEdit(index)}>配置流转</Button>
        <Popconfirm title="删除这条流转？" onConfirm={() => onDelete?.(index)} okText="删除" cancelText="取消" disabled={disabled}><Button size="small" danger disabled={disabled}>删除</Button></Popconfirm></Space>}
    </Card>)}
    {onAdd && <Button block disabled={disabled || definition.edges.length >= 256} onClick={onAdd}>新增后续流转</Button>}
  </Space>
}
