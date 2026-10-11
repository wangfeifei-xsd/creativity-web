import { ApiOutlined, FileTextOutlined, ToolOutlined } from '@ant-design/icons'
import { Empty, Tag } from 'antd'
import { Table } from '../../components/Table'
import { AgentSection } from './AgentWorkspace'
import { dependencyNames } from './types'

type Resource = { version_id: string; resource_type: string; name: string }
const modelTypes = new Set(['model_route', 'model', 'model_connection'])

export function AgentDependencies({ resources }: { resources: Resource[] }) {
  const groups = [
    { title: '模型', icon: <ApiOutlined aria-hidden />, items: resources.filter(item => modelTypes.has(item.resource_type)) },
    { title: '提示词', icon: <FileTextOutlined aria-hidden />, items: resources.filter(item => item.resource_type === 'prompt') },
    { title: '工具与技能', icon: <ToolOutlined aria-hidden />, items: resources.filter(item => !modelTypes.has(item.resource_type) && item.resource_type !== 'prompt') },
  ]
  return <div className="agent-dependency-groups">{groups.map(group => <AgentSection key={group.title} title={group.title} icon={group.icon} extra={<Tag>{group.items.length} 项</Tag>}>
    <Table<Resource> rowKey="version_id" pagination={false} dataSource={group.items} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未设置" /> }} columns={[
      { title: '类型', width: 120, render: (_, item) => <Tag color={modelTypes.has(item.resource_type) ? 'blue' : item.resource_type === 'prompt' ? 'purple' : 'default'}>{dependencyNames[item.resource_type] ?? '资源不可用'}</Tag> },
      { title: '资源', dataIndex: 'name', ellipsis: true },
    ]} />
  </AgentSection>)}</div>
}
