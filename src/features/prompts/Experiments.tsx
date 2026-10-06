import { Button, Space } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '../../api/useQuery'
import { type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { NewEvaluation } from '../evaluations/NewEvaluation'

export function PromptExperiments({ promptId }: { promptId: string }) {
  const navigate = useNavigate()
  const experiments = useQuery<Schema<'EvaluationList'>>('/admin/v1/evaluations')
  const datasets = useQuery<Schema<'DatasetList'>>('/admin/v1/evaluation-datasets')
  const [creating, setCreating] = useState(false)
  if (experiments.error || datasets.error) return <ErrorState error={experiments.error ?? datasets.error} onRetry={() => { experiments.reload(); datasets.reload() }} />
  if (!experiments.data || !datasets.data) return <LoadingState />
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <Space><Button onClick={experiments.reload}>刷新</Button>{experiments.data.actions.some(action => action.action_key === 'create') && <Button type="primary" onClick={() => setCreating(true)}>新建实验</Button>}</Space>
    <Table rowKey="evaluation_id" dataSource={experiments.data.items.filter(item => item.config.experiment_prompt_id === promptId)} columns={[
      { title: '实验名称', render: (_, item) => <Link to={`/evaluations/${item.evaluation_id}`}>{item.name}</Link> },
      { title: '样本集', dataIndex: 'dataset_name' }, { title: '样本版本', dataIndex: 'dataset_version_label' },
      { title: '状态', render: (_, item) => item.state.label },
    ]} />
    {creating && <NewEvaluation promptId={promptId} datasets={datasets.data.items} onClose={() => setCreating(false)} onSaved={item => { setCreating(false); navigate(`/evaluations/${item.evaluation_id}`) }} />}
  </Space>
}
