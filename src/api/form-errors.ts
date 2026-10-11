import type { FormInstance } from 'antd'
import { ApiError } from './client'

export function isFormValidationError(error: unknown): boolean {
  // antd 已在字段旁展示校验结果，无需再提示一次操作失败。
  return typeof error === 'object' && error !== null && 'errorFields' in error
    && Array.isArray(error.errorFields) && error.errorFields.length > 0
}

/** 重试提交前清除服务端或手动设置的错误，避免无前端规则的字段保留旧提示。 */
export function clearFormErrors(form: Pick<FormInstance, 'getFieldsError' | 'setFields'>): void {
  form.setFields(form.getFieldsError().map(({ name }) => ({ name, errors: [] })))
}

export function applyFormErrors(form: Pick<FormInstance, 'setFields'>, error: unknown,
  mapPath: (path: (string | number)[]) => (string | number)[] = path => path): boolean {
  if (!(error instanceof ApiError)) return false
  const fields = error.fields.map(field => ({ ...field, path: mapPath(field.path) })).filter(field => field.path.length > 0)
  if (!fields.length) return false
  const grouped = new Map<string, { name: (string | number)[]; errors: string[] }>()
  for (const field of fields) {
    const key = JSON.stringify(field.path)
    const entry = grouped.get(key) ?? { name: field.path, errors: [] }
    if (!entry.errors.includes(field.message)) entry.errors.push(field.message)
    grouped.set(key, entry)
  }
  form.setFields([...grouped.values()])
  return true
}
