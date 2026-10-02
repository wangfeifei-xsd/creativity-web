import { Alert, Button, Descriptions, Input, Modal, Space, Table } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { EditorDialog, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

export function DelegationKeys() {
  const query = useQuery<Schema<'DelegationKeyView'>[]>('/admin/v1/delegation-keys')
  const options = useQuery<Schema<'DelegationKeyOptions'>>('/admin/v1/delegation-keys/options')
  const [edit, setEdit] = useState<{ kind: 'create' | 'rotate' | 'revoke'; row?: Schema<'DelegationKeyView'> }>()
  const [issued, setIssued] = useState<Schema<'DelegationKeyIssued'>>()
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Space><Button disabled={!options.data} onClick={() => setEdit({ kind: 'create' })}>创建委托密钥</Button><Button onClick={() => { query.reload(); options.reload() }}>刷新</Button></Space>
    {options.error ? <ErrorState error={options.error} onRetry={options.reload} /> : null}
    <Table rowKey="kid" dataSource={query.data} scroll={{ x: 780 }} columns={[
      { title: '接入服务', dataIndex: 'client_name' }, { title: '签发者', dataIndex: 'issuer' },
      { title: '受众', dataIndex: 'audience' }, { title: '状态', dataIndex: 'status_name' },
      { title: '到期时间', render: (_, row) => formatTimestamp(row.expires_at) },
      { title: '委托有效期', render: (_, row) => `${row.max_ttl_seconds} 秒` },
      { title: '操作', render: (_, row) => <Space><Button onClick={() => setEdit({ kind: 'rotate', row })}>轮换</Button>
        <Button danger onClick={() => setEdit({ kind: 'revoke', row })}>吊销</Button></Space> },
    ]} />
    {edit && <EditorDialog title={{ create: '创建委托密钥', rotate: '轮换委托密钥', revoke: '吊销委托密钥' }[edit.kind]}
      danger={edit.kind === 'revoke'} initial={{ max_ttl_seconds: 300, clock_skew_seconds: 30, overlap_seconds: 330, revision: edit.row?.revision }}
      fields={edit.kind === 'revoke' ? [] : edit.kind === 'rotate' ? [
        { name: 'expires_at', label: '新密钥到期时间', kind: 'datetime', required: true },
        { name: 'overlap_seconds', label: '旧密钥重叠期（秒）', kind: 'number', min: 0, max: 86400, required: true },
      ] : [
        { name: 'client_id', label: '接入服务', kind: 'select', required: true, options: options.data?.clients ?? [] },
        { name: 'issuer', label: '签发者', required: true }, { name: 'audience', label: '受众', required: true },
        { name: 'expires_at', label: '密钥到期时间', kind: 'datetime', required: true },
        { name: 'max_ttl_seconds', label: '委托有效期（秒）', kind: 'number', min: 30, max: 900, required: true },
        { name: 'clock_skew_seconds', label: '时钟容差（秒）', kind: 'number', min: 0, max: 60, required: true },
      ]} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); query.reload() }}
      onSave={async values => {
        if (edit.kind === 'revoke' && edit.row) {
          await send(`/admin/v1/delegation-keys/${edit.row.kid}/revoke`, 'POST', { revision: values.revision })
        } else {
          const body = edit.kind === 'rotate' ? { revision: values.revision, overlap_seconds: values.overlap_seconds,
            expires_at: new Date(String(values.expires_at)).toISOString() } : {
            client_id: values.client_id, issuer: values.issuer, audience: values.audience,
            max_ttl_seconds: values.max_ttl_seconds, clock_skew_seconds: values.clock_skew_seconds,
            expires_at: new Date(String(values.expires_at)).toISOString(),
          }
          setIssued(await send(edit.row ? `/admin/v1/delegation-keys/${edit.row.kid}/rotate` : '/admin/v1/delegation-keys', 'POST', body))
        }
      }}><Alert type="warning" showIcon title={edit.kind === 'revoke' ? '吊销后，该密钥签发的委托立即失效。' : '签名密钥仅在创建时显示，请保存到业务后端。'} /></EditorDialog>}
    {issued && <Modal open title="委托签名密钥" onCancel={() => setIssued(undefined)} footer={<Button onClick={() => setIssued(undefined)}>完成</Button>}>
      <Descriptions column={1} items={[{ key: 'client', label: '接入服务', children: issued.key.client_name },
        { key: 'kid', label: '密钥编号', children: issued.key.kid }]} />
      <Input.TextArea aria-label="委托签名密钥" value={issued.signing_secret} readOnly autoSize />
    </Modal>}
  </Space>
}
