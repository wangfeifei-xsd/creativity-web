import { Button, Card, Form, Input, Space, Typography } from 'antd'
import { useRef, useState } from 'react'
import { applyFormErrors } from '../../api/form-errors'
import { ErrorNotice, type Schema } from '../../components/Management'
import { isAbort } from '../../api/useQuery'

export function AuthForm({ changePassword, onSubmit, onLogout }: {
  changePassword: boolean
  onSubmit: (values: Schema<'LoginInput'> | Schema<'PasswordChange'>) => Promise<void>
  onLogout: () => Promise<void>
}) {
  const [form] = Form.useForm()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  const submit = async (values: Schema<'LoginInput'> | Schema<'PasswordChange'>) => {
    if (active.current) return
    active.current = true; setBusy(true); setError(undefined)
    try { await onSubmit(values) } catch (failure) { if (!isAbort(failure)) { setError(failure); applyFormErrors(form, failure) } }
    finally { active.current = false; setBusy(false) }
  }
  return <div className="auth-container"><Card className="auth-card">
    <Typography.Title level={2}>{changePassword ? '修改初始密码' : '登录'}</Typography.Title>
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <ErrorNotice error={error} />
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy}>
        {!changePassword && <Form.Item name="login_name" label="登录名" rules={[{ required: true, message: '请输入登录名' }]}>
          <Input autoComplete="username" /></Form.Item>}
        <Form.Item name={changePassword ? 'current_password' : 'password'} label={changePassword ? '当前密码' : '密码'}
          rules={[{ required: true, message: '请输入密码' }]}><Input.Password autoComplete="current-password" /></Form.Item>
        {changePassword && <><Form.Item name="new_password" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}>
          <Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="confirmation" label="确认新密码" dependencies={['new_password']} rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({ validator(_, value: string) {
              return !value || value === getFieldValue('new_password') ? Promise.resolve() : Promise.reject(new Error('两次密码不一致'))
            } }),
          ]}><Input.Password autoComplete="new-password" /></Form.Item></>}
        <Button type="primary" htmlType="submit" loading={busy} block>{changePassword ? '修改密码并重新登录' : '登录'}</Button>
      </Form>
      {changePassword && <Button disabled={busy} onClick={() => void onLogout().catch(setError)}>退出登录</Button>}
    </Space>
  </Card></div>
}
