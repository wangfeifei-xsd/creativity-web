import { App as AntApp, ConfigProvider, Layout, Result, Typography } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { features } from '../features/registry'
import { theme } from './theme'
import { SessionProvider } from './workspace/SessionProvider'
import { WorkspaceHome, WorkspaceLayout } from './workspace/WorkspaceLayout'

export function App() {
  return <ConfigProvider theme={theme} locale={zhCN} button={{ autoInsertSpace: false }}><AntApp><BrowserRouter>
    <Layout className="app-layout"><Layout.Header className="app-header">
      <Typography.Text className="app-brand">一玄智能平台</Typography.Text>
    </Layout.Header><SessionProvider><WorkspaceLayout><Routes>
      <Route path="/" element={<WorkspaceHome />} />
      {features.map(({ navigationKey, path, Component }) => <Route key={navigationKey} path={`${path}/*`} element={<Component />} />)}
      <Route path="*" element={<Result status="404" title="页面不存在" />} />
    </Routes></WorkspaceLayout></SessionProvider></Layout>
  </BrowserRouter></AntApp></ConfigProvider>
}
