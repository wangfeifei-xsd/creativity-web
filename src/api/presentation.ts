export function formatTimestamp(value: string | null | undefined, timeZone = 'Asia/Shanghai'): string {
  if (!value) return '暂无时间'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '时间不可用'
  const parts = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone,
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value
  return `${part('year')}年${part('month')}月${part('day')}日 ${part('hour')}:${part('minute')}:${part('second')}`
}

export function formatAmount(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !currency) return '金额未确认'
  // 保留服务端十进制精度，避免通过 JavaScript 浮点数重新计算金额。
  const scientific = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(amount)
  if (scientific) {
    const [, sign, whole, fraction = '', exponentText] = scientific
    const exponent = Number(exponentText)
    if (Math.abs(exponent) <= 100) {
      const digits = whole + fraction
      const point = whole.length + exponent
      amount = /^0+$/.test(digits) ? '0' : sign + (point <= 0
        ? `0.${'0'.repeat(-point)}${digits}`
        : point >= digits.length ? digits.padEnd(point, '0') : `${digits.slice(0, point)}.${digits.slice(point)}`)
    }
  }
  return `${amount} ${currency}`
}
