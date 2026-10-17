import { Collapse, Select, Space, Tag, Typography } from 'antd'
import { useSession } from '../../app/workspace/context'
import { toolPermissionLabel } from './permissionLabel'

export function ToolPermissionsInput({ value = ['run:create'], onChange, id }: {
  value?: string[]; onChange?: (value: string[]) => void; id?: string
}) {
  const { session } = useSession()
  const additional = value.filter(action => action !== 'run:create')
  return <div id={id}>
    <Tag>执行能力</Tag>
    <Collapse ghost defaultActiveKey={additional.length ? ['additional'] : []} items={[{
      key: 'additional', label: '高级配置', children: <Space orientation="vertical" style={{ width: '100%' }}>
        <Select aria-label="额外调用权限" mode="multiple" allowClear optionFilterProp="label"
          style={{ width: '100%' }} placeholder="选择额外权限" value={additional}
          labelRender={({ value: action }) => toolPermissionLabel(String(action), session.actions)}
          options={session.actions.filter(action => action.action_key !== 'run:create').map(action => ({ value: action.action_key, label: action.label }))}
          onChange={actions => onChange?.(['run:create', ...actions])} />
        <Typography.Text type="secondary">调用者须同时具备执行能力和所选额外权限。</Typography.Text>
      </Space>,
    }]} />
  </div>
}
