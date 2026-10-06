import { Alert, Button, Modal, Select, Space } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { LoadingState } from '../../components/States'

export function ScopeDirectoryDialog({ channelId, environment, onClose, onSaved }: {
  channelId: string; environment?: string; onClose: () => void; onSaved: () => void
}) {
  const base = `/admin/v1/channels/${channelId}` as const
  const sources = useQuery<Schema<'DataScopeSource'>[]>(environment ? `${base}/data-scope-sources` : null)
  const [sourceIndex, setSourceIndex] = useState<number>()
  const [directory, setDirectory] = useState<Schema<'DataScopeDirectory'>>()
  const [selected, setSelected] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const source = sourceIndex === undefined ? undefined : sources.data?.[sourceIndex]
  async function choose(index: number) {
    setSourceIndex(index); setDirectory(undefined); setSelected(undefined); setError(undefined)
    const item = sources.data?.[index]
    if (!item || !environment) return
    setBusy(true)
    try {
      setDirectory(await send<Schema<'DataScopeDirectory'>>(`${base}/data-scope-directory`, 'POST',
        { environment, connection_id: item.connection_id, remote_tool_name: item.remote_tool_name }))
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  async function create() {
    const item = selected === undefined ? undefined : directory?.items[selected]
    if (!environment || !source || !item || busy) return
    setBusy(true); setError(undefined)
    try {
      await send(`${base}/data-scopes/from-source`, 'POST', {
        environment, connection_id: source.connection_id, remote_tool_name: source.remote_tool_name,
        external_scope_type: item.type, external_scope_id: item.id,
      })
      onSaved()
    } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  return <Modal open title="从接入目录选择数据域" destroyOnHidden onCancel={onClose} closable={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button>
      <Button type="primary" loading={busy} disabled={selected === undefined || !directory} onClick={() => void create()}>确认</Button></Space>}>
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <ErrorNotice error={error ?? sources.error} />
      {!environment ? <Alert type="info" showIcon title="请先创建环境并进入该渠道的管理工作区，再读取接入目录。" /> :
        !sources.data && !sources.error ? <LoadingState /> :
          sources.data?.length === 0 ? <Alert type="info" showIcon
            title={<>当前工作区尚无可用的数据域目录工具。请先在 <Link to="/mcp-connections" onClick={onClose}>MCP 连接</Link>中配置、发现并启用专用目录工具。</>} /> :
            <>
              <Select aria-label="目录来源" placeholder="选择已配置的目录工具" style={{ width: '100%' }}
                value={sourceIndex} options={sources.data?.map((item, index) => ({ value: index, label: item.label }))}
                onChange={index => void choose(index)} disabled={busy} />
              {directory && <Select aria-label="可选数据域" placeholder={directory.items.length ? '选择外部系统返回的数据域' : '目录未返回可选范围'}
                style={{ width: '100%' }} showSearch optionFilterProp="label" value={selected} disabled={busy || !directory.items.length}
                options={directory.items.map((item, index) => ({ value: index, label: `${item.name} · ${item.type} / ${item.id}` }))}
                onChange={setSelected} />}
            </>}
    </Space>
  </Modal>
}
