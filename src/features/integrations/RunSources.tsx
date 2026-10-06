import { Form, Select } from 'antd'
import { ErrorNotice } from '../../components/Management'
import type { RunClient, useRunClients } from './useRunClients'

export function RunSources({ clients }: { clients: ReturnType<typeof useRunClients> }) {
  return <>
    <ErrorNotice error={clients.error} />
    <Form.Item name="client_ids" label="调用服务" extra="未选择时仅包含本人发起的运行；选择后仅包含所选服务在当前渠道环境的运行。">
      <Select mode="multiple" allowClear disabled={!clients.canRead} placeholder={clients.canRead ? "本人发起的运行" : "当前渠道环境没有运行读取权限"} loading={clients.canRead && !clients.data && !clients.error}
        labelRender={({ value }) => clients.data?.find(c => c.client_id === value)?.name ?? '调用服务不可用'}
        optionFilterProp="label" options={clients.data?.map(c => ({ value: c.client_id, label: c.name + (c.active ? '' : '（停用）'), disabled: !c.active }))} />
    </Form.Item>
  </>
}

export function RunSourceNames({ ids = [], clients }: { ids?: string[]; clients?: RunClient[] }) {
  return ids.length ? ids.map(id => clients?.find(c => c.client_id === id)?.name ?? '调用服务不可用').join('、') : '本人发起'
}
