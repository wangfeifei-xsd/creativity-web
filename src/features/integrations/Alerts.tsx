import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice } from '../../components/Management'

type Rule = { id: string; revision: number; name: string; kind: string; kind_label: string; threshold: number; window_seconds: number; endpoint_id: string; enabled: boolean; state_label: string; last_value: number; generation: number }
export function Alerts() {
  const query = useQuery<Rule[]>('/admin/v1/alert-rules')
  const endpoints = useQuery<{ id: string; name: string; events: string[] }[]>('/admin/v1/webhooks')
  const [editor, setEditor] = useState<{ row?: Rule }>(), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>()
  const [form] = Form.useForm<{ name: string; kind: string; threshold: number; window_seconds: number; endpoint_id: string; active: boolean }>()
  const kind = Form.useWatch('kind', form)
  function edit(row?: Rule) { form.resetFields(); form.setFieldsValue(row ? { ...row, active: row.enabled } : { name: '', kind: 'run_failure', threshold: 1, window_seconds: 3600, active: true }); setEditor({ row }) }
  return <><ErrorNotice error={error ?? query.error ?? endpoints.error} /><Space><Button type="primary" onClick={() => edit()}>新增告警</Button><Button onClick={query.reload}>刷新</Button></Space>
    <Table rowKey="id" dataSource={query.data} columns={[{ title: '名称', dataIndex: 'name' }, { title: '类型', dataIndex: 'kind_label' }, { title: '状态', dataIndex: 'state_label' }, { title: '当前观察', render: (_, r) => r.kind === 'budget' ? '按预算阈值记录' : `${r.last_value} 次` }, { title: '投递端点', render: (_, r) => endpoints.data?.find(e => e.id === r.endpoint_id)?.name ?? '名称不可用' }, { title: '操作', render: (_, r) => <Button onClick={() => edit(r)}>编辑</Button> }]} />
    <Modal open={!!editor} title={editor?.row ? '编辑告警' : '新增告警'} onCancel={() => setEditor(undefined)} onOk={() => form.submit()} confirmLoading={busy} okButtonProps={{ 'aria-label': '确定', disabled: busy }}>
      <ErrorNotice error={error} />
      <Form name="alert" form={form} layout="vertical" disabled={busy} onFinish={async v => { if (busy) return; setBusy(true); try { await send(editor?.row ? `/admin/v1/alert-rules/${editor.row.id}` : '/admin/v1/alert-rules', editor?.row ? 'PATCH' : 'POST', { ...v, revision: editor?.row?.revision }); setEditor(undefined); query.reload() } catch (e) { setError(e) } finally { setBusy(false) } }}>
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="kind" label="监测类型" rules={[{ required: true }]}><Select disabled={!!editor?.row} options={[{ value: 'budget', label: '预算阈值' }, { value: 'run_failure', label: '运行失败' }, { value: 'cleanup_failure', label: '清理异常' }, { value: 'delivery_failure', label: '投递异常' }]} /></Form.Item>
        {kind !== 'budget' && <><Form.Item name="threshold" label="次数阈值" rules={[{ required: true }]}><InputNumber min={1} max={10000} /></Form.Item><Form.Item name="window_seconds" label="统计窗口（秒）" rules={[{ required: true }]}><InputNumber min={60} max={604800} /></Form.Item></>}
        <Form.Item name="endpoint_id" label="投递端点" rules={[{ required: true }]}><Select disabled={!!editor?.row} options={endpoints.data?.filter(e => e.events.includes('alert.triggered') && e.events.includes('alert.resolved')).map(e => ({ value: e.id, label: e.name }))} /></Form.Item>
        <Form.Item name="active" label="启用" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal></>
}
