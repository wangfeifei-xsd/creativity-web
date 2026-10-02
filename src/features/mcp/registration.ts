import type { FeatureRegistration } from '../registry'
import { McpPage } from './McpPage'

export const registration: FeatureRegistration = {
  navigationKey: 'mcp-connections', path: '/mcp-connections', Component: McpPage,
}
