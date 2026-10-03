import { Form, Select } from 'antd'
import { ErrorNotice } from '../../components/Management'
import { useQuery } from '../../api/useQuery'

export type RunClient = { client_id: string; name: string; active: boolean }

export function RunSources() {
  const clients = useQuery<RunClient[]>('/admin/v1/run-subscription-options')
  return <>
    <ErrorNotice error={clients.error} />
    <Form.Item name="client_ids" label="调用服务" extra="未选择时仅包含本人发起的运行；选择后仅包含所选服务在当前工作区的运行。">
      <Select mode="multiple" allowClear placeholder="本人发起的运行" loading={!clients.data && !clients.error}
        labelRender={({ value }) => clients.data?.find(c => c.client_id === value)?.name ?? '调用服务不可用'}
        optionFilterProp="label" options={clients.data?.map(c => ({ value: c.client_id, label: c.name + (c.active ? '' : '（停用）'), disabled: !c.active }))} />
    </Form.Item>
  </>
}

export function RunSourceNames({ ids = [], clients }: { ids?: string[]; clients?: RunClient[] }) {
  return ids.length ? ids.map(id => clients?.find(c => c.client_id === id)?.name ?? '调用服务不可用').join('、') : '本人发起'
}
