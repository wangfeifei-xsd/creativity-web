import { Alert, Button, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Switch, Tag, Typography } from 'antd'
import { useId, useState } from 'react'
import { Table } from '../Table'
import { changeType, constraintLabel, deleteField, fieldTitle, isObject, parseSchema, replaceNode, saveField, schemaAt, schemaRows, schemaType, typeLabel, typeNames, type FieldRow, type SchemaObject } from './schema'
import './schema-fields.css'

type Editing = { row?: FieldRow; parentPath: string[] }
type Props = { value?: string; onChange?: (value: string) => void; label: string; id?: string; disabled?: boolean; compact?: boolean }

export function SchemaFields({ value = '{}', onChange, label, id, disabled, compact }: Props) {
  const [mode, setMode] = useState('fields')
  const [editing, setEditing] = useState<Editing>()
  let schema: SchemaObject | undefined, error: string | undefined
  try { schema = parseSchema(value) } catch (failure) { error = (failure as Error).message }
  const editable = !!onChange
  const update = (next: SchemaObject) => onChange?.(JSON.stringify(next, null, 2))
  const canAdd = schema && (schema.type === 'object' || isObject(schema.properties))
  return <div id={id} className="schema-fields" role="region" aria-label={label}>
    <div className="schema-fields-toolbar">
      <Space wrap><Segmented aria-label={`${label}展示方式`} value={mode} onChange={setMode}
        options={[{ label: '字段结构', value: 'fields' }, { label: '高级 JSON', value: 'json' }]} />
        {schema && mode === 'fields' && <Tag>{typeLabel(schema)}</Tag>}</Space>
      {editable && mode === 'fields' && canAdd && <Button size="small" disabled={disabled} onClick={() => setEditing({ parentPath: [] })}>新增字段</Button>}
    </div>
    {mode === 'json' ? <Input.TextArea aria-label={`${label} JSON`} value={value} readOnly={!editable} disabled={disabled} autoSize={{ minRows: 8, maxRows: 22 }}
      onChange={event => onChange?.(event.target.value)} spellCheck={false} className="schema-fields-json" /> : schema && <>
      {!!schema.description && <Typography.Paragraph type="secondary">{String(schema.description)}</Typography.Paragraph>}
      <Table<FieldRow> size="small" rowKey="key" pagination={false} dataSource={schemaRows(schema)} scroll={compact ? undefined : { x: 660 }}
        expandable={{ defaultExpandAllRows: true, indentSize: 16 }} locale={{ emptyText: '暂未定义字段' }} columns={[
          { title: '字段名称 / 标识', width: compact ? undefined : 210, render: (_: unknown, row: FieldRow) => <span className="schema-fields-name"><span>{fieldTitle(row)}{compact && <Tag>{typeLabel(row.schema)}{row.required ? ' · 必填' : ''}</Tag>}</span>{!row.item && <Typography.Text type="secondary">{row.name}</Typography.Text>}{compact && <Typography.Text type="secondary" className="schema-fields-description">{isObject(row.schema) && typeof row.schema.description === 'string' ? `${row.schema.description}；` : ''}{constraintLabel(row.schema)}</Typography.Text>}</span> },
          ...(!compact ? [{ title: '类型', width: 98, render: (_: unknown, row: FieldRow) => typeLabel(row.schema) },
          { title: '必填', width: 62, render: (_: unknown, row: FieldRow) => row.item ? '—' : row.required ? <Tag color="blue">是</Tag> : '否' },
          { title: '说明与约束', render: (_: unknown, row: FieldRow) => <div className="schema-fields-description">{isObject(row.schema) && typeof row.schema.description === 'string' && <div>{row.schema.description}</div>}<Typography.Text type="secondary">{constraintLabel(row.schema)}</Typography.Text></div> },
          ] : []),
          ...(editable ? [{ title: '操作', width: compact ? 76 : 164, render: (_: unknown, row: FieldRow) => <Space size={[4, 0]} wrap>
            <Button type="link" size="small" disabled={disabled || !isObject(row.schema)} onClick={() => setEditing({ row, parentPath: row.path.slice(0, -2) })}>修改</Button>
            {isObject(row.schema) && (row.schema.type === 'object' || isObject(row.schema.properties)) && <Button type="link" size="small" disabled={disabled} onClick={() => setEditing({ parentPath: row.path })}>添加子字段</Button>}
            {!row.item && <Popconfirm title={`删除字段“${fieldTitle(row)}”？`} description="其子字段也会一并移除。" okText="删除" cancelText="取消"
              onConfirm={() => update(deleteField(schema, row.path))} disabled={disabled}><Button type="link" size="small" danger disabled={disabled}>删除</Button></Popconfirm>}
          </Space> }] : []),
        ]} />
      {canAdd && <div className="schema-fields-policy"><Typography.Text type="secondary">额外字段</Typography.Text>
        {editable ? <Select aria-label={`${label}额外字段`} size="small" disabled={disabled}
          value={schema.additionalProperties === false ? 'deny' : schema.additionalProperties === true ? 'allow' : schema.additionalProperties === undefined ? 'default' : 'advanced'}
          options={[{ label: '默认允许', value: 'default' }, { label: '允许', value: 'allow' }, { label: '不允许', value: 'deny' }, ...(isObject(schema.additionalProperties) ? [{ label: '按高级规则校验', value: 'advanced', disabled: true }] : [])]}
          onChange={choice => { const next = { ...schema }; if (choice === 'default') delete next.additionalProperties; else next.additionalProperties = choice === 'allow'; update(next) }} /> :
          <Typography.Text>{schema.additionalProperties === false ? '不允许' : isObject(schema.additionalProperties) ? '按高级规则校验' : '允许'}</Typography.Text>}
      </div>}
      {!schemaRows(schema).length && !canAdd && <Typography.Paragraph type="secondary">{constraintLabel(schema)}；可在高级 JSON 中查看完整结构。</Typography.Paragraph>}
    </>}
    {error && !editable && <Alert type="error" title={error} showIcon />}
    {editing && schema && <FieldEditor editing={editing} schema={schema} onClose={() => setEditing(undefined)} onSave={next => { update(next); setEditing(undefined) }} />}
  </div>
}

