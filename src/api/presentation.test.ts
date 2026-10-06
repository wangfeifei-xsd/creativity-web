import { describe, expect, it } from 'vitest'
import { formatTimestamp } from './presentation'

describe('统一时间格式', () => {
  it('月份和日期不补零，时分秒补齐两位', () => {
    expect(formatTimestamp('2026-01-02T00:04:05Z')).toBe('2026年1月2日 08:04:05')
  })
  it('保留报表时区及零点格式', () => {
    expect(formatTimestamp('2026-10-05T16:00:00Z')).toBe('2026年10月6日 00:00:00')
    expect(formatTimestamp('2026-10-05T16:00:00Z', 'UTC')).toBe('2026年10月5日 16:00:00')
  })
  it('不编造缺失或无效时间', () => {
    expect(formatTimestamp(null)).toBe('暂无时间')
    expect(formatTimestamp('invalid')).toBe('时间不可用')
  })
})
