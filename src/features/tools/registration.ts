import type { FeatureRegistration } from '../registry'
import { ToolsPage } from './ToolsPage'

export const registration: FeatureRegistration = {
  navigationKey: 'tools', path: '/tools', Component: ToolsPage,
}
