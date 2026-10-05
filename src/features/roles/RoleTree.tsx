import { Input, Space, Tree, Typography } from 'antd'
import { useState } from 'react'
import { menuTree, type MenuNode } from './types'

export function RoleTree({ nodes, value = [], onChange, disabled }: { nodes: MenuNode[]; value?: string[]; onChange?: (keys: string[]) => void; disabled?: boolean }) {
  const [search, setSearch] = useState('')
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <Input.Search aria-label="搜索菜单或动作" placeholder="搜索菜单或动作" allowClear onChange={e => setSearch(e.target.value)} />
    <div style={{ maxHeight: 320, overflow: 'auto', width: '100%' }}><Tree key={search} checkable checkStrictly defaultExpandAll disabled={disabled}
      checkedKeys={value} treeData={menuTree(nodes, search)}
      onCheck={keys => onChange?.((Array.isArray(keys) ? keys : keys.checked).map(String))} /></div>
    <Typography.Text type="secondary">菜单控制入口，按钮控制操作权限，请分别勾选。</Typography.Text>
  </Space>
}
