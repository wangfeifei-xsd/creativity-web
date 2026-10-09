import { Button, Modal, Slider, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { apiClient, ApiError } from '../../api/client'
import { isAbort } from '../../api/useQuery'
import type { Schema } from '../../components/Management'
import { AuthIcon } from './AuthIcon'

export function SliderCaptcha({ value, onChange, loginName, beforeOpen, disabled, id }: {
  value?: string
  onChange?: (value: string) => void
  loginName: string
  beforeOpen: () => Promise<unknown>
  disabled: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [challenge, setChallenge] = useState<Schema<'CaptchaChallenge'>>()
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState<'loading' | 'verifying' | null>(null)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController | null>(null)
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keyboard = useRef(false)
  const verifying = useRef(false)

  useEffect(() => () => { request.current?.abort(); clearTimeout(expiry.current) }, [])

  const load = async (clearFailure = true) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    verifying.current = false
    setBusy('loading'); setChallenge(undefined); setOffset(0)
    if (clearFailure) setFailure('')
    try {
      const result = await apiClient.request<Schema<'CaptchaChallenge'>>('/admin/v1/auth/captcha/challenges', {
        method: 'POST', body: JSON.stringify({ login_name: loginName }), signal: controller.signal,
      })
      if (!controller.signal.aborted) setChallenge(result)
    } catch (error) {
      if (!controller.signal.aborted && !isAbort(error)) setFailure(error instanceof Error ? error.message : '验证码加载失败，请重试')
    } finally { if (!controller.signal.aborted) setBusy(null) }
  }

  const verify = async (position: number) => {
    if (!challenge || busy || verifying.current || request.current?.signal.aborted) return
    verifying.current = true
    const controller = new AbortController()
    request.current = controller
    setBusy('verifying'); setFailure('')
    try {
      const result = await apiClient.request<Schema<'CaptchaVerification'>>('/admin/v1/auth/captcha/verify', {
        method: 'POST', body: JSON.stringify({ challenge_id: challenge.challenge_id, offset: position }), signal: controller.signal,
      })
      if (controller.signal.aborted) return
      onChange?.(result.captcha_token); setNotice(''); setOpen(false)
      clearTimeout(expiry.current)
      // 此计时仅更新交互提示，登录是否接受凭据始终由服务端决定。
      expiry.current = setTimeout(() => { onChange?.(''); setNotice('验证已过期，请重新验证') }, result.expires_in * 1000)
    } catch (error) {
      if (controller.signal.aborted || isAbort(error)) return
      setFailure(error instanceof Error ? error.message : '验证失败，请重试')
      // 失败的挑战已被服务端消费；网络中断也不能假定原挑战仍可使用。
      if (!(error instanceof ApiError) || error.status !== 429) { void load(false); return }
      setChallenge(undefined)
    } finally {
      if (request.current === controller && !controller.signal.aborted) { verifying.current = false; setBusy(null) }
    }
  }

  const show = async () => {
    try { await beforeOpen() } catch { return }
    setOpen(true); setNotice('')
    if (value) onChange?.('')
    clearTimeout(expiry.current)
    void load()
  }
  const close = () => { request.current?.abort(); verifying.current = false; setOpen(false); setBusy(null); setChallenge(undefined) }

  return <>
    <Button id={id} className={`captcha-trigger${value ? ' captcha-trigger--verified' : ''}`} disabled={disabled}
      onClick={() => void show()} aria-label={value ? '验证已通过，点击重新验证' : '点击完成滑动验证'}>
      <AuthIcon name="shield" /><span>{value ? '验证已通过' : notice || '点击完成滑动验证'}</span><AuthIcon name={value ? 'check' : 'arrow'} />
    </Button>
    <Modal className="captcha-modal" title="滑动验证" open={open} onCancel={close} footer={null} width={384} centered destroyOnHidden mask={{ closable: busy !== 'verifying' }}>
      <p className="captcha-instruction">拖动滑块，使拼图与缺口重合</p>
      <div className="captcha-picture" aria-busy={!!busy}>
        {challenge && <><img src={challenge.background} alt="带有拼图缺口的验证图片" draggable={false} />
          <img className="captcha-piece" src={challenge.piece} alt="待对齐的拼图" draggable={false} style={{
            width: `${challenge.piece_size / challenge.width * 100}%`, top: `${challenge.piece_y / challenge.height * 100}%`, left: `${offset / challenge.width * 100}%`,
          }} /></>}
        {busy && <Spin />}
      </div>
      <div className="captcha-slider-wrap" onPointerDownCapture={() => { keyboard.current = false }} onKeyDownCapture={event => {
        keyboard.current = true
        if (event.key === 'Enter') { event.preventDefault(); void verify(offset) }
      }}>
        <span className="captcha-slider-caption">向右拖动滑块</span>
        <Slider min={0} max={challenge ? challenge.width - challenge.piece_size : 268} step={1} value={offset}
          onChange={setOffset} onChangeComplete={position => { if (!keyboard.current) void verify(position) }}
          disabled={!challenge || !!busy} tooltip={{ open: false }} ariaLabelForHandle="拼图位置"
          ariaValueTextFormatterForHandle={position => `已移动 ${position ?? 0}，使用方向键调整，回车确认`} />
      </div>
      {failure && <p role="alert" className="captcha-feedback">{failure}</p>}
      <div className="captcha-actions">
        <Button type="text" icon={<AuthIcon name="refresh" />} onClick={() => void load()} disabled={!!busy}>换一张</Button>
        <Button type="text" disabled={!challenge || !!busy} loading={busy === 'verifying'} onClick={() => void verify(offset)}>确认位置</Button>
      </div>
    </Modal>
  </>
}
