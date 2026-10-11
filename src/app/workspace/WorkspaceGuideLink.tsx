import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { Link } from 'react-router-dom'
import type { GuideAction } from './workspaceGuides'

export function WorkspaceGuideLink({ action, path, hasWorkspace }: {
  action: GuideAction
  path?: string
  hasWorkspace: boolean
}) {
  return path && hasWorkspace
    ? <Link to={`${path}${action.search ?? ''}`}>{action.label}<ArrowRightOutlined aria-hidden /></Link>
    : <Tooltip title={hasWorkspace ? '当前账号没有此配置入口，请联系渠道管理员' : '请先切换到渠道环境'}>
      <Button disabled>{action.label}</Button>
    </Tooltip>
}
