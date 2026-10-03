import { Button, Card, Form, Input, Select, Space, Typography } from 'antd'
import { useRef, useState } from 'react'
import { applyFormErrors } from '../../api/form-errors'
import { ErrorNotice, type Schema } from '../../components/Management'
import { isAbort, useQuery } from '../../api/useQuery'

export function AuthForm({ changePassword, onSubmit, onLogout }: {
  changePassword: boolean
  onSubmit: (values: Schema<'LoginInput'> | Schema<'PasswordChange'> | { profile_id: string; token: string }) => Promise<void>
  onLogout: () => Promise<void>
}) {
  const [form] = Form.useForm()
  const providers = useQuery<{ profile_id: string; name: string }[]>(changePassword ? null : '/admin/v1/auth/identity-providers')
  const [external, setExternal] = useState(false)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  const submitLabel = changePassword ? '修改密码并重新登录' : '登录'
  const submit = async (values: Schema<'LoginInput'> | Schema<'PasswordChange'> | { profile_id: string; token: string }) => {
    if (active.current) return
    active.current = true; setBusy(true); setError(undefined)
    try { await onSubmit(values) } catch (failure) { if (!isAbort(failure)) { setError(failure); applyFormErrors(form, failure) } }
    finally { active.current = false; setBusy(false) }
  }
  return <div className="auth-container"><Card className="auth-card">
    <Typography.Title level={2}>{changePassword ? '修改初始密码' : '登录'}</Typography.Title>
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <ErrorNotice error={error} />
      {!changePassword && !!providers.data?.length && <Select aria-label="登录方式" value={external ? 'external' : 'password'} onChange={v => { setExternal(v === 'external'); form.resetFields() }} options={[{ value: 'password', label: '平台账号' }, { value: 'external', label: '外部身份' }]} />}
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy}>
        {!changePassword && !external && <Form.Item name="login_name" label="登录名" rules={[{ required: true, message: '请输入登录名' }]}>
          <Input autoComplete="username" /></Form.Item>}
        {!external && <Form.Item name={changePassword ? 'current_password' : 'password'} label={changePassword ? '当前密码' : '密码'}
          rules={[{ required: true, message: '请输入密码' }]}><Input.Password autoComplete="current-password" /></Form.Item>}
        {external && <><Form.Item name="profile_id" label="身份源" rules={[{ required: true }]}><Select options={providers.data?.map(p => ({ value: p.profile_id, label: p.name }))} /></Form.Item><Form.Item name="token" label="外部访问凭据" rules={[{ required: true }]}><Input.Password autoComplete="off" /></Form.Item></>}
        {changePassword && <><Form.Item name="new_password" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}>
          <Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="confirmation" label="确认新密码" dependencies={['new_password']} rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({ validator(_, value: string) {
              return !value || value === getFieldValue('new_password') ? Promise.resolve() : Promise.reject(new Error('两次密码不一致'))
            } }),
          ]}><Input.Password autoComplete="new-password" /></Form.Item></>}
        <Button type="primary" htmlType="submit" aria-label={submitLabel} disabled={busy} loading={busy} block>{submitLabel}</Button>
      </Form>
      {changePassword && <Button disabled={busy} onClick={() => void onLogout().catch(setError)}>退出登录</Button>}
    </Space>
  </Card></div>
}
