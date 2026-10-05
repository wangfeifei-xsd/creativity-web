import {
  ApiOutlined, ApartmentOutlined, AuditOutlined, BarChartOutlined, CloudServerOutlined,
  ClusterOutlined, ControlOutlined, DatabaseOutlined, ExperimentOutlined, FileTextOutlined,
  LinkOutlined, MessageOutlined, PlayCircleOutlined, RobotOutlined, SafetyOutlined,
  SlidersOutlined, TeamOutlined, ThunderboltOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { resolveNavigation } from '../../features/navigation'

type NavigationEntry = ReturnType<typeof resolveNavigation>[number]

// 仅补充菜单分组和图标，实际入口与名称始终来自服务端导航。
const groups = [
  { key: 'configuration', label: '模型与能力', keys: ['model-providers', 'models', 'model-routes', 'agents', 'prompts', 'tools', 'mcp-connections', 'skills'] },
  { key: 'execution', label: '运行与数据', keys: ['runs', 'conversations', 'memories', 'evaluations'] },
  { key: 'integration', label: '接入与用量', keys: ['integrations', 'usage', 'concurrency-limits'] },
  { key: 'organization', label: '组织与权限', keys: ['channels', 'accounts', 'members', 'resource-grants'] },
  { key: 'governance', label: '平台治理', keys: ['platform-limits', 'audit-events'] },
]

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
  members: <TeamOutlined aria-hidden />,
  'resource-grants': <SafetyOutlined aria-hidden />,
  'platform-limits': <ControlOutlined aria-hidden />,
  'audit-events': <AuditOutlined aria-hidden />,
}

export function groupNavigation(entries: NavigationEntry[]) {
  const knownKeys = new Set(groups.flatMap(group => group.keys))
  return [
    ...groups.map(group => ({ ...group, entries: entries.filter(entry => group.keys.includes(entry.navigationKey)) })),
    { key: 'workspace', label: '工作区', entries: entries.filter(entry => !knownKeys.has(entry.navigationKey)) },
  ].filter(group => group.entries.length > 0)
}

export function navigationIcon(key: string) {
  return icons[key] ?? <ClusterOutlined aria-hidden />
}
