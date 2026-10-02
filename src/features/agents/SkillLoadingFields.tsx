import { Card, Form, InputNumber, Select, Switch } from 'antd'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'

export function SkillLoadingFields({ versionId, label }: { versionId: string; label: string }) {
  const query = useQuery<Schema<'SkillVersionView'>>(`/admin/v1/skill-versions/${versionId}`)
  return <Card size="small" title={label} style={{ marginBottom: 16 }}>
    <ErrorNotice error={query.error} />
    <Form.Item name={['skill_loading_by_version', versionId, 'loading_mode']} label="加载方式"><Select allowClear placeholder="沿用技能设置"
      options={[{ value: 'mandatory', label: '始终加载' }, { value: 'on_demand', label: '按需加载' }]} /></Form.Item>
    <Form.Item name={['skill_loading_by_version', versionId, 'selected']} label="触发按需技能" valuePropName="checked"><Switch /></Form.Item>
    <Form.Item name={['skill_loading_by_version', versionId, 'selected_files']} label="加载参考资料"><Select mode="multiple" loading={!query.data && !query.error}
      options={query.data?.files.filter(f => f.relative_path !== 'SKILL.md').map(f => ({ value: f.relative_path, label: `${f.relative_path}${f.unavailable_reason ? ` · ${f.unavailable_reason}` : ''}`, disabled: !f.loadable })) ?? []} /></Form.Item>
    <Form.Item name={['skill_loading_by_version', versionId, 'priority']} label="加载优先级"><InputNumber min={-1000} max={1000} placeholder="沿用技能设置" /></Form.Item>
  </Card>
}
