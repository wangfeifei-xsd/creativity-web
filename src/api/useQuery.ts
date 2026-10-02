import { useCallback, useEffect, useState } from 'react'
import { apiClient, type ApiPath } from './client'

export function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

// 每个页面实例独享结果；卸载、范围切换或筛选变化均废弃迟到响应。
export function useQuery<T>(path: ApiPath | null) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ path: typeof path; data?: T; error?: unknown }>({ path })
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    void apiClient.request<T>(path, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setState({ path, data }) },
      error => { if (!controller.signal.aborted && !isAbort(error)) setState({ path, error }) },
    )
    return () => controller.abort()
  }, [path, attempt])
  const reload = useCallback(() => { setState({ path }); setAttempt(n => n + 1) }, [path])
  return { data: state.path === path ? state.data : undefined,
    error: state.path === path ? state.error : undefined, reload }
}
