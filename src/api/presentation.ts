export function formatTimestamp(value: string | null | undefined, timeZone = 'Asia/Shanghai'): string {
  if (!value) return '暂无时间'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '时间不可用'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone,
  }).format(date)
}

export function formatAmount(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !currency) return '金额未确认'
  // 保留服务端十进制精度，避免通过 JavaScript 浮点数重新计算金额。
  return `${amount} ${currency}`
}
