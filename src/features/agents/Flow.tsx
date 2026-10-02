import { Card, Space, Table, Tag, Typography } from 'antd'
import { type Definition } from './types'

export function Flow({ definition }: { definition: Definition }) {
  const names = new Map(definition.steps.map(s => [s.key, s.name]))
  const label = (key: string) => key === 'END' ? '结束' : names.get(key) ?? '步骤不可用'
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <div aria-label="流程图" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <Tag color="blue">开始：{label(definition.start_step)}</Tag>
      {definition.steps.map(step => <Card key={step.key} size="small" title={step.name} style={{ minWidth: 200, maxWidth: '100%' }}>
        <Typography.Paragraph>{({ model: '模型调用', tool: '工具调用', compute: '固定计算' })[step.kind]}</Typography.Paragraph>
        {definition.edges.filter(e => e.source === step.key).map((edge, index) => <div key={index}>→ {label(edge.target)}{edge.otherwise ? '（其余情况）' : edge.condition ? '（满足条件）' : ''}</div>)}
      </Card>)}
    </div>
    <Table size="small" rowKey="key" dataSource={definition.steps} pagination={false} scroll={{ x: 620 }} columns={[
      { title: '步骤', dataIndex: 'name' }, { title: '超时', render: (_, s) => `${s.timeout_seconds} 秒` },
      { title: '失败处理', render: (_, s) => ({ fail: '终止并报错', partial: '返回部分结果', retry: `最多重试 ${s.max_retries} 次` })[s.failure_policy] },
      { title: '输入来源', render: (_, s) => Object.entries(s.inputs ?? {}).map(([key, source]) => `${key}：${source.source === 'input' ? '运行输入' : source.source === 'step' ? label(source.step ?? '') : '常量'}${source.path ? ` · ${source.path}` : ''}`).join('；') || '无' },
    ]} />
    <Table size="small" rowKey={(_, index) => String(index)} dataSource={definition.edges} pagination={false} columns={[
      { title: '来源', render: (_, e) => label(e.source) }, { title: '去向', render: (_, e) => label(e.target) },
      { title: '条件', render: (_, e) => e.otherwise ? '其余情况' : e.condition ? `${e.condition.path} ${({ eq: '等于', ne: '不等于', exists: '存在' })[e.condition.operator]} ${e.condition.operator === 'exists' ? '' : JSON.stringify(e.condition.value)}` : '直接进入' },
    ]} />
  </Space>
}
