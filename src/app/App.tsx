import { App as AntApp, ConfigProvider, Layout, Result } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { createHashRouter, Route, RouterProvider, Routes } from 'react-router-dom'
import { features } from '../features/registry'
import { OAuthCallback } from '../features/mcp/OAuthPanel'
import { theme } from './theme'
import { SessionProvider } from './workspace/SessionProvider'
import { WorkspaceHome, WorkspaceLayout } from './workspace/WorkspaceLayout'

const router = createHashRouter([{ path: '*', element: <WorkspaceRoutes /> }])

function WorkspaceRoutes() {
  return <Layout className="app-layout"><SessionProvider><WorkspaceLayout><OAuthCallback /><Routes>
      <Route path="/" element={<WorkspaceHome />} />
      {features.map(({ navigationKey, path, Component }) => <Route key={navigationKey} path={`${path}/*`} element={<Component />} />)}
      <Route path="*" element={<Result status="404" title="页面不存在" />} />
  </Routes></WorkspaceLayout></SessionProvider></Layout>
}

export function App() {
  return <ConfigProvider theme={theme} locale={zhCN} button={{ autoInsertSpace: false }}><AntApp>
    <RouterProvider router={router} />
  </AntApp></ConfigProvider>
}
