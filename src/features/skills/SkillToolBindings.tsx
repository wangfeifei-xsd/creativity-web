import { Collapse, Form, Select } from 'antd'
import type { Schema } from '../../components/Management'

export function SkillToolBindings({ requirements, options }: {
  requirements: Schema<'SkillToolRequirement'>[]; options: Schema<'SkillToolOption'>[]
}) {
  const bound: Record<string, string> = Form.useWatch('tool_bindings', Form.useFormInstance()) ?? {}
  const choices = options.map(tool => ({ value: tool.version_id, disabled: !tool.available,
    label: `${tool.name}${tool.reason ? ` · ${tool.reason}` : ''}` }))
  for (const id of Object.values(bound)) {
    if (id && !choices.some(option => option.value === id)) choices.push({ value: id, label: '绑定工具不可用', disabled: true })
  }
  return requirements.map(requirement => <div key={requirement.tool_code}>
    <Form.Item name={['tool_bindings', requirement.tool_code]} label={`工具依赖：${requirement.tool_code}`}>
      <Select allowClear showSearch optionFilterProp="label" placeholder="选择本渠道工具" options={choices} />
    </Form.Item>
    {(requirement.input_schema || requirement.output_schema) && <Collapse size="small" style={{ marginBottom: 16 }} items={[{
      key: 'contract', label: '查看依赖契约', children: <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ input_schema: requirement.input_schema, output_schema: requirement.output_schema }, null, 2)}</pre>,
    }]} />}
  </div>)
}
