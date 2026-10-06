export type Option = { value: string; label: string }
export type UsageOptions = { models: Option[]; keys: Option[]; agents: Option[]; actors: Option[] }
export const periods = [{ value: 'minute', label: '每分钟' }, { value: 'hour', label: '每小时' }, { value: 'day', label: '每天' }, { value: 'month', label: '每月' }]
export const purposes = [{ value: 'production', label: '正式调用' }, { value: 'debug', label: '调试' }, { value: 'evaluation', label: '评测' }]
export const zones = ['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London'].map(value => ({ value, label: value === 'Asia/Shanghai' ? '北京时间' : value === 'UTC' ? '协调世界时' : value === 'America/New_York' ? '纽约时间' : '伦敦时间' }))
export function localTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
