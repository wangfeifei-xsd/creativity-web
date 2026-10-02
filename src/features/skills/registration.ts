import type { FeatureRegistration } from '../registry'
import { SkillsPage } from './SkillsPage'

export const registration: FeatureRegistration = {
  navigationKey: 'skills', path: '/skills', Component: SkillsPage,
}
