import { Button, Empty, Flex, Result, Spin, Typography } from 'antd'
import { ApiError } from '../api/client'

export function LoadingState() {
  return <Flex className="page-state" align="center" justify="center" role="status" aria-label="加载中">
    <Spin size="large" />
  </Flex>
}

export function EmptyState({ message = '暂无数据' }: { message?: string }) {
  return <Flex className="page-state" align="center" justify="center">
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={message} />
  </Flex>
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0
  const title = status === 401 ? '请重新登录' : status === 403 ? '暂无访问权限' : '加载失败'
  return <Result
    status={status === 403 ? '403' : 'error'}
    title={title}
    subTitle={status === 401 || status === 403 ? undefined :
      error instanceof ApiError ? error.message : '请稍后重试'}
    extra={<Flex vertical align="center" gap="middle">
      {onRetry && <Button onClick={onRetry}>重试</Button>}
      {error instanceof ApiError && error.requestId &&
        <Typography.Text type="secondary" copyable={{ text: error.requestId }}>
          请求标识：{error.requestId}
        </Typography.Text>}
    </Flex>}
  />
}
