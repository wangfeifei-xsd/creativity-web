import type { FeatureRegistration } from '../registry'
import { UsagePage } from './UsagePage'

export const registration: FeatureRegistration = { navigationKey: 'usage', path: '/usage', Component: UsagePage }