type FieldValues = { name: string; title?: string; type: string; required: boolean; description?: string; enum?: string[];
  minLength?: number; maxLength?: number; minimum?: number; maximum?: number; minItems?: number; maxItems?: number }
const numericFields = { string: [['minLength', '最少字符数'], ['maxLength', '最多字符数']], number: [['minimum', '最小值'], ['maximum', '最大值']], integer: [['minimum', '最小值'], ['maximum', '最大值']], array: [['minItems', '最少元素数'], ['maxItems', '最多元素数']] } as const

function FieldEditor({ editing, schema, onClose, onSave }: { editing: Editing; schema: SchemaObject; onClose: () => void; onSave: (schema: SchemaObject) => void }) {
  const [form] = Form.useForm<FieldValues>()
  const [error, setError] = useState<string>()
  const formId = useId()
  const old = editing.row && isObject(editing.row.schema) ? editing.row.schema : { type: 'string' }
  const currentType = schemaType(old)
  const type: string = Form.useWatch('type', form) ?? currentType
  const enumValues = Array.isArray(old.enum) ? old.enum.map(String) : undefined
  const title = editing.row ? editing.row.item ? '修改数组元素' : '修改字段' : '新增字段'
  const parent = schemaAt(schema, editing.parentPath)
  const properties = isObject(parent) && isObject(parent.properties) ? parent.properties : {}
  const numeric = numericFields[type as keyof typeof numericFields] ?? []
  async function save() {
    try {
      const values = await form.validateFields()
      const next = changeType(old, values.type)
      for (const key of ['title', 'description'] as const) {
        if (values[key]) next[key] = values[key]
        else delete next[key]
      }
      for (const [key] of numeric) {
        if (values[key] != null) next[key] = values[key]
        else delete next[key]
      }
      for (let index = 0; index < numeric.length; index += 2) {
        const min = values[numeric[index][0]], max = values[numeric[index + 1][0]]
        if (min != null && max != null && min > max) throw new Error('最小值不能大于最大值')
      }
      if (['string', 'number', 'integer', 'boolean'].includes(values.type) && (type !== currentType || JSON.stringify(values.enum) !== JSON.stringify(enumValues))) {
        if (values.enum?.length) next.enum = values.enum.map(value => {
          if (type === 'string') return value
          if (type === 'boolean') { if (!['true', 'false'].includes(value)) throw new Error('布尔可选值只能为 true 或 false'); return value === 'true' }
          const number = Number(value)
          if (!value.trim() || !Number.isFinite(number) || (type === 'integer' && !Number.isInteger(number))) throw new Error('可选值必须符合当前数值类型')
          return number
        })
        else delete next.enum
      }
      if (editing.row?.item) onSave(replaceNode(schema, editing.row.path, next))
      else onSave(saveField(schema, editing.parentPath, editing.row?.name, values.name, next, values.required))
    } catch (failure) { if (failure instanceof Error) setError(failure.message) }
  }
  return <Modal open title={title} width={600} onCancel={onClose} onOk={() => void save()} okText="确定" cancelText="取消" styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}>
    {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
    <Form component={false} name={formId} form={form} layout="vertical" initialValues={{ ...old, name: editing.row?.name, type: currentType, required: editing.row?.required ?? false, enum: enumValues }}>
      <div className="schema-fields-form-grid">
        {!editing.row?.item && <Form.Item name="name" label="字段标识" rules={[{ required: true, whitespace: true, message: '请填写字段标识' }, { validator: (_, value: string) => value !== editing.row?.name && Object.hasOwn(properties, value) ? Promise.reject(new Error('同一对象内的字段标识不能重复')) : Promise.resolve() }]}><Input /></Form.Item>}
        <Form.Item name="title" label="显示名称"><Input placeholder="例如：业务诉求" /></Form.Item>
        <Form.Item name="type" label="字段类型"><Select options={[...Object.entries(typeNames).map(([value, label]) => ({ value, label })), ...(currentType === 'advanced' ? [{ value: 'advanced', label: '保留自定义结构' }] : [])]} /></Form.Item>
        {!editing.row?.item && <Form.Item name="required" label="必填" valuePropName="checked"><Switch /></Form.Item>}
      </div>
      {type !== currentType && <Alert type="warning" title="更换类型会清除该字段原有的子结构和约束。" showIcon style={{ marginBottom: 16 }} />}
      <Form.Item name="description" label="字段说明"><Input.TextArea rows={2} /></Form.Item>
      {['string', 'number', 'integer', 'boolean'].includes(type) && <Form.Item name="enum" label="可选值"><Select mode="tags" placeholder="留空不限制，输入后按回车添加" open={false} /></Form.Item>}
      <div className="schema-fields-form-grid">{numeric.map(([name, label]) => <Form.Item key={name} name={name} label={label}><InputNumber style={{ width: '100%' }} min={['string', 'array'].includes(type) ? 0 : undefined} precision={type === 'number' ? undefined : 0} /></Form.Item>)}</div>
      {!!Object.keys(old).filter(key => !['type', 'title', 'description', 'enum', 'properties', 'required', 'items', ...numeric.map(([key]) => key)].includes(key)).length && <Typography.Text type="secondary">其他已有规则保持原样，可在高级 JSON 中编辑。</Typography.Text>}
    </Form>
  </Modal>
}

export function SchemaView({ value, label, compact }: { value: SchemaObject; label: string; compact?: boolean }) {
  return <SchemaFields value={JSON.stringify(value, null, 2)} label={label} compact={compact} />
}
