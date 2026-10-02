import type { FeatureRegistration } from '../registry'
import { MemoriesPage } from './MemoriesPage'

export const registration: FeatureRegistration = {
  navigationKey: 'memories', path: '/memories', Component: MemoriesPage,
}
