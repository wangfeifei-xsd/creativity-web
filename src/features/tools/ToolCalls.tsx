import { Descriptions, Drawer, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import type { Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'

export function ToolCalls({ toolId }: { toolId: string }) {
  const query = useQuery<Schema<'ToolCallView'>[]>(`/admin/v1/tool-calls?tool_id=${encodeURIComponent(toolId)}`)
  const [selected, setSelected] = useState<string>()
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  return <>
    <Table rowKey="tool_call_id" dataSource={query.data} scroll={{ x: 650 }} columns={[
      { title: '工具', render: (_, row) => <Typography.Link onClick={() => setSelected(row.tool_call_id)}>{row.tool_name ?? '名称不可用'}</Typography.Link> },
      { title: '版本', render: (_, row) => row.version_label ?? '版本名称不可用' },
      { title: '状态', render: (_, row) => <StatusTag status={row.state} /> },
      { title: '耗时', render: (_, row) => row.latency_ms == null ? '未记录' : `${row.latency_ms} 毫秒` },
      { title: '调用时间', render: (_, row) => formatTimestamp(row.created_at) },
    ]} />
    {selected && <CallDetail id={selected} onClose={() => setSelected(undefined)} />}
  </>
}

function CallDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery<Schema<'ToolCallView'>>(`/admin/v1/tool-calls/${id}`)
  const row = query.data
  return <Drawer open title="工具调用详情" size={720} onClose={onClose}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !row ? <LoadingState /> : <>
      <Descriptions column={1} items={[
        { key: 'tool', label: '工具', children: row.tool_name ?? '名称不可用' },
        { key: 'version', label: '版本', children: row.version_label ?? '版本名称不可用' },
        { key: 'state', label: '状态', children: row.state.label },
        { key: 'run', label: '运行标识', children: row.run_id },
        { key: 'step', label: '步骤标识', children: row.step_id },
        { key: 'attempt', label: '尝试标识', children: row.attempt_id ?? '未访问来源' },
        { key: 'source', label: '源请求标识', children: row.source_request_id ?? '未提供' },
        { key: 'time', label: '调用时间', children: formatTimestamp(row.created_at) },
      ]} />
      <Typography.Title level={5}>脱敏参数</Typography.Title><pre>{JSON.stringify(row.redacted_arguments, null, 2)}</pre>
      <Typography.Title level={5}>结果摘要</Typography.Title><pre>{row.result_summary ? JSON.stringify(row.result_summary, null, 2) : '暂无结果'}</pre>
      {row.error && <Typography.Paragraph type="danger">{String(row.error.message ?? '调用失败')}</Typography.Paragraph>}
      <Typography.Title level={5}>证据标识</Typography.Title>{row.evidence_ids.length ? row.evidence_ids.map(e => <Typography.Paragraph key={e} copyable>{e}</Typography.Paragraph>) : '暂无有效证据'}
    </>}
  </Drawer>
}
