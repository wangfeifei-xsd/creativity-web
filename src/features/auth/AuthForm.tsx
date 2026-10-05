import { Alert, Button, Card, ConfigProvider, Form, Input, Select, Typography } from 'antd'
import { useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { applyFormErrors } from '../../api/form-errors'
import type { Schema } from '../../components/Management'
import { isAbort, useQuery } from '../../api/useQuery'
import { authTheme } from '../../app/theme'
import { BrandMark } from './BrandMark'
import { AuthIcon } from './AuthIcon'
import { SliderCaptcha } from './SliderCaptcha'
import './auth.css'

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
  const [captchaRevision, setCaptchaRevision] = useState(0)
  const loginName = Form.useWatch<string>('login_name', form) || ''
  const active = useRef(false)
  const submitLabel = changePassword ? '修改密码并重新登录' : '登录'
  const submit = async (values: Schema<'LoginInput'> | Schema<'PasswordChange'> | { profile_id: string; token: string }) => {
    if (active.current) return
    active.current = true; setBusy(true); setError(undefined)
    try { await onSubmit(values) } catch (failure) {
      if (!isAbort(failure)) {
        setError(failure); applyFormErrors(form, failure)
        form.setFieldValue('captcha_token', undefined); setCaptchaRevision(n => n + 1)
      }
    }
    finally { active.current = false; setBusy(false) }
  }
  return <ConfigProvider theme={authTheme}><div className="auth-page">
    <span className="auth-frame-corner auth-frame-corner--top" aria-hidden="true" /><span className="auth-frame-corner auth-frame-corner--bottom" aria-hidden="true" />
    <div className="auth-diagonal auth-diagonal--one" aria-hidden="true" /><div className="auth-diagonal auth-diagonal--two" aria-hidden="true" />
    <header className="auth-brand"><BrandMark className="auth-brand-mark" /><span className="auth-brand-name">Creativity</span></header>
    <main className="auth-main">
      <div className="auth-art" aria-hidden="true"><BrandMark className="auth-emblem" /></div>
      <section className="auth-panel" aria-labelledby="auth-title"><Card className="auth-card">
      <div className="auth-title"><Typography.Title id="auth-title" level={2}>{changePassword ? '修改初始密码' : '登录'}</Typography.Title>
        <span className="auth-title-decoration" aria-hidden="true"><i /><i /><i /></span></div>
      {!!error && <div className="auth-error"><Alert type="error" showIcon title={error instanceof ApiError ? error.message : '操作失败，请稍后重试'} /></div>}
      {!changePassword && !!providers.data?.length && <Select className="auth-method" aria-label="登录方式" value={external ? 'external' : 'password'} disabled={busy} onChange={v => { setExternal(v === 'external'); setError(undefined); form.resetFields() }} options={[{ value: 'password', label: '平台账号' }, { value: 'external', label: '外部身份' }]} />}
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy} requiredMark={false} onValuesChange={changed => {
        setError(undefined)
        if ('login_name' in changed) form.setFieldValue('captcha_token', undefined)
      }}>
        {!changePassword && !external && <Form.Item name="login_name" label="登录名" rules={[{ required: true, message: '请输入登录名' }]}>
          <Input autoComplete="username" placeholder="请输入登录名" maxLength={128} prefix={<AuthIcon name="user" />} /></Form.Item>}
        {!external && <Form.Item name={changePassword ? 'current_password' : 'password'} label={changePassword ? '当前密码' : '密码'}
          rules={[{ required: true, message: '请输入密码' }]}><Input.Password autoComplete="current-password" placeholder={changePassword ? '请输入当前密码' : '请输入密码'} maxLength={256} prefix={<AuthIcon name="lock" />} /></Form.Item>}
        {external && <><Form.Item name="profile_id" label="身份源" rules={[{ required: true }]}><Select options={providers.data?.map(p => ({ value: p.profile_id, label: p.name }))} /></Form.Item><Form.Item name="token" label="外部访问凭据" rules={[{ required: true }]}><Input.Password autoComplete="off" /></Form.Item></>}
        {changePassword && <><Form.Item name="new_password" label="新密码" extra="密码不少于 12 个字符" rules={[{ required: true, message: '请输入新密码' }]}>
          <Input.Password autoComplete="new-password" placeholder="请输入新密码" /></Form.Item>
          <Form.Item name="confirmation" label="确认新密码" dependencies={['new_password']} rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({ validator(_, value: string) {
              return !value || value === getFieldValue('new_password') ? Promise.resolve() : Promise.reject(new Error('两次密码不一致'))
            } }),
          ]}><Input.Password autoComplete="new-password" placeholder="请再次输入新密码" /></Form.Item></>}
        {!changePassword && !external && <Form.Item name="captcha_token" label="安全验证" rules={[{ required: true, message: '请先完成滑动验证' }]}>
          <SliderCaptcha key={`${loginName}:${captchaRevision}`} loginName={loginName} disabled={busy} beforeOpen={() => form.validateFields(['login_name'])} />
        </Form.Item>}
        <Button className="auth-submit" type="primary" htmlType="submit" aria-label={submitLabel} disabled={busy} loading={busy} block>{submitLabel}</Button>
      </Form>
      {changePassword && <Button className="auth-logout" disabled={busy} onClick={() => void onLogout().catch(setError)}>退出登录</Button>}
    </Card></section></main>
  </div></ConfigProvider>
}
