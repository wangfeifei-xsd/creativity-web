import { Button, Form, Input, InputNumber, Select, Space, Switch, Table, Typography } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'

type Version = Schema<'SkillVersionView'>
type Test = Schema<'SkillTestView'>
type Values = { selected: boolean; selected_files: string[]; context_budget: number; variables?: string }

export function SkillTests({ version }: { version: Version }) {
  const [form] = Form.useForm<Values>()
  const tests = useQuery<Test[]>(`/admin/v1/skill-versions/${version.version_id}/tests`)
  const [current, setCurrent] = useState<Test>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  async function run(values: Values) {
    setBusy(true); setError(undefined)
    try {
      const variables: unknown = JSON.parse(values.variables || '{}')
      const test = await send<Test>(`/admin/v1/skill-versions/${version.version_id}/tests`, 'POST', { ...values, variables, revision: version.revision })
      setCurrent(test); tests.reload()
    } catch (failure) { setError(failure instanceof SyntaxError ? new Error('输入变量不是有效的 JSON') : failure) }
    finally { setBusy(false) }
  }
  const result = current?.result
  return <><ErrorNotice error={error || tests.error} />
    <Form form={form} layout="vertical" initialValues={{ selected: true, selected_files: [], context_budget: version.settings.context_budget, variables: '{}' }} onFinish={run} disabled={busy}>
      <Space wrap align="start"><Form.Item name="selected" label="触发按需加载" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="context_budget" label="可用上下文（UTF-8 字节）"><InputNumber min={1} max={200000} /></Form.Item></Space>
      <Form.Item name="selected_files" label="本次所需资料"><Select mode="multiple" options={version.files.filter(f => f.relative_path !== 'SKILL.md').map(f => ({ value: f.relative_path, label: `${f.relative_path}${f.unavailable_reason ? ` · ${f.unavailable_reason}` : ''}`, disabled: !f.loadable }))} /></Form.Item>
      <Form.Item name="variables" label="输入变量（JSON）"><Input.TextArea rows={3} spellCheck={false} /></Form.Item>
      <Button type="primary" onClick={() => form.submit()} loading={busy}>验证加载</Button>
    </Form>
    {result && <><Typography.Title level={5}>{result.complete ? '加载验证通过' : '加载验证未通过'}</Typography.Title>
      <Typography.Paragraph>上下文占用：{result.used_budget} 字节</Typography.Paragraph>
      {result.issues.map((issue, index) => <Typography.Paragraph type="danger" key={index}>{issue.message}{issue.path ? `（${issue.path}）` : ''}</Typography.Paragraph>)}
      <Table rowKey="path" dataSource={result.loaded} columns={[
        { title: '实际加载文件', dataIndex: 'path' }, { title: '触发原因', dataIndex: 'trigger_reason' },
        { title: '正文', render: (_, file) => <pre style={{ whiteSpace: 'pre-wrap', maxWidth: 560, overflowWrap: 'anywhere' }}>{file.text}</pre> },
      ]} scroll={{ x: 550 }} />
      <Table rowKey="path" dataSource={result.omitted} columns={[
        { title: '未加载文件', dataIndex: 'path' }, { title: '原因', dataIndex: 'reason' },
      ]} />
      {result.discoveries.map(discovery => <Typography.Paragraph key={discovery.version_id}>{discovery.name} · {discovery.description}</Typography.Paragraph>)}
    </>}
    <Table style={{ marginTop: 20 }} rowKey="test_id" dataSource={tests.data ?? []} columns={[
      { title: '验证时间', render: (_, test) => formatTimestamp(test.created_at) }, { title: '版本', dataIndex: 'version_label' },
      { title: '证据类型', dataIndex: 'evidence_label' }, { title: '结果', render: (_, test) => test.result.complete ? '通过' : '未通过' },
      { title: '操作', render: (_, test) => <Button type="link" onClick={() => setCurrent(test)}>查看结果</Button> },
    ]} scroll={{ x: 550 }} />
  </>
}
