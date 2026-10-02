import type { FeatureRegistration } from '../registry'
import { PromptsPage } from './PromptsPage'

export const registration: FeatureRegistration = { navigationKey: 'prompts', path: '/prompts', Component: PromptsPage }
