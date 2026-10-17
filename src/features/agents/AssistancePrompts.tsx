import { Card, Collapse, Form, Space, Typography } from 'antd'
import type { Schema } from '../../components/Management'
import { TemplateFields, VariableFields } from '../prompts/EditorFields'
import { editorValues } from '../prompts/editor-values'
import type { Definition } from './types'

export function AssistancePrompts({ drafts, definition }: { drafts: Schema<'AssistancePromptDraft'>[]; definition: Definition }) {
  return <Space orientation="vertical" className="agent-flow-full-width">
    <Typography.Paragraph>保存方案时自动创建、发布提示词，并关联到对应步骤。</Typography.Paragraph>
    {drafts.map((draft, index) => <Card key={index} size="small" title={<Typography.Text ellipsis={{ tooltip: draft.name }} style={{ maxWidth: '100%' }}>{draft.name}</Typography.Text>}>
      <Typography.Paragraph>{draft.purpose}</Typography.Paragraph>
      {draft.step_key && <Typography.Paragraph>关联步骤：{definition.steps.find(step => step.key === draft.step_key)?.name}</Typography.Paragraph>}
      <Form component={false} layout="vertical" initialValues={editorValues(draft.content)}>
        <Collapse defaultActiveKey={['content']} items={[
          { key: 'content', label: '提示词内容', children: <TemplateFields editable={false} /> },
          ...(draft.content.variables?.length ? [{ key: 'variables', label: '变量', children: <VariableFields editable={false} /> }] : []),
        ]} />
      </Form>
    </Card>)}
  </Space>
}
