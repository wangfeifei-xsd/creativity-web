import { Input, InputNumber, Select, Typography } from 'antd'
import type { SchemaObject } from '../../components/schema-fields/schema'
import { displayValue } from './flow-fields'

type Props = { schema: SchemaObject; value?: string; onChange?: (value: string) => void; id?: string; disabled?: boolean; path?: string }
export function FlowValueInput({ schema, value, onChange, id, disabled, path }: Props) {
  let parsed: unknown
  let valid = true
  try { parsed = value === undefined || value === '' ? undefined : JSON.parse(value) } catch { valid = false }
  const enums = Array.isArray(schema.enum) ? schema.enum : Object.hasOwn(schema, 'const') ? [schema.const] : undefined
  if (valid && enums && (value === undefined || enums.some(item => JSON.stringify(item) === value))) return <Select id={id} disabled={disabled} value={value}
    options={enums.map(item => ({ value: JSON.stringify(item), label: displayValue(item, path) }))} onChange={onChange} />
  if (valid && schema.type === 'boolean' && (parsed === undefined || typeof parsed === 'boolean')) return <Select id={id} disabled={disabled} value={value}
    options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} onChange={onChange} />
  if (valid && schema.type === 'string' && (parsed === undefined || typeof parsed === 'string')) return <Input id={id} disabled={disabled} value={parsed as string | undefined} onChange={event => onChange?.(JSON.stringify(event.target.value))} />
  if (valid && ['number', 'integer'].includes(String(schema.type)) && (parsed === undefined || typeof parsed === 'number')) return <InputNumber id={id} disabled={disabled} value={parsed as number | undefined}
    precision={schema.type === 'integer' ? 0 : undefined} style={{ width: '100%' }} onChange={next => onChange?.(next == null ? '' : JSON.stringify(next))} />
  return <><Input.TextArea id={id} disabled={disabled} value={value} onChange={event => onChange?.(event.target.value)} autoSize={{ minRows: 2, maxRows: 8 }} spellCheck={false} />
    <Typography.Text type="secondary">{valid ? '复杂值使用 JSON 格式' : '请修正 JSON 格式'}</Typography.Text></>
}
