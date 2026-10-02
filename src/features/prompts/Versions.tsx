import { Alert, Button, Descriptions, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { StatusTag } from '../../components/StatusTag'
import { ErrorState, LoadingState } from '../../components/States'
import { diffDisplay, errorText, send, type Prompt, type Schema, type Version } from './types'

export function References({ promptId }: { promptId: string }) {
  const query = useQuery<Schema<'PromptReference'>[]>(`/admin/v1/prompts/${promptId}/references`)
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  return <ReferenceTable rows={query.data} />
}
function ReferenceTable({ rows }: { rows: Schema<'PromptReference'>[] }) {
  return <Table rowKey={row => `${row.source_version_id}-${row.target_version_id}`} dataSource={rows} columns={[
    { title: '引用资源', render: (_, row) => row.source_name || '名称不可用' },
    { title: '类型', dataIndex: 'resource_type_label' }, { title: '资源版本', dataIndex: 'version_label' },
    { title: '状态', render: (_, row) => <StatusTag status={row.status} /> },
    { title: '绑定的提示词版本', dataIndex: 'target_version_label' },
  ]} />
}
export function PromptVersions({ prompt, versions, current, onChanged }: {
  prompt: Prompt; versions: Version[]; current: Version; onChanged: () => void
}) {
  const [previous, setPrevious] = useState<string>()
  const [comparison, setComparison] = useState<Schema<'PromptCompareView'>>()
  const [release, setRelease] = useState<{ version: Version; operation: 'publish' | 'rollback' }>()
  const [form] = Form.useForm<{ note: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function compare() {
    if (!previous) return
    setBusy(true); setError(undefined)
    try { setComparison(await apiClient.request(`/admin/v1/prompt-versions/${current.version.version_id}/compare/${previous}`)) }
    catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    {error && <Alert type="error" title={error} />}
    <Descriptions items={prompt.releases.map(mapping => ({ key: mapping.environment, label: `${mapping.environment_label}环境`, children: `${mapping.version_label} · ${formatTimestamp(mapping.published_at)}` }))} />
    <Table rowKey={row => row.version.version_id} dataSource={versions} columns={[
      { title: '版本', render: (_, row) => row.version.version_label },
      { title: '状态', render: (_, row) => <StatusTag status={row.status} /> },
      { title: '修订', dataIndex: 'revision' },
      { title: '操作', render: (_, row) => <Space wrap>
        {row.actions.some(action => action.action_key === 'release:publish') && row.version.state !== 'RETIRED' && <>
          <Button onClick={() => { setError(undefined); setRelease({ version: row, operation: 'publish' }) }}>发布</Button>
          {row.version.state === 'PUBLISHED' && <Button onClick={() => { setError(undefined); setRelease({ version: row, operation: 'rollback' }) }}>回滚到此版本</Button>}
          <Button danger onClick={() => Modal.confirm({ title: `退役 ${row.version.version_label}`, content: '正在被引用或发布的版本无法退役。', onOk: async () => {
            try { await send(`/admin/v1/prompt-versions/${row.version.version_id}/retire`, { revision: row.revision }); onChanged() }
            catch (error) { setError(errorText(error)); throw error }
          } })}>退役</Button>
        </>}
      </Space> },
    ]} />
    <Space wrap><Select aria-label="对比基准版本" placeholder="选择对比基准版本" style={{ minWidth: 240 }} value={previous} onChange={setPrevious}
      options={versions.filter(item => item.version.version_id !== current.version.version_id).map(item => ({ value: item.version.version_id, label: `${item.version.version_label} · ${item.status.label}` }))} />
      <Button onClick={() => void compare()} disabled={!previous} loading={busy}>与当前版本对比</Button></Space>
    {comparison && <>
      <Table rowKey="field" dataSource={comparison.differences} columns={[
        { title: '变化项', dataIndex: 'label' },
        { title: '原内容', render: (_, row) => <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{diffDisplay(row.before, row.field)}</Typography.Paragraph> },
        { title: '当前内容', render: (_, row) => <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{diffDisplay(row.after, row.field)}</Typography.Paragraph> },
        { title: '兼容性', render: (_, row) => <Tag color={row.breaking ? 'warning' : 'default'}>{row.breaking ? '需要重新验证' : '无结构变化'}</Tag> },
      ]} />
      <Typography.Title level={5}>引用影响</Typography.Title><ReferenceTable rows={comparison.references} />
    </>}
    <Modal title={release?.operation === 'rollback' ? '回滚提示词' : '发布提示词'} open={!!release} confirmLoading={busy}
      onCancel={() => setRelease(undefined)} onOk={async () => {
        if (!release) return
        setBusy(true); setError(undefined)
        try {
          const values = await form.validateFields()
          await send(`/admin/v1/prompts/${prompt.prompt_id}/releases`, { ...values, version_id: release.version.version.version_id,
            revision: release.version.revision, expected_mapping_revision: prompt.releases[0]?.revision ?? null, operation: release.operation })
          setRelease(undefined); form.resetFields(); onChanged()
        } catch (error) { setError(errorText(error)) }
        finally { setBusy(false) }
      }}>
      {error && <Alert type="error" title={error} />}
      <Descriptions items={[{ key: 'version', label: '目标版本', children: release?.version.version.version_label },
        { key: 'environment', label: '目标环境', children: '当前工作区环境' }]} />
      <Form form={form} layout="vertical"><Form.Item name="note" label="变更说明" rules={[{ required: true, message: '请填写变更说明' }]}><Input.TextArea rows={3} /></Form.Item></Form>
    </Modal>
  </Space>
}
