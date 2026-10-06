export function resourceSummary(resource_id: string, name: string, published = false) {
  return { resource_id, name, status: { value: published ? 'PUBLISHED' : 'UNPUBLISHED', label: published ? '已发布' : '未发布', tone: published ? 'success' : 'default' },
    revision: 1, configuration_revision: 1, reference_count: 0, usage_count: 0, updated_at: '2026-10-07T00:00:00Z',
    actions: [{ action_key: 'edit', label: '修改', enabled: true, disabled_reason: null as string | null },
      { action_key: published ? 'unpublish' : 'publish', label: published ? '下架' : '发布', enabled: true, disabled_reason: null as string | null },
      { action_key: 'delete', label: '删除', enabled: true, disabled_reason: null as string | null }] }
}
