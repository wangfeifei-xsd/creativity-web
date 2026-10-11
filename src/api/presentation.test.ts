import { describe, expect, it } from 'vitest'
import { formatAmount } from './presentation'

describe('金额展示', () => {
  it('展开科学计数法而不丢失十进制精度', () => {
    expect(formatAmount('1.234567890123456789E-8', 'USD')).toBe('0.00000001234567890123456789 USD')
    expect(formatAmount('-1.25e+3', 'CNY')).toBe('-1250 CNY')
    expect(formatAmount('0E-7', 'USD')).toBe('0 USD')
  })

  it('保留普通金额精度并明确区分缺失值', () => {
    expect(formatAmount('0.00011000', 'USD')).toBe('0.00011000 USD')
    expect(formatAmount(null, 'USD')).toBe('金额未确认')
    expect(formatAmount('0', null)).toBe('金额未确认')
  })
})
