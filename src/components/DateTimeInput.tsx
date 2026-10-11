import { DatePicker, type DatePickerProps } from 'antd'
import dayjs from 'dayjs'

type Props = Omit<DatePickerProps, 'value' | 'onChange' | 'defaultValue' | 'format' | 'showTime' | 'multiple'> & {
  value?: string | null; onChange?: (value: string | undefined) => void
}

export function DateTimeInput({ value, onChange, onInputCapture, style, ...props }: Props) {
  const date = value ? dayjs(value) : null
  return <div style={{ display: 'contents' }}
    onInputCapture={event => {
      // 时间选择器确认模式不会提交键盘清空，只同步实际输入的空值，避免隐藏旧筛选条件。
      if (event.target instanceof HTMLInputElement && !event.target.value.trim()) onChange?.(undefined)
      onInputCapture?.(event)
    }}>
    <DatePicker {...props} style={{ width: 252, maxWidth: '100%', ...style }}
      value={date?.isValid() ? date : null} format="YYYY年M月D日 HH:mm:ss" showTime multiple={false}
      onChange={date => { if (!Array.isArray(date)) onChange?.(date?.format('YYYY-MM-DDTHH:mm:ss')) }} />
  </div>
}
