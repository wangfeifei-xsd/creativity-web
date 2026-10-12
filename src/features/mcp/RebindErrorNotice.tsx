import { Alert, Table, Typography } from 'antd'
import { ApiError } from '../../api/client'
import { ErrorNotice } from '../../components/Management'

const labels: Record<string, string> = {
  input_schema: '本地输入参数', remote_input_schema: '远端输入参数', output_schema: '远端输出结构',
  effect_type: '实际影响', implementation_version: '契约摘要', annotations: '工具行为声明', purpose: '工具用途',
}
const annotationLabels: Record<string, string> = {
  readOnlyHint: '只读', destructiveHint: '破坏性操作', idempotentHint: '幂等操作', openWorldHint: '访问外部系统',
}

export function RebindErrorNotice({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.code !== 'MCP_TOOL_CHANGED' || !error.fields.length) {
    return <ErrorNotice error={error} />
  }
  return <Alert type="error" showIcon title={error.message} description={<>
    <Typography.Paragraph>原值来自本地工具及其原绑定定义，新值来自本次选择的发现快照。</Typography.Paragraph>
    <Table size="small" pagination={false} scroll={{ x: 520, y: 360 }} rowKey="key"
      dataSource={error.fields.map((field, key) => ({ ...field, key }))} columns={[
        { title: '差异位置', width: 200, render: (_, row) => {
          const [root, ...parts] = row.path
          const pointer = parts.map(part => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')
          const annotation = root === 'annotations' ? annotationLabels[String(parts[0])] : undefined
          return <div style={{ overflowWrap: 'anywhere' }}>
            <div>{labels[String(root)] ?? '核对说明'}{annotation ? ` · ${annotation}` : ''}</div>
            {pointer && <Typography.Text type="secondary">/{pointer}</Typography.Text>}
          </div>
        } },
        { title: '原值 / 新值', render: (_, row) => <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.message}</div> },
      ]} />
    <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
      请核对新地址提供的工具定义；若需采用新契约，请创建独立工具并调整 Agent。
    </Typography.Paragraph>
  </>} />
}
