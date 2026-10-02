import type { FeatureRegistration } from '../registry'
import { ConversationsPage } from './ConversationsPage'

export const registration: FeatureRegistration = {
  navigationKey: 'conversations', path: '/conversations', Component: ConversationsPage,
}
