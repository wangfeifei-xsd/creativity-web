import { MinusOutlined, PlusOutlined, AimOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Tooltip, Typography, theme } from 'antd'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Definition } from './types'
import { edgeLabel, stepKinds } from './flow-fields'
import { layoutFlow } from './flow-layout'
import './agents.css'

export function FlowGraph({ definition, selected, onSelect, onEdge, invalidNodes = [], disabled }: {
  definition: Definition; selected?: string; onSelect: (key: string) => void; onEdge?: (index: number) => void; invalidNodes?: string[]; disabled?: boolean
}) {
  const { token } = theme.useToken()
  const layout = useMemo(() => layoutFlow(definition), [definition])
  const marker = useId().replace(/:/g, '')
  const viewport = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [zoom, setZoom] = useState<number>()
  const scale = zoom ?? Math.max(0.9, Math.min(1, (width - 16) / layout.width))
  useEffect(() => {
    const el = viewport.current!
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width) setWidth(entry.contentRect.width) })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const node = layout.nodes.find(item => item.key === selected), el = viewport.current
    if (!node || !el) return
    const left = (node.x - node.width / 2) * scale, top = (node.y - node.height / 2) * scale
    if (left < el.scrollLeft || left + node.width * scale > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, left - 24)
    if (top < el.scrollTop || top + node.height * scale > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - 24)
  }, [selected, layout, scale])
  const stepNames = new Map(definition.steps.map(step => [step.key, step.name]))
  return <section className="agent-flow-canvas" aria-label="流程图" style={{ background: token.colorFillAlter, borderColor: token.colorBorderSecondary, borderRadius: token.borderRadiusLG }}>
    <div className="agent-flow-canvas-toolbar"><Typography.Text type="secondary">{definition.steps.length} 个步骤</Typography.Text>
      <Space size={4}><Tooltip title="缩小"><Button size="small" aria-label="缩小流程图" icon={<MinusOutlined />} disabled={scale <= 0.5} onClick={() => setZoom(Math.max(0.5, scale - 0.1))} /></Tooltip>
        <Typography.Text className="agent-flow-zoom">{Math.round(scale * 100)}%</Typography.Text>
        <Tooltip title="放大"><Button size="small" aria-label="放大流程图" icon={<PlusOutlined />} disabled={scale >= 1.5} onClick={() => setZoom(Math.min(1.5, scale + 0.1))} /></Tooltip>
        <Button size="small" icon={<AimOutlined />} onClick={() => { setZoom(undefined); viewport.current?.scrollTo({ top: 0, left: 0 }) }}>适应宽度</Button></Space>
    </div>
    <div className="agent-flow-viewport" ref={viewport}>
      <div className="agent-flow-scaled" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className="agent-flow-scene" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
          <svg width={layout.width} height={layout.height} className="agent-flow-edges" aria-hidden="true">
            <defs>{['normal', 'selected'].map(kind => <marker key={kind} id={`${marker}-${kind}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={kind === 'selected' ? token.colorPrimary : token.colorTextTertiary} /></marker>)}</defs>
            {layout.edges.map(edge => {
              const item = definition.edges[edge.index]
              const active = item.source === selected || item.target === selected
              return <path key={edge.index} d={edge.points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ')} fill="none" stroke={active ? token.colorPrimary : token.colorTextTertiary}
                strokeWidth={active ? 2 : 1.5} strokeDasharray={item.otherwise ? '5 4' : undefined} markerEnd={`url(#${marker}-${active ? 'selected' : 'normal'})`} />
            })}
          </svg>
          {layout.nodes.map(node => {
            const step = definition.steps.find(item => item.key === node.key)
            if (!step) return <div key={node.key} className="agent-flow-end" style={{ left: node.x - node.width / 2, top: node.y - node.height / 2, width: node.width, height: node.height, background: token.colorBgContainer, borderColor: token.colorBorder }}>结束</div>
            const invalid = invalidNodes.includes(step.key)
            return <Tooltip key={node.key} title={step.name}><Button className="agent-flow-graph-node" aria-pressed={selected === step.key} aria-label={step.name} disabled={disabled}
              data-step-key={step.key} onClick={() => onSelect(step.key)} style={{ left: node.x - node.width / 2, top: node.y - node.height / 2, width: node.width, height: node.height,
                background: token.colorBgContainer, borderColor: invalid ? token.colorError : selected === step.key ? token.colorPrimary : token.colorBorder,
                boxShadow: selected === step.key ? `0 0 0 2px ${token.colorPrimaryBg}` : token.boxShadowTertiary }}>
              <span className="agent-flow-node-name">{step.name || '未命名步骤'}</span>
              <span className="agent-flow-node-meta"><Tag>{stepKinds[step.kind]}</Tag><span>{step.timeout_seconds} 秒</span>{step.key === definition.start_step && <Tag color="blue">起点</Tag>}{invalid && <Tag color="error">待修正</Tag>}</span>
            </Button></Tooltip>
          })}
          {layout.edges.filter(edge => edge.label).map(edge => {
            const item = definition.edges[edge.index]
            const label = edgeLabel(definition, item)
            return <Tooltip key={edge.index} title={label}><Button size="small" className="agent-flow-edge-label" disabled={disabled}
              aria-label={`${stepNames.get(item.source)}：${label}，进入${stepNames.get(item.target) ?? '结束'}`} onClick={() => onEdge ? onEdge(edge.index) : onSelect(item.source)}
              style={{ left: edge.x - 78, top: edge.y - 20, width: 156, height: 40, color: item.source === selected ? token.colorPrimary : token.colorTextSecondary,
                background: item.source === selected ? token.colorPrimaryBg : token.colorBgContainer, borderColor: 'transparent' }}><span>{label}</span></Button></Tooltip>
          })}
        </div>
      </div>
    </div>
  </section>
}
