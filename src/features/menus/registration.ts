import type { FeatureRegistration } from '../registry'
import { MenusPage } from './MenusPage'

export const registration: FeatureRegistration = { navigationKey: 'menus', path: '/menus', Component: MenusPage }
