import { apiClient, type ApiPath } from '../../api/client'

export async function download(path: string) {
  const file = await apiClient.download(path as ApiPath)
  const url = URL.createObjectURL(file.blob)
  const link = document.createElement('a'); link.href = url; link.download = file.name ?? '会话文件'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
