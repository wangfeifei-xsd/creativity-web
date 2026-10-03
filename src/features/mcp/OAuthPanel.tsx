import { Button, Select, Space, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice } from '../../components/Management'

export function OAuthCallback() {
  const [error, setError] = useState<unknown>()
  const [done, setDone] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    const values = new URLSearchParams(window.location.search)
    if (started.current || !values.has('state') || !values.has('code')) return
    started.current = true
    const body = { state: values.get('state'), code: values.get('code') }
    window.history.replaceState(null, '', window.location.pathname)
    void send('/admin/v1/mcp-connections/oauth/callback', 'POST', body).then(() => setDone(true)).catch(setError)
  }, [])
  return <><ErrorNotice error={error} />{done && <Typography.Paragraph>授权完成，可以测试连接。</Typography.Paragraph>}</>
}

export function OAuthPanel({ connectionId }: { connectionId: string }) {
  const base = `/admin/v1/mcp-connections/${connectionId}/oauth` as const
  const profiles = useQuery<{ profile_id: string; name: string }[]>(`${base}/profiles`)
  const [profile, setProfile] = useState<string>()
  const [ownership, setOwnership] = useState('user')
  const [error, setError] = useState<unknown>()
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  async function act(action: 'start' | 'revoke') {
    setBusy(true); setError(undefined)
    try {
      const result = await send<{ authorization_url?: string }>(`${base}/${action}`, 'POST', { profile_id: profile, ownership })
      if (result.authorization_url) window.location.assign(result.authorization_url)
      else setFeedback('授权已撤销')
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Space orientation="vertical"><ErrorNotice error={error ?? profiles.error} />
    <Select aria-label="身份提供方" style={{ minWidth: 220 }} value={profile} onChange={setProfile} options={profiles.data?.map(p => ({ value: p.profile_id, label: p.name }))} />
    <Select aria-label="授权归属" style={{ minWidth: 220 }} value={ownership} onChange={setOwnership} options={[{ value: 'user', label: '当前身份' }, { value: 'service', label: '当前数据域服务' }]} />
    <Space><Button disabled={!profile} loading={busy} type="primary" onClick={() => void act('start')}>前往授权</Button><Button disabled={!profile || busy} danger onClick={() => void act('revoke')}>撤销授权</Button></Space>
    {feedback && <Typography.Text>{feedback}</Typography.Text>}
  </Space>
}
