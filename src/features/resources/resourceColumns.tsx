import type { ColumnsType } from 'antd/es/table'
import { formatTimestamp } from '../../api/presentation'
import { StatusTag } from '../../components/StatusTag'
import { ResourceActions, ResourceRecords } from './ResourceManagement'
import type { Kind, Summary } from './useResourceSummaries'

export function resourceColumns<Row>(kind: Kind, summaries: Record<string, Summary>, identifier: (row: Row) => string, onEdit: (row: Row) => void, onChanged: () => void): ColumnsType<Row> {
  return [
    { title: '状态', render: (_, row) => summaries[identifier(row)] ? <StatusTag status={summaries[identifier(row)].status} /> : '—' },
    { title: '引用数量', render: (_, row) => <ResourceRecords kind={kind} summary={summaries[identifier(row)]} type="references" /> },
    { title: '使用次数', render: (_, row) => <ResourceRecords kind={kind} summary={summaries[identifier(row)]} type="uses" /> },
    { title: '更新时间', render: (_, row) => summaries[identifier(row)] ? formatTimestamp(summaries[identifier(row)].updated_at) : '—' },
    { title: '操作', render: (_, row) => <ResourceActions kind={kind} summary={summaries[identifier(row)]} onEdit={() => onEdit(row)} onChanged={onChanged} /> },
  ]
}
