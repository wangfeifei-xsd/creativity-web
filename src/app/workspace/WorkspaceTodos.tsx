import { Alert, Button, Card, Empty, Flex, Pagination, Space, Spin, Tag, Typography, theme } from 'antd'
import { ArrowRightOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { useSession } from './context'

export function WorkspaceTodos() {
  const { session } = useSession()
  const { token } = theme.useToken()
  const [page, setPage] = useState(1)
  const query = useQuery<Schema<'ScheduleTodoList'>>(`/admin/v1/schedule-todos?page=${page}&page_size=5`, true)
  const { reload } = query
  const canReadRuns = session.actions.some(action => action.action_key === 'run:read')
    && session.navigation.some(item => item.navigation_key === 'runs')

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') reload() }
    const interval = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [reload])

  return <section aria-label="待办事项" className="workspace-todos" style={{
    '--todo-accent': token.orange6,
    '--todo-border': token.orange3,
    '--todo-icon-bg': token.orange1,
    '--todo-bg': token.orange1,
    '--todo-count-bg': token.colorPrimaryBg,
  } as CSSProperties}>
    <Flex justify="space-between" align="center" wrap gap={12} className="workspace-todos-heading">
      <Typography.Title level={3} aria-label={query.data ? `待办事项（${query.data.total}）` : '待办事项'}>
        待办事项{query.data && <span className="workspace-todos-count" aria-hidden>{query.data.total}</span>}
      </Typography.Title>
      <Button icon={<ReloadOutlined aria-hidden />} onClick={reload}>刷新待办</Button>
    </Flex>
    <ErrorNotice error={query.error} />
    {!query.data && !query.error && <Spin aria-label="正在加载待办" />}
    {query.data?.total === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办事项" />}
    <Flex vertical gap={12}>
      {query.data?.items.map(item => <Card key={item.id} size="small" className="workspace-todo-card">
        <div className="workspace-todo-content">
          <span className="workspace-todo-icon"><WarningOutlined aria-hidden /></span>
          <div className="workspace-todo-copy">
            <Space wrap size={[12, 8]} className="workspace-todo-title">
              <Typography.Text strong>{item.name}</Typography.Text><Tag color="error">失败自动暂停</Tag>
              <Typography.Text type="secondary">连续失败 {item.consecutive_failures} / {item.failure_threshold} 次</Typography.Text>
            </Space>
            <Typography.Paragraph className="workspace-todo-reason" type="secondary">
              {item.message.replace(/^连续失败 \d+ 次，已自动暂停。\s*/, '')}
            </Typography.Paragraph>
          </div>
          <Space wrap size={20} className="workspace-todo-actions">
            {item.run_id && canReadRuns && <Link to={`/runs/${encodeURIComponent(item.run_id)}`}>查看失败运行</Link>}
            <Button type="primary" className="workspace-todo-primary" href={`#/integrations?tab=automation&section=schedules&schedule_id=${encodeURIComponent(item.id)}`}
              icon={<ArrowRightOutlined aria-hidden />} iconPlacement="end">去处理</Button>
          </Space>
        </div>
      </Card>)}
    </Flex>
    {query.data && query.data.total > 0 && query.data.items.length === 0 && <Alert type="info" title="本页待办已处理，请返回前页查看" />}
    {query.data && (query.data.total > 5 || page > 1) && <Pagination current={page} pageSize={5} total={query.data.total}
      showSizeChanger={false} onChange={setPage} style={{ marginTop: 12 }} />}
  </section>
}
