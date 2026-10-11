import { DateTimeInput } from '../../components/DateTimeInput'
import { Button, Drawer, Form, Input, Modal, Select, Space, Tag, Typography, Upload } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { ApiError } from '../../api/client'
import { applyFormErrors, clearFormErrors } from '../../api/form-errors'
import { parseJson } from '../../api/json'
import { formatAmount, formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice } from '../../components/Management'

type Statement = { id: string; name: string; version: string; currency: string; start_at: string; end_at: string; created_at: string }
type Detail = Statement & { checked_at: string; results: { state_label: string; request_id: string | null; line_id: string | null; run_id: string | null; model_name: string | null; provider_amount: string | null; platform_amount: string | null; platform_currency: string | null; difference: string | null; late_reported: boolean }[]; counts: { state: string; label: string; count: number }[] }
export function Statements() {
  const { session } = useSession()
  const query = useQuery<Statement[]>('/admin/v1/provider-statements')
  const connections = useQuery<{ connection_id: string; name: string }[]>('/admin/v1/provider-statements/options')
  const [selected, setSelected] = useState<string>(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>()
  const detail = useQuery<Detail>(selected ? `/admin/v1/provider-statements/${selected}` : null)
  const [form] = Form.useForm<{ name: string; version: string; connection_id: string; currency: string; start_at: string; end_at: string; lines: string }>()
  return <><ErrorNotice error={(open ? undefined : error) ?? query.error ?? connections.error} /><Space>{session.actions.some(a => a.action_key === 'budget:manage') && <Button type="primary" onClick={() => { setError(undefined); setOpen(true) }}>导入供应商账单</Button>}<Button onClick={query.reload}>刷新</Button></Space>
    <Table rowKey="id" dataSource={query.data} columns={[{ title: '来源', dataIndex: 'name' }, { title: '版本', dataIndex: 'version' }, { title: '币种', dataIndex: 'currency' }, { title: '开始时间', render: (_, r) => formatTimestamp(r.start_at) }, { title: '结束时间', render: (_, r) => formatTimestamp(r.end_at) }, { title: '操作', render: (_, r) => <Button onClick={() => setSelected(r.id)}>核查</Button> }]} />
    <Modal open={open} title="导入规范账单" width={720} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={busy} okButtonProps={{ 'aria-label': '确定', disabled: busy }}>
      <ErrorNotice error={error} />
      <Form name="provider-statement" form={form} layout="vertical" onFinish={async v => {
        if (busy) return
        clearFormErrors(form); setError(undefined); setBusy(true)
        try {
          const saved = await send<Detail>('/admin/v1/provider-statements', 'POST', { ...v, start_at: new Date(v.start_at).toISOString(), end_at: new Date(v.end_at).toISOString(), lines: parseJson(v.lines, []) })
          setOpen(false); setSelected(saved.id); query.reload()
        } catch (e) {
          setError(e); applyFormErrors(form, e, path => path.slice(0, 1))
          if (e instanceof ApiError) {
            const lines = e.fields.filter(field => field.path[0] === 'lines')
            if (lines.length) form.setFields([{ name: 'lines', errors: lines.map(field => {
              const label = ({ line_id: '行号', request_id: '请求标识', occurred_at: '发生时间', amount: '金额' } as Record<string, string>)[String(field.path[2])] ?? '明细'
              return `${typeof field.path[1] === 'number' ? `第 ${field.path[1] + 1} 项` : ''}${label}：${field.message}`
            }) }])
          }
        } finally { setBusy(false) }
      }}>
        <Form.Item name="name" label="账单来源" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="version" label="来源版本" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item>
        <Form.Item name="connection_id" label="模型连接" rules={[{ required: true }]}><Select options={connections.data?.map(c => ({ value: c.connection_id, label: c.name }))} /></Form.Item>
        <Form.Item name="currency" label="币种" rules={[{ required: true }, { pattern: /^[A-Z]{3}$/, message: '请输入三位币种代码' }]}><Input maxLength={3} /></Form.Item>
        <Space><Form.Item name="start_at" label="开始时间" rules={[{ required: true }]}><DateTimeInput /></Form.Item><Form.Item name="end_at" label="结束时间" rules={[{ required: true }]}><DateTimeInput /></Form.Item></Space>
        <Upload accept="application/json,.json" showUploadList={false} beforeUpload={file => { setError(undefined); if (file.size > 1048576) { setError(new Error('账单文件不能超过 1 MiB')); return false } void file.text().then(text => { parseJson(text, []); form.setFieldValue('lines', text) }).catch(setError); return false }}><Button>读取 JSON 明细</Button></Upload>
        <Form.Item name="lines" label="规范明细" rules={[{ required: true }]}><Input.TextArea rows={6} /></Form.Item>
        <Typography.Text>每行包含 line_id、request_id、occurred_at 和十进制字符串 amount，最多 1000 行。</Typography.Text>
      </Form>
    </Modal>
    <Drawer open={!!selected} title="供应商账单核查" width={1100} onClose={() => setSelected(undefined)} extra={<Button onClick={detail.reload}>重新核查</Button>}>
      <ErrorNotice error={detail.error} />
      <Space wrap>{detail.data?.counts.filter(c => c.count > 0).map(c => <Tag key={c.state}>{c.label}：{c.count}</Tag>)}</Space>
      {detail.data && <Typography.Paragraph>核查时间：{formatTimestamp(detail.data.checked_at)}</Typography.Paragraph>}
      <Table key={selected} rowKey="key" dataSource={detail.data?.results.map((result, index) => ({ ...result, key: `${selected}:${index}` }))} scroll={{ x: 950 }} columns={[
        { title: '供应商行号', render: (_, r) => r.line_id ?? '未提供' }, { title: '结果', dataIndex: 'state_label' },
        { title: '模型', render: (_, r) => r.model_name ?? '名称不可用' }, { title: '供应商金额', render: (_, r) => formatAmount(r.provider_amount, detail.data?.currency) },
        { title: '平台金额', render: (_, r) => formatAmount(r.platform_amount, r.platform_currency) }, { title: '差额', render: (_, r) => formatAmount(r.difference, detail.data?.currency) },
        { title: '迟到记录', render: (_, r) => r.late_reported ? '导入后上报' : '无' }, { title: '运行', render: (_, r) => r.run_id ? <Link to={`/runs/${r.run_id}`}>查看运行</Link> : '未匹配' },
      ]} expandable={{ expandedRowRender: r => <Typography.Text>供应商请求标识：{r.request_id ?? '未提供'}</Typography.Text> }} />
    </Drawer></>
}
