import type { Content, Variable } from './types'

type EditorVariable = Omit<Variable, 'default'> & { default_json?: string }
export type EditorValues = Omit<Content, 'variables'> & { variables: EditorVariable[] }
export function editorValues(content: Content): EditorValues {
  return { ...content, variables: (content.variables ?? []).map(({ default: initial, ...variable }) => ({
    ...variable, default_json: initial == null ? '' : JSON.stringify(initial),
  })) }
}
export function fromEditor(values: EditorValues): Content {
  return { ...values, variables: values.variables.map(({ default_json, ...variable }) => {
    let initial: Variable['default'] = null
    if (default_json?.trim()) {
      try { initial = JSON.parse(default_json) as Variable['default'] }
      catch { throw new Error(`${variable.display_name || '变量'}：默认值须为 JSON 值，文本请使用双引号`) }
    }
    return { ...variable, default: initial }
  }) }
}
