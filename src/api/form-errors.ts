import type { FormInstance } from 'antd'
import { ApiError } from './client'

export function applyFormErrors(form: Pick<FormInstance, 'setFields'>, error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  const fields = error.fields.filter((field) => field.path.length > 0)
  if (!fields.length) return false
  form.setFields(fields.map((field) => ({ name: field.path, errors: [field.message] })))
  return true
}
