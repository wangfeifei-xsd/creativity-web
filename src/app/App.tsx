import { App as AntApp, ConfigProvider, Layout, Result, Typography } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { features } from '../features/registry'
import { OAuthCallback } from '../features/mcp/OAuthPanel'
import { theme } from './theme'
import { SessionProvider } from './workspace/SessionProvider'
import { WorkspaceHome, WorkspaceLayout } from './workspace/WorkspaceLayout'

export function App() {
  return <ConfigProvider theme={theme} locale={zhCN} button={{ autoInsertSpace: false }}><AntApp><HashRouter>
    <Layout className="app-layout"><SessionProvider><Layout.Header className="app-header">
      <Typography.Text className="app-brand">Creativity</Typography.Text>
    </Layout.Header><WorkspaceLayout><OAuthCallback /><Routes>
      <Route path="/" element={<WorkspaceHome />} />
      {features.map(({ navigationKey, path, Component }) => <Route key={navigationKey} path={`${path}/*`} element={<Component />} />)}
      <Route path="*" element={<Result status="404" title="页面不存在" />} />
    </Routes></WorkspaceLayout></SessionProvider></Layout>
  </HashRouter></AntApp></ConfigProvider>
}
