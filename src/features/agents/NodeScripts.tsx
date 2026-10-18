import { Alert, Descriptions, Form, Input, InputNumber, Select, Space, Switch, Typography } from 'antd'
import type { Step } from './flow-fields'
import type { Options } from './types'

type Script = NonNullable<Step['script']>
type Pagination = NonNullable<Step['pagination']>

export function NodeScriptEditor({ value, onChange, options, disabled }: {
  value?: Script | null; onChange?: (value: Script | null) => void; options: Options; disabled?: boolean
}) {
  const profiles = options.python_environments ?? []
  const current = profiles.find(profile => profile.profile_id === value?.profile_id && profile.profile_digest === value?.profile_digest)
  const update = (change: Partial<Script>) => onChange?.({ source: value?.source ?? '', profile_id: value?.profile_id ?? '', profile_digest: value?.profile_digest ?? '', ...change })
  return <Space orientation="vertical" className="agent-flow-full-width">
    {!profiles.length && <Alert type="info" showIcon title="当前渠道尚未配置 Python 执行环境" />}
    <Select aria-label="脚本执行环境" className="agent-flow-full-width" disabled={disabled || !profiles.length} value={current?.profile_id} placeholder="请选择执行环境" options={profiles.map(profile => ({ value: profile.profile_id, label: `${profile.name} · ${profile.seconds} 秒 · ${profile.memory_mb} MB` }))}
      onChange={id => { const profile = profiles.find(item => item.profile_id === id)!; update({ profile_id: id, profile_digest: profile.profile_digest }) }} />
    {value?.profile_id && !current && <Alert type="warning" showIcon title="原执行环境已变化或不可用，请重新选择" />}
    <Input.TextArea aria-label="Python 脚本代码" value={value?.source ?? ''} onChange={event => update({ source: event.target.value })} disabled={disabled} autoSize={{ minRows: 12, maxRows: 28 }} maxLength={32000} spellCheck={false} className="agent-python-source" />
    <Typography.Text type="secondary">transform(value, context) 接收入参，返回 JSON 对象作为节点出参。业务校验未通过时返回失败标记和结论，通过条件连线结束或转交；抛出异常会终止正常流转。</Typography.Text>
  </Space>
}

export function PaginationEditor({ value, onChange, disabled }: { value?: Pagination | null; onChange?: (value: Pagination | null) => void; disabled?: boolean }) {
  const update = (key: keyof Pagination, next: string | number | null) => value && onChange?.({ ...value, [key]: next })
  return <Space orientation="vertical" className="agent-flow-full-width">
    <Switch aria-label="启用全量分页" checked={!!value} disabled={disabled} onChange={enabled => onChange?.(enabled ? { cursor_input: 'cursor', items_path: 'items', has_more_path: 'has_more', cursor_path: 'cursor', count_path: null, total_path: null, max_items: 1000 } : null)} />
    {value && <>
      <Typography.Text type="secondary">从首页持续查询到末页，再将原始页面 pages、完整标记 complete、累计条数 received、页数 page_count 和总条数 total 交给下一步。超过运行上限返回数据不完整。</Typography.Text>
      {([
        ['cursor_input', '续页入参字段'], ['items_path', '原始列表字段路径'], ['has_more_path', '原始续页标记路径'], ['cursor_path', '原始续页游标路径'], ['count_path', '本页条数字段路径（可选）'], ['total_path', '总条数字段路径（可选）'],
      ] as const).map(([key, label]) => <Form.Item key={key} label={label}><Input aria-label={label} disabled={disabled} value={value[key] ?? ''} onChange={event => update(key, event.target.value || (key === 'count_path' || key === 'total_path' ? null : ''))} /></Form.Item>)}
      <Form.Item label="累计条数上限（条）"><InputNumber aria-label="累计条数上限（条）" disabled={disabled} min={1} max={10000} precision={0} value={value.max_items} onChange={next => update('max_items', next ?? 1000)} /></Form.Item>
    </>}
  </Space>
}

export function NodeScriptsView({ step, options }: { step: Step; options?: Options }) {
  return <Space orientation="vertical" className="agent-flow-full-width" size="middle">
    {step.script && <div className="agent-flow-full-width">
      <Typography.Text strong>Python 脚本</Typography.Text>
      <div><Typography.Text type="secondary">{options?.python_environments?.find(item => item.profile_id === step.script?.profile_id)?.name ?? '执行环境名称不可用'}</Typography.Text></div>
      <pre className="agent-python-source">{step.script.source}</pre>
    </div>}
    {step.pagination && <Descriptions size="small" column={1} items={[
      { key: 'enabled', label: '全量分页', children: '启用' },
      ...Object.entries({ cursor_input: '续页入参', items_path: '列表路径', has_more_path: '续页标记', cursor_path: '游标路径', count_path: '本页条数', total_path: '总条数' }).map(([key, label]) => ({ key, label, children: String(step.pagination?.[key as keyof Pagination] ?? '未配置') })),
      { key: 'max', label: '累计条数上限', children: `${step.pagination.max_items} 条` },
    ]} />}
  </Space>
}
