export function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value?.trim()) return fallback
  try { return JSON.parse(value) }
  catch { throw new Error('JSON 格式不正确，请检查括号、引号和逗号') }
}

export function jsonObject(value: unknown): Record<string, unknown> {
  const result = parseJson(value ? String(value) : undefined, {})
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('参数必须为 JSON 对象')
  return result as Record<string, unknown>
}
