import { apiClient } from './client'
import type { components } from './generated/schema'

export async function uploadFile(file: File): Promise<components['schemas']['UploadedFile']> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('请选择不超过 20 MiB 的文件')
  const body = new FormData()
  body.append('file', file)
  return apiClient.request('/admin/v1/files/upload', { method: 'POST', body })
}
