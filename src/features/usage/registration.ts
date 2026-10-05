import type { FeatureRegistration } from '../registry'
import { UsagePage } from './UsagePage'
import { PlatformUsagePage } from './PlatformUsagePage'
import { ConcurrencyPage, PlatformLimitsPage } from './LimitsPage'

export const registrations: FeatureRegistration[] = [
  { navigationKey: 'platform-usage', path: '/platform-usage', Component: PlatformUsagePage },
  { navigationKey: 'usage', path: '/usage', Component: UsagePage },
  { navigationKey: 'concurrency-limits', path: '/concurrency-limits', Component: ConcurrencyPage },
  { navigationKey: 'platform-limits', path: '/platform-limits', Component: PlatformLimitsPage },
]
