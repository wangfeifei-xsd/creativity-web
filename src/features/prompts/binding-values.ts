import type { Variable, JsonValue } from './types'

export type BindingValues = { input?: Record<string, unknown> }
export function parseBindings(variables: Variable[], values: BindingValues): Record<string, JsonValue> {
  return Object.fromEntries(variables.filter(variable => variable.source === 'input').flatMap(variable => {
    const value = values.input?.[variable.name]
    if (value == null || value === '') return []
    if (variable.type === 'object' || variable.type === 'array') {
      try { return [[variable.name, JSON.parse(String(value)) as JsonValue]] }
      catch { throw new Error(`${variable.display_name}：请填写有效的 JSON`) }
    }
    return [[variable.name, value as JsonValue]]
  }))
}
