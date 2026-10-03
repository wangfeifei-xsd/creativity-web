import { Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice } from '../../components/Management'

type Role = { id: string; name: string; builtin: boolean; revision?: number; allowed_actions: string[]; action_names: string[]; active: boolean; state_label: string; member_count: number }
export function CustomRoles({ onSaved }: { onSaved: () => void }) {
  const { session } = useSession()
  const query = useQuery<Role[]>('/admin/v1/custom-roles')
  const [editor, setEditor] = useState<{ role?: Role }>(), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>()
  const [form] = Form.useForm<{ name: string; allowed_actions: string[]; active: boolean }>()
  function edit(role?: Role) { setError(undefined); form.resetFields(); form.setFieldsValue(role ?? { name: '', allowed_actions: [], active: true }); setEditor({ role }) }
  return <><ErrorNotice error={(editor ? undefined : error) ?? query.error} /><Space><Button type="primary" onClick={() => edit()}>新增角色</Button><Button onClick={query.reload}>刷新</Button></Space>
    <Table rowKey="id" dataSource={query.data} columns={[{ title: '名称', dataIndex: 'name' }, { title: '类型', render: (_, r) => <Tag>{r.builtin ? '内置' : '自定义'}</Tag> }, { title: '动作上限', render: (_, r) => r.action_names.join('、') }, { title: '成员数', dataIndex: 'member_count' }, { title: '状态', dataIndex: 'state_label' }, { title: '操作', render: (_, r) => !r.builtin && <Button onClick={() => edit(r)}>编辑</Button> }]} />
    <Modal open={!!editor} title={editor?.role ? '编辑角色' : '新增角色'} onCancel={() => setEditor(undefined)} onOk={() => form.submit()} confirmLoading={busy} okButtonProps={{ 'aria-label': '确定', disabled: busy }}>
      <ErrorNotice error={error} />
      <Form name="custom-role" form={form} layout="vertical" disabled={busy} onFinish={async v => { if (busy) return; setBusy(true); setError(undefined); try { await send(editor?.role ? `/admin/v1/custom-roles/${editor.role.id}` : '/admin/v1/custom-roles', editor?.role ? 'PATCH' : 'POST', { ...v, revision: editor?.role?.revision }); setEditor(undefined); query.reload(); onSaved() } catch (e) { setError(e) } finally { setBusy(false) } }}>
        <Form.Item name="name" label="角色名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="allowed_actions" label="允许动作" rules={[{ required: true }]}><Select mode="multiple" options={session.actions.filter(a => !['account:manage', 'role:grant', 'channel:create', 'channel:govern', 'usage:platform', 'audit:read'].includes(a.action_key)).map(a => ({ value: a.action_key, label: a.label }))} /></Form.Item>
        <Form.Item name="active" label="启用" valuePropName="checked"><Switch /></Form.Item>
        {editor?.role && <Typography.Text>当前关联 {editor.role.member_count} 位有效成员，修改后权限立即生效。</Typography.Text>}
      </Form>
    </Modal></>
}
