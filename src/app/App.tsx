import { App as AntApp, ConfigProvider, Layout, Result, Typography } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { EmptyState } from '../components/States'
import { PageContainer } from '../components/PageContainer'
import { features } from '../features/registry'
import { theme } from './theme'
import type { components } from '../api/generated/schema'
import { resolveNavigation } from '../features/navigation'

export function App({ navigation = [] }: {
  navigation?: readonly components['schemas']['NavigationItem'][]
}) {
  const visibleFeatures = resolveNavigation(navigation, features)
  return <ConfigProvider theme={theme} locale={zhCN}>
    <AntApp>
      <BrowserRouter>
        <Layout className="app-layout">
          <Layout.Header className="app-header">
            <Typography.Text className="app-brand">一玄智能平台</Typography.Text>
          </Layout.Header>
          <Layout.Content className="app-content">
            <Routes>
              <Route path="/" element={<PageContainer title="工作台"><EmptyState /></PageContainer>} />
              {visibleFeatures.map(({ navigationKey, path, Component }) =>
                <Route key={navigationKey} path={path} element={<Component />} />)}
              <Route path="*" element={<Result status="404" title="页面不存在" />} />
            </Routes>
          </Layout.Content>
        </Layout>
      </BrowserRouter>
    </AntApp>
  </ConfigProvider>
}
