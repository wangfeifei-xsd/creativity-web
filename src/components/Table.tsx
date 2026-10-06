import { Table as AntTable, Tooltip, type TableProps } from 'antd'
import { useState, type HTMLAttributes } from 'react'

function OverflowCell({ children, onMouseEnter, onMouseLeave, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  const [text, setText] = useState('')
  return <Tooltip title={text} open={!!text}>
    <td {...props} title={undefined} onMouseEnter={event => {
      const cell = event.currentTarget
      const elements = [cell, ...cell.querySelectorAll<HTMLElement>('*')]
      const truncated = elements.some(element => getComputedStyle(element).textOverflow === 'ellipsis'
        && (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight))
      setText(truncated ? cell.innerText.trim() : '')
      onMouseEnter?.(event)
    }} onMouseLeave={event => { setText(''); onMouseLeave?.(event) }}>{children}</td>
  </Tooltip>
}

export function Table<Row extends object>(props: TableProps<Row>) {
  return <AntTable<Row> {...props} components={{ body: { cell: OverflowCell }, ...props.components }} />
}
