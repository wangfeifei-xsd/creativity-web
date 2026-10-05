import { Button, Empty, Flex, Result, Spin } from 'antd'
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
  return <Result
    status={status === 403 ? '403' : status === 404 ? '404' : 'error'}
    title={error instanceof Error ? error.message : '加载失败，请稍后重试'}
    extra={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
  />
}
