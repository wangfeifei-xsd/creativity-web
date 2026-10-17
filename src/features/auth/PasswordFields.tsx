import { Form, Input } from 'antd'
import { AuthIcon } from './AuthIcon'

export function PasswordFields({ requireCurrentPassword = false }: { requireCurrentPassword?: boolean }) {
  return <>
    {requireCurrentPassword && <Form.Item name="current_password" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
      <Input.Password prefix={<AuthIcon name="lock" />} autoComplete="current-password" placeholder="请输入原密码" maxLength={256} />
    </Form.Item>}
    <Form.Item name="new_password" label="新密码" extra="密码长度为 12 至 256 个字符" rules={[
      { required: true, message: '请输入新密码' },
      { min: 12, max: 256, message: '密码长度须为 12 至 256 个字符' },
    ]}>
      <Input.Password prefix={<AuthIcon name="lock" />} autoComplete="new-password" placeholder="请输入新密码" maxLength={256} />
    </Form.Item>
    <Form.Item name="confirmation" label="确认新密码" dependencies={['new_password']} rules={[
      { required: true, message: '请再次输入新密码' },
      ({ getFieldValue }) => ({ validator(_, value: string) {
        return !value || value === getFieldValue('new_password') ? Promise.resolve() : Promise.reject(new Error('两次密码不一致'))
      } }),
    ]}>
      <Input.Password prefix={<AuthIcon name="lock" />} autoComplete="new-password" placeholder="请再次输入新密码" maxLength={256} />
    </Form.Item>
  </>
}
