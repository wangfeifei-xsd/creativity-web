import type { FeatureRegistration } from '../registry'
import { RunsPage } from './RunsPage'
export const registration: FeatureRegistration = { navigationKey: 'runs', path: '/runs', Component: RunsPage }
