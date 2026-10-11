import { Button, Form, Input, InputNumber, Modal, Select, Space, Tabs, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alerts } from './Alerts'
import { RunSourceNames, RunSources } from './RunSources'
import { useRunClients } from './useRunClients'
import { apiClient } from '../../api/client'
import { applyFormErrors, clearFormErrors } from '../../api/form-errors'
import { send } from '../../api/management'
import { jsonObject, parseJson } from '../../api/json'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { useSession } from '../../app/workspace/context'

type Schedule = { id: string; name: string; revision: number; state: string; state_label: string; next_at: string; spec: { timezone: string; interval_seconds?: number; daily_at?: string } }
type Endpoint = { id: string; name: string; url: string; events: string[]; client_ids: string[]; revision: number; state: string; state_label: string }
type Delivery = { id: string; endpoint_name?: string; revision: number; state: string; state_label: string; attempts: number; next_at: string; error?: { message: string }; http_status?: number }
type Batch = { batch_id: string; name: string; revision: number; state_label: string; items: { item_id: string; event_id: string; revision: number; state: string; state_label: string; run_id?: string; error?: { message: string } }[] }

export function Automation() {
  const { session } = useSession()
  const canReadRuns = session.actions.some(action => action.action_key === 'run:read')
  return <Tabs items={[{ key: 'schedules', label: '定时运行', children: <Schedules /> }, { key: 'webhooks', label: '事件投递', children: <Webhooks /> }, { key: 'batches', label: '批量运行', disabled: !canReadRuns, children: <Batches /> }, { key: 'alerts', label: '外部告警', children: <Alerts /> }]} />
}

function Schedules() {
  const { session } = useSession()
  const canRun = session.actions.some(action => action.action_key === 'run:create')
  const query = useQuery<Schedule[]>('/admin/v1/schedules')
  const agents = useQuery<Schema<'AgentList'>>('/admin/v1/agents?published_only=true')
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>()
  const [form] = Form.useForm<{ name: string; agent: string; input: string; timezone: string; mode: string; daily: string; interval: number }>()
  const mode = Form.useWatch('mode', form)
  return <><ErrorNotice error={(open ? undefined : error) ?? query.error} /><Space><Button type="primary" disabled={!canRun} title={!canRun ? '当前渠道环境没有运行权限' : undefined} onClick={() => { setError(undefined); form.resetFields(); setOpen(true) }}>新增计划</Button><Button onClick={() => { setError(undefined); query.reload() }}>刷新</Button></Space>
    <Table rowKey="id" dataSource={query.data} loading={!query.data && !query.error} columns={[
      { title: '名称', dataIndex: 'name' }, { title: '状态', dataIndex: 'state_label' },
      { title: '周期', render: (_, r) => r.spec.interval_seconds ? `每 ${r.spec.interval_seconds} 秒` : `每日 ${r.spec.daily_at}` },
      { title: '时区', render: (_, r) => r.spec.timezone }, { title: '下次运行', render: (_, r) => formatTimestamp(r.next_at) },
      { title: '操作', render: (_, r) => <Button disabled={busy} onClick={async () => { setBusy(true); setError(undefined); try { await send(`/admin/v1/schedules/${r.id}`, 'PATCH', { revision: r.revision, active: r.state !== 'ACTIVE' }); query.reload() } catch (e) { setError(e); query.reload() } finally { setBusy(false) } }}>{r.state === 'ACTIVE' ? '暂停' : '启用'}</Button> },
    ]} />
    <Modal open={open} title="新增定时计划" onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={busy} okButtonProps={{ 'aria-label': '确定', disabled: busy }}>
      <ErrorNotice error={error} />
      <Form name="schedule" form={form} layout="vertical" initialValues={{ input: '{}', timezone: 'Asia/Shanghai', mode: 'daily', daily: '09:00', interval: 3600 }} onFinish={async v => {
        if (busy) return; clearFormErrors(form); setBusy(true); setError(undefined)
        try { await send('/admin/v1/schedules', 'POST', { name: v.name, request: { agent_code: v.agent, input: jsonObject(v.input) }, timezone: v.timezone, daily_at: v.mode === 'daily' ? v.daily : null, interval_seconds: v.mode === 'interval' ? v.interval : null }); setOpen(false); query.reload() } catch (e) { setError(e); applyFormErrors(form, e, path => path[0] === 'request' && path[1] === 'input' ? ['input'] : path) } finally { setBusy(false) }
      }}>
        <Form.Item name="name" label="计划名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="agent" label="智能体" rules={[{ required: true }]}><Select options={agents.data?.items.map(a => ({ value: a.agent_code, label: a.name }))} /></Form.Item>
        <Form.Item name="input" label="运行输入" rules={[{ required: true }, { validator: async (_, value) => { jsonObject(value) } }]}><Input.TextArea rows={4} /></Form.Item>
        <Form.Item name="timezone" label="时区" rules={[{ required: true }, { validator: async (_, value) => { if (value) { try { new Intl.DateTimeFormat('zh-CN', { timeZone: value }) } catch { throw new Error('请输入有效时区，例如 Asia/Shanghai') } } } }]}><Input /></Form.Item>
        <Form.Item name="mode" label="周期"><Select options={[{ value: 'daily', label: '每日' }, { value: 'interval', label: '固定间隔' }]} /></Form.Item>
        {mode === 'daily' ? <Form.Item name="daily" label="本地时间" rules={[{ required: true, message: '请输入本地时间' }, { pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: '请输入时:分' }]}><Input /></Form.Item> : <Form.Item name="interval" label="间隔（秒）" rules={[{ required: true }]}><InputNumber min={60} max={2592000} /></Form.Item>}
      </Form>
    </Modal></>
}

