import { Card, Flex, Typography } from 'antd'
import type { ReactNode } from 'react'

export function PageContainer({ title, actions, children }: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return <Card className="page-container">
    <Flex align="center" justify="space-between" wrap gap="middle" className="page-heading">
      <Typography.Title level={2}>{title}</Typography.Title>
      {actions}
    </Flex>
    {children}
  </Card>
}
