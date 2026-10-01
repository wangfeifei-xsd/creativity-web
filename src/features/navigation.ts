import type { components } from '../api/generated/schema'
import type { FeatureRegistration } from './registry'

export function resolveNavigation(
  items: readonly components['schemas']['NavigationItem'][],
  registry: readonly FeatureRegistration[],
) {
  const registrations = new Map(registry.map((entry) => [entry.navigationKey, entry]))
  const seen = new Set<string>()
  return items.flatMap((item) => {
    const feature = registrations.get(item.navigation_key)
    if (!feature || seen.has(item.navigation_key)) return []
    seen.add(item.navigation_key)
    return [{ ...feature, label: item.label }]
  })
}
