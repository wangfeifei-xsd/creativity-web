import { describe, expect, it } from 'vitest'
import { resolveNavigation } from './navigation'
import { formatAmount } from '../api/presentation'

describe('服务端界面契约', () => {
  it('只将服务端导航映射到已登记页面，未知键不能构造路由', () => {
    const Component = () => null
    const registry = [
      { navigationKey: 'agents', path: '/agents', Component },
      { navigationKey: 'private', path: '/private', Component },
    ]
    expect(resolveNavigation([
      { navigation_key: 'agents', label: '智能体' },
      { navigation_key: 'unregistered', label: '不存在页面' },
    ], registry).map(({ path, label }) => ({ path, label })))
      .toEqual([{ path: '/agents', label: '智能体' }])
  })

  it('缺失金额不显示为零，也不丢失服务端十进制精度', () => {
    expect(formatAmount(null, 'CNY')).toBe('金额未确认')
    expect(formatAmount('1234567890123456.12345678', 'CNY'))
      .toBe('1234567890123456.12345678 CNY')
  })
})
