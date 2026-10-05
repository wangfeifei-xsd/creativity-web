import {
  ApiOutlined, ApartmentOutlined, AuditOutlined, BarChartOutlined, CloudServerOutlined,
  ClusterOutlined, ControlOutlined, DatabaseOutlined, ExperimentOutlined, FileTextOutlined,
  LinkOutlined, MessageOutlined, PlayCircleOutlined, RobotOutlined, SafetyOutlined,
  SlidersOutlined, TeamOutlined, ThunderboltOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { MenuProps } from 'antd'
import type { resolveNavigation } from '../../features/navigation'

type NavigationEntry = ReturnType<typeof resolveNavigation>[number]

const icons: Record<string, ReactNode> = {
  'model-providers': <CloudServerOutlined aria-hidden />,
  models: <ClusterOutlined aria-hidden />,
  'model-routes': <ApartmentOutlined aria-hidden />,
  agents: <RobotOutlined aria-hidden />,
  prompts: <FileTextOutlined aria-hidden />,
  tools: <ToolOutlined aria-hidden />,
  'mcp-connections': <ApiOutlined aria-hidden />,
  skills: <ThunderboltOutlined aria-hidden />,
  runs: <PlayCircleOutlined aria-hidden />,
  conversations: <MessageOutlined aria-hidden />,
  memories: <DatabaseOutlined aria-hidden />,
  evaluations: <ExperimentOutlined aria-hidden />,
  integrations: <LinkOutlined aria-hidden />,
  usage: <BarChartOutlined aria-hidden />,
  'concurrency-limits': <SlidersOutlined aria-hidden />,
  channels: <ApartmentOutlined aria-hidden />,
  accounts: <UserOutlined aria-hidden />,
  roles: <TeamOutlined aria-hidden />,
  menus: <ControlOutlined aria-hidden />,
  'platform-usage': <BarChartOutlined aria-hidden />,
  members: <TeamOutlined aria-hidden />,
  'resource-grants': <SafetyOutlined aria-hidden />,
  'platform-limits': <ControlOutlined aria-hidden />,
  'audit-events': <AuditOutlined aria-hidden />,
}

export function navigationItems(entries: NavigationEntry[]): NonNullable<MenuProps['items']> {
  type Node = { key: string; label: string; type?: 'group'; icon?: ReactNode; children?: Node[] }
  const roots: Node[] = []
  // 顺序、层级和名称均使用服务端返回值，前端只补充图标。
  for (const entry of entries) {
    let children = roots
    entry.ancestors.forEach((parent, index) => {
      let node = children.find(item => item.key === parent.key)
      if (!node) {
        node = { key: parent.key, label: parent.label, ...(index === 0 ? { type: 'group' as const } : {}), children: [] }
        children.push(node)
      }
      children = node.children!
    })
    children.push({ key: entry.path, label: entry.label, icon: navigationIcon(entry.navigationKey) })
  }
  function item(node: Node): NonNullable<MenuProps['items']>[number] {
    if (node.type === 'group') return { key: node.key, label: node.label, type: 'group', children: node.children?.map(item) }
    if (node.children) return { key: node.key, label: node.label, children: node.children.map(item) }
    return { key: node.key, label: node.label, icon: node.icon }
  }
  return roots.map(item)
}

export function navigationIcon(key: string) {
  return icons[key] ?? <ClusterOutlined aria-hidden />
}
