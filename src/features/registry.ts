import type { ComponentType } from 'react'
import { AccountsPage } from './accounts/AccountsPage'
import { ChannelsPage } from './channels/ChannelsPage'
import { MembersPage, GrantsPage } from './members/MembersPage'
import { AuditPage } from './audit/AuditPage'

export interface FeatureRegistration {
  navigationKey: string
  path: string
  Component: ComponentType
}

// 仅登记组件与路径。目录中的独立模块可导出 registration 或 registrations 接入。
const modules = import.meta.glob<{ registration?: FeatureRegistration; registrations?: FeatureRegistration[] }>(
  './*/registration.ts', { eager: true },
)
export const features: readonly FeatureRegistration[] = [
  { navigationKey: 'channels', path: '/channels', Component: ChannelsPage },
  { navigationKey: 'accounts', path: '/accounts', Component: AccountsPage },
  { navigationKey: 'members', path: '/members', Component: MembersPage },
  { navigationKey: 'resource-grants', path: '/resource-grants', Component: GrantsPage },
  { navigationKey: 'audit-events', path: '/audit-events', Component: AuditPage },
  ...Object.values(modules).flatMap(module => module.registrations ?? (module.registration ? [module.registration] : [])),
]
