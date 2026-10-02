import type { FeatureRegistration } from '../registry'
import { IntegrationsPage } from './IntegrationsPage'

export const registration: FeatureRegistration = {
  navigationKey: 'integrations', path: '/integrations', Component: IntegrationsPage,
}
