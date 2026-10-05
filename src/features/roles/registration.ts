import type { FeatureRegistration } from '../registry'
import { RolesPage } from './RolesPage'

export const registration: FeatureRegistration = { navigationKey: 'roles', path: '/roles', Component: RolesPage }
