import type { FeatureRegistration } from '../registry'
import { UsagePage } from './UsagePage'
import { ConcurrencyPage, PlatformLimitsPage } from './LimitsPage'

export const registrations: FeatureRegistration[] = [
  { navigationKey: 'usage', path: '/usage', Component: UsagePage },
  { navigationKey: 'concurrency-limits', path: '/concurrency-limits', Component: ConcurrencyPage },
  { navigationKey: 'platform-limits', path: '/platform-limits', Component: PlatformLimitsPage },
]
