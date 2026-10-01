import type { ComponentType } from 'react'

export interface FeatureRegistration {
  navigationKey: string
  path: string
  Component: ComponentType
}

// 只登记组件与导航键的映射；可见菜单和权限由后续服务端接口返回。
export const features: readonly FeatureRegistration[] = []
