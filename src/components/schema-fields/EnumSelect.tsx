import { Select } from 'antd'
import { jsonValueKey } from './schema'

/** 选择器内部使用字符串键，表单始终保存契约中原有的数字、布尔或复杂值。 */
export function EnumSelect({ values, value, onChange, id, disabled }: {
  values: readonly unknown[]; value?: unknown; onChange?: (value: unknown) => void; id?: string; disabled?: boolean
}) {
  const options = values.map(item => ({
    value: jsonValueKey(item),
    label: item === true ? '是' : item === false ? '否' : item === null ? '空值' : item === '' ? '空文本' : typeof item === 'string' ? item : JSON.stringify(item),
  }))
  return <Select id={id} disabled={disabled} allowClear value={value === undefined ? undefined : jsonValueKey(value)} options={options}
    onChange={key => onChange?.(values.find(item => jsonValueKey(item) === key))} />
}
