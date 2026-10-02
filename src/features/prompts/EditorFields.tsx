import { Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Switch } from 'antd'
import { sensitivityOptions, sourceOptions, typeOptions } from './types'

export function TemplateFields({ editable }: { editable: boolean }) {
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Form.Item name={['instruction_blocks', 'system']} label="系统指令"><Input.TextArea disabled={!editable} rows={6} /></Form.Item>
    <Form.Item name={['instruction_blocks', 'output_requirements']} label="输出要求"><Input.TextArea disabled={!editable} rows={3} /></Form.Item>
    <Form.List name="message_templates">{(fields, { add, remove }) => <Space orientation="vertical" style={{ width: '100%' }}>
      {fields.map(field => <Card key={field.key} size="small" title={`消息 ${field.name + 1}`} extra={editable && <Button onClick={() => remove(field.name)}>移除</Button>}>
        <Form.Item name={[field.name, 'source']} label="来源" rules={[{ required: true, message: '请选择来源' }]}><Select disabled={!editable} options={sourceOptions} /></Form.Item>
        <Form.Item name={[field.name, 'template']} label="消息模板" rules={[{ required: true, message: '请填写模板' }]}><Input.TextArea disabled={!editable} rows={4} /></Form.Item>
      </Card>)}
      {editable && <Button onClick={() => add({ source: 'input', template: '' })}>添加消息</Button>}
    </Space>}</Form.List>
    <Form.Item name="change_note" label="变更说明"><Input.TextArea disabled={!editable} rows={2} /></Form.Item>
  </Space>
}
export function VariableFields({ editable }: { editable: boolean }) {
  return <Form.List name="variables">{(fields, { add, remove }) => <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    {fields.map(field => <Card key={field.key} size="small" title={`变量 ${field.name + 1}`} extra={editable && <Button onClick={() => remove(field.name)}>移除</Button>}>
      <Row gutter={16}>
        <Col xs={24} md={12}><Form.Item name={[field.name, 'name']} label="模板引用名" rules={[{ required: true, message: '请填写模板引用名' }]}><Input disabled={!editable} /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name={[field.name, 'display_name']} label="中文名称" rules={[{ required: true, message: '请填写中文名称' }]}><Input disabled={!editable} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name={[field.name, 'type']} label="类型"><Select disabled={!editable} options={typeOptions} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name={[field.name, 'source']} label="来源"><Select disabled={!editable} options={sourceOptions} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name={[field.name, 'sensitivity']} label="敏感级别"><Select disabled={!editable} options={sensitivityOptions} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name={[field.name, 'max_length']} label="长度上限（字符）"><InputNumber disabled={!editable} min={1} max={100000} style={{ width: '100%' }} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name={[field.name, 'required']} label="必填" valuePropName="checked"><Switch disabled={!editable} /></Form.Item></Col>
        <Col span={24}><Form.Item name={[field.name, 'default_json']} label="默认值（JSON）"><Input.TextArea disabled={!editable} rows={2} /></Form.Item></Col>
      </Row>
    </Card>)}
    {editable && <Button onClick={() => add({ name: '', display_name: '', type: 'string', source: 'input', sensitivity: 'internal', required: true, max_length: 4096, default_json: '' })}>添加变量</Button>}
  </Space>}</Form.List>
}
