import { Collapse, Form, InputNumber, Select, Switch } from 'antd'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import type { Definition } from './types'

export function SkillLoadingFields({ versionId, label, steps }: { versionId: string; label: string; steps: Definition['steps'] }) {
  const query = useQuery<Schema<'SkillVersionView'>>(`/admin/v1/skills/${versionId}/configuration`)
  return <Collapse size="small" style={{ marginBottom: 16 }} items={[{ key: versionId, label: `${label} · 加载设置`, children: <>
    <ErrorNotice error={query.error} />
    <Form.Item name={['skill_loading_by_resource', versionId, 'step_keys']} label="生效节点"
      extra="选择节点后，技能变量从对应节点入参读取；留空则从运行入参读取。"
      normalize={(value: string[] | undefined) => value?.length ? value : null}>
      <Select mode="multiple" allowClear placeholder="全部模型节点"
        options={steps.filter(step => step.kind === 'model').map(step => ({ value: step.key, label: step.name }))} />
    </Form.Item>
    <Form.Item name={['skill_loading_by_resource', versionId, 'loading_mode']} label="加载方式"><Select allowClear placeholder="沿用技能设置"
      options={[{ value: 'mandatory', label: '始终加载' }, { value: 'on_demand', label: '按需加载' }]} /></Form.Item>
    <Form.Item name={['skill_loading_by_resource', versionId, 'selected']} label="触发按需技能" valuePropName="checked"><Switch /></Form.Item>
    <Form.Item name={['skill_loading_by_resource', versionId, 'selected_files']} label="加载参考资料"><Select mode="multiple" loading={!query.data && !query.error}
      options={query.data?.files.filter(f => f.relative_path !== 'SKILL.md').map(f => ({ value: f.relative_path, label: `${f.relative_path}${f.unavailable_reason ? ` · ${f.unavailable_reason}` : ''}`, disabled: !f.loadable })) ?? []} /></Form.Item>
    <Form.Item name={['skill_loading_by_resource', versionId, 'priority']} label="加载优先级"><InputNumber min={-1000} max={1000} placeholder="沿用技能设置" /></Form.Item>
  </> }]} />
}
