import type { FeatureRegistration } from '../registry'
import { AgentsPage } from './AgentsPage'

export const registration: FeatureRegistration = { navigationKey: 'agents', path: '/agents', Component: AgentsPage }
