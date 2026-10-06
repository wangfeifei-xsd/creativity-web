import { Alert, Button, Descriptions, Modal, Space, Spin } from 'antd'
import { formatTimestamp } from '../../api/presentation'
import { ErrorNotice, type Schema } from '../../components/Management'

export type ConnectionTestState = {
  modelName: string
  busy: boolean
  result?: Schema<'ConnectionTestView'>
  error?: unknown
}

export function ConnectionTest({ state, onClose }: { state: ConnectionTestState; onClose: () => void }) {
  return <Modal open title={`测试连接 · ${state.modelName}`} onCancel={onClose} closable={!state.busy}
    maskClosable={!state.busy} footer={<Button onClick={onClose} disabled={state.busy}>关闭</Button>}>
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {state.busy && <Spin tip="正在检查供应商连接…"><div style={{ height: 80 }} /></Spin>}
      <ErrorNotice error={state.error} />
      {state.result && <>
        <Alert showIcon type={state.result.success ? 'success' : 'error'} title={state.result.message} />
        <Descriptions column={1} items={[
          { key: 'latency', label: '耗时', children: `${state.result.latency_ms.toLocaleString()} 毫秒` },
          { key: 'time', label: '检查时间', children: formatTimestamp(state.result.checked_at) },
        ]} />
      </>}
    </Space>
  </Modal>
}
