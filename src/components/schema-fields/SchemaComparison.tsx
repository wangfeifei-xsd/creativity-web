import { Collapse, Space, Tag, Typography } from 'antd'
import { Table } from '../Table'
import { SchemaView } from './SchemaFields'
import { compareRows, constraintLabel, isObject, schemaRows, typeLabel, type ComparisonRow, type FieldRow, type SchemaObject } from './schema'

export function SchemaComparison({ before, after, label, beforeLabel = '当前发布', afterLabel = '草稿' }: {
  before: unknown; after: unknown; label: string; beforeLabel?: string; afterLabel?: string
}) {
  const left = isObject(before) ? before : undefined, right = isObject(after) ? after : undefined
  const root = (schema: SchemaObject | undefined): FieldRow | undefined => schema ? { key: 'root', name: '整体结构', path: [], schema, required: false, item: true } : undefined
  const rootRow = compareRows(left ? [root(left)!] : [], right ? [root(right)!] : [])[0]
  const rows: ComparisonRow[] = [...(rootRow ? [{ ...rootRow, name: '整体结构' }] : []), ...compareRows(schemaRows(left ?? {}), schemaRows(right ?? {}))]
  return <section aria-label={`${label}差异`}>
    <Table<ComparisonRow> rowKey="key" size="small" pagination={false} dataSource={rows} tableLayout="fixed" scroll={{ x: 620 }} expandable={{ defaultExpandAllRows: true, indentSize: 16 }} columns={[
      { title: '字段名称 / 标识', width: '24%', render: (_, row) => <span className="schema-fields-name"><span>{row.name}</span>{row.key !== 'root' && !row.after?.item && !row.before?.item && <Typography.Text type="secondary">{row.after?.name ?? row.before?.name}</Typography.Text>}</span> },
      { title: beforeLabel, width: '38%', render: (_, row) => <FieldValue row={row.before} empty={left ? '无此字段' : '尚未发布'} root={row.key === 'root'} /> },
      { title: afterLabel, width: '38%', render: (_, row) => <Space orientation="vertical" size={4}><FieldValue row={row.after} empty="已移除" root={row.key === 'root'} />
        {row.changed && <Tag color={!row.before ? 'green' : !row.after ? 'red' : 'orange'}>{!row.before ? '新增' : !row.after ? '移除' : '修改'}</Tag>}</Space> },
    ]} />
    <Collapse ghost size="small" items={[{ key: 'complete', label: '查看完整结构', children: <div className="schema-comparison-complete">
      <section><Typography.Title level={5}>{beforeLabel}</Typography.Title>{left ? <SchemaView value={left} label={`${label}${beforeLabel}`} /> : <Typography.Text type="secondary">尚未发布</Typography.Text>}</section>
      <section><Typography.Title level={5}>{afterLabel}</Typography.Title>{right && <SchemaView value={right} label={`${label}${afterLabel}`} />}</section>
    </div> }]} />
  </section>
}

function FieldValue({ row, empty, root }: { row?: FieldRow; empty: string; root: boolean }) {
  if (!row) return <Typography.Text type="secondary">{empty}</Typography.Text>
  const schema = row.schema
  return <div className="schema-fields-description">
    <Space size={4} wrap><Tag>{typeLabel(schema)}</Tag>{!row.item && <Tag>{row.required ? '必填' : '选填'}</Tag>}</Space>
    {!root && isObject(schema) && typeof schema.title === 'string' && <div>{schema.title}</div>}
    {isObject(schema) && typeof schema.description === 'string' && <div>{schema.description}</div>}
    <Typography.Text type="secondary">{constraintLabel(schema)}</Typography.Text>
  </div>
}
