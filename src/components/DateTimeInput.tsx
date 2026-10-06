import { DatePicker, type DatePickerProps } from 'antd'
import dayjs from 'dayjs'

type Props = Omit<DatePickerProps, 'value' | 'onChange' | 'defaultValue' | 'format' | 'showTime' | 'multiple'> & {
  value?: string | null; onChange?: (value: string | undefined) => void
}

export function DateTimeInput({ value, onChange, style, ...props }: Props) {
  const date = value ? dayjs(value) : null
  return <DatePicker {...props} style={{ width: 252, maxWidth: '100%', ...style }}
    value={date?.isValid() ? date : null} format="YYYY年M月D日 HH:mm:ss" showTime multiple={false}
    onChange={date => { if (!Array.isArray(date)) onChange?.(date?.format('YYYY-MM-DDTHH:mm:ss')) }} />
}
