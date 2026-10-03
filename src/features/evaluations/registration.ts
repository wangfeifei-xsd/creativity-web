import type { FeatureRegistration } from '../registry'
import { EvaluationsPage } from './EvaluationsPage'

export const registration: FeatureRegistration = { navigationKey: 'evaluations', path: '/evaluations', Component: EvaluationsPage }