function Webhooks() {
  const query = useQuery<Endpoint[]>('/admin/v1/webhooks'), deliveries = useQuery<Delivery[]>('/admin/v1/webhook-deliveries')
  const clients = useRunClients()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>()
  const [editing, setEditing] = useState<Endpoint>()
  const [form] = Form.useForm<{ name: string; url: string; secret: string; events: string[]; client_ids: string[] }>()
  const events = Form.useWatch('events', form)
  function reload() { query.reload(); deliveries.reload() }
  function edit(row?: Endpoint) { setError(undefined); setEditing(row); form.resetFields(); form.setFieldsValue(row ? { ...row, client_ids: row.client_ids ?? [] } : { events: ['run.terminal'], client_ids: [] }); setOpen(true) }
  return <><ErrorNotice error={(open ? undefined : error) ?? query.error ?? deliveries.error ?? clients.error} /><Space><Button type="primary" onClick={() => edit()}>新增端点</Button><Button onClick={reload}>刷新</Button></Space>
    <Table rowKey="id" dataSource={query.data} columns={[{ title: '名称', dataIndex: 'name' }, { title: '地址', dataIndex: 'url' }, { title: '运行通知范围', render: (_, r) => r.events.includes('run.terminal') ? <RunSourceNames ids={r.client_ids} clients={clients.data} /> : '由告警规则决定' }, { title: '状态', dataIndex: 'state_label' }, { title: '操作', render: (_, r) => <Space><Button disabled={busy} onClick={() => edit(r)}>编辑范围</Button><Button disabled={busy} onClick={async () => { setBusy(true); try { await send(`/admin/v1/webhooks/${r.id}`, 'PATCH', { revision: r.revision, active: r.state !== 'ACTIVE' }); reload() } catch (e) { setError(e) } finally { setBusy(false) } }}>{r.state === 'ACTIVE' ? '停用' : '启用'}</Button></Space> }]} />
    <Table rowKey="id" dataSource={deliveries.data} columns={[{ title: '投递端点', dataIndex: 'endpoint_name' }, { title: '结果', dataIndex: 'state_label' }, { title: '尝试次数', dataIndex: 'attempts' }, { title: '最近反馈', render: (_, r) => r.error?.message ?? (r.http_status ? `HTTP ${r.http_status}` : '未投递') }, { title: '操作', render: (_, r) => ['FAILED', 'CANCELLED'].includes(r.state) && <Button disabled={busy} onClick={async () => { setBusy(true); try { await send(`/admin/v1/webhook-deliveries/${r.id}/retry`, 'POST', { revision: r.revision }); reload() } catch (e) { setError(e) } finally { setBusy(false) } }}>重投</Button> }]} />
    <Modal open={open} title={editing ? '编辑通知范围' : '新增事件端点'} confirmLoading={busy} okButtonProps={{ 'aria-label': '确定', disabled: busy }} onCancel={() => { setOpen(false); form.resetFields() }} onOk={() => form.submit()}>
      <ErrorNotice error={error} />
      <Form name="webhook" form={form} layout="vertical" disabled={busy} initialValues={{ events: ['run.terminal'], client_ids: [] }} onFinish={async v => { if (busy) return; setBusy(true); setError(undefined); try { await send(editing ? `/admin/v1/webhooks/${editing.id}` : '/admin/v1/webhooks', editing ? 'PATCH' : 'POST', editing ? { revision: editing.revision, active: editing.state === 'ACTIVE', client_ids: v.client_ids ?? [] } : { ...v, client_ids: v.client_ids ?? [] }); setOpen(false); form.resetFields(); reload() } catch (e) { setError(e) } finally { setBusy(false) } }}>
        {!editing && <><Form.Item name="name" label="名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
          <Form.Item name="url" label="接收地址" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="secret" label="签名密钥" rules={[{ required: true }, { min: 32, message: '至少 32 个字符' }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="events" label="事件类型" rules={[{ required: true }]}><Select mode="multiple" options={[{ value: 'run.terminal', label: '运行终结' }, { value: 'alert.triggered', label: '告警触发' }, { value: 'alert.resolved', label: '告警解除' }]} /></Form.Item></>}
        {(editing?.events ?? events)?.includes('run.terminal') && <RunSources clients={clients} />}
      </Form>
    </Modal></>
}

function Batches() {
  const { session } = useSession()
  const canRun = session.actions.some(action => action.action_key === 'run:create')
  const query = useQuery<Batch[]>('/admin/v1/batches')
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>()
  const [form] = Form.useForm<{ name: string; items: string }>()
  const key = useRef('')
  return <><ErrorNotice error={(open ? undefined : error) ?? query.error} /><Space><Button type="primary" disabled={!canRun} onClick={() => { key.current = crypto.randomUUID(); setError(undefined); form.resetFields(); setOpen(true) }}>新建批次</Button><Button onClick={query.reload}>刷新</Button></Space>
    <Table rowKey="batch_id" dataSource={query.data} columns={[{ title: '名称', dataIndex: 'name' }, { title: '状态', dataIndex: 'state_label' }, { title: '条目数', render: (_, r) => r.items.length }, { title: '操作', render: (_, r) => r.state_label === '启用' && <Button disabled={busy} onClick={async () => { setBusy(true); try { await send(`/admin/v1/batches/${r.batch_id}/cancel`, 'POST', { revision: r.revision, cancel_runs: true }); query.reload() } catch (e) { setError(e) } finally { setBusy(false) } }}>取消批次</Button> }]} expandable={{ expandedRowRender: r => <Table rowKey="item_id" dataSource={r.items} pagination={false} columns={[{ title: '外部事件编号', dataIndex: 'event_id' }, { title: '状态', dataIndex: 'state_label' }, { title: '反馈', render: (_, i) => i.error?.message ?? '无' }, { title: '操作', render: (_, i) => <Space>{i.run_id && <Link to={`/runs/${i.run_id}`}>查看运行</Link>}{i.state === 'FAILED' && <Button disabled={busy} onClick={async () => { setBusy(true); try { await send(`/admin/v1/batch-items/${i.item_id}/retry`, 'POST', { revision: i.revision }); query.reload() } catch (e) { setError(e) } finally { setBusy(false) } }}>重试受理</Button>}</Space> }]} /> }} />
    <Modal open={open} title="新建批量运行" onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={busy} okButtonProps={{ 'aria-label': '确定', disabled: busy }}>
      <ErrorNotice error={error} />
      <Form name="batch" form={form} layout="vertical" onFinish={async v => { if (busy) return; clearFormErrors(form); setBusy(true); setError(undefined); try { await apiClient.request('/admin/v1/batches', { method: 'POST', headers: { 'Idempotency-Key': key.current }, body: JSON.stringify({ name: v.name, items: parseJson(v.items, []) }) }); setOpen(false); query.reload() } catch (e) { setError(e); applyFormErrors(form, e, path => path.slice(0, 1)) } finally { setBusy(false) } }}>
        <Form.Item name="name" label="批次名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="items" label="运行条目" rules={[{ required: true }]}><Input.TextArea rows={8} /></Form.Item>
        <Typography.Text>每项填写 event_id 和 request（agent_code、input），最多 100 项。</Typography.Text>
      </Form>
    </Modal></>
}
