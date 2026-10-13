import { Table as AntTable, Tooltip, type TableProps } from 'antd'
import { useState, type HTMLAttributes } from 'react'
import type { ColumnsType } from 'antd/es/table'
import { useManagementAppearance } from '../app/management/context'

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
  const managementAppearance = useManagementAppearance()
  const columns = managementAppearance && props.columns ? readableColumns(props.columns) : props.columns
  const width = columns?.reduce((sum, column) => sum + (typeof column.width === 'number' ? column.width : 144), 0) ?? 0
  return <AntTable<Row> {...props} columns={columns}
    className={[props.className, managementAppearance ? 'management-table' : ''].filter(Boolean).join(' ')}
    scroll={managementAppearance && width ? { ...props.scroll, x: typeof props.scroll?.x === 'string' ? props.scroll.x : Math.max(width, Number(props.scroll?.x) || 0) } : props.scroll}
    components={{ body: { cell: OverflowCell }, ...props.components }} />
}

// 管理表格按字段语义提供可读列宽，调用方的显式列配置继续优先。
function readableColumns<Row extends object>(columns: ColumnsType<Row>): ColumnsType<Row> {
  return columns.map((column, index) => {
    if ('children' in column) return { ...column, children: readableColumns(column.children) }
    const title = typeof column.title === 'string' ? column.title : ''
    const actions = title === '操作' && index === columns.length - 1
    const timestamp = /时间|最近验证|最近检查|最近测试|有效截止|首次触发/.test(title)
    const description = /用途|描述|操作权限|实际授权|必要授权|变更字段|原因|说明|^动作$/.test(title)
    const compact = /状态|数量|次数|^类型$|^来源$|^环境$|^周期$|^排序$|^显示$|^剩余$|^上限$|^限额$/.test(title)
    const width = actions ? 208 : timestamp ? 208 : description ? 260 : index === 0 ? 208 : compact ? 112 : 144
    return { ...column, width: column.width ?? width,
      ellipsis: column.ellipsis ?? (description ? { showTitle: false } : undefined),
      fixed: column.fixed ?? (actions ? 'right' : undefined),
      className: [column.className, actions ? 'management-table-actions' : timestamp ? 'management-table-time' : ''].filter(Boolean).join(' ') }
  })
}
