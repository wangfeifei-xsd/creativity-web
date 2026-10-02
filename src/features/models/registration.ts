import type { FeatureRegistration } from '../registry'
import { ModelsPage } from './ModelsPage'
import { ProvidersPage } from './ProvidersPage'
import { RoutesPage } from './RoutesPage'

export const registrations: FeatureRegistration[] = [
  { navigationKey: 'model-providers', path: '/model-providers', Component: ProvidersPage },
  { navigationKey: 'models', path: '/models', Component: ModelsPage },
  { navigationKey: 'model-routes', path: '/model-routes', Component: RoutesPage },
]
