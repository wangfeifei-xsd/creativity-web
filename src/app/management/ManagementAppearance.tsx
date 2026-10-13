import { App, ConfigProvider } from 'antd'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ManagementAppearanceContext } from './context'
import { managementTheme } from './theme'
import './management.css'

export function ManagementAppearance({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  // 首页、工作台与智能体独立工作区沿用原有设计，管理页和其浮层统一应用新主题。
  const enabled = !/^\/(?:workbench\/?|agents\/.+)?$/.test(pathname)
  return <ManagementAppearanceContext value={enabled}>
    <ConfigProvider theme={enabled ? managementTheme : undefined}
      modal={enabled ? { classNames: { root: 'management-overlay' }, centered: true } : undefined}
      drawer={enabled ? { classNames: { root: 'management-overlay' } } : undefined}>
      <App component={false}>{children}</App>
    </ConfigProvider>
  </ManagementAppearanceContext>
}
