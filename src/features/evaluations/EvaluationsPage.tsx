import { Button, Space, Table, Tabs } from 'antd'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, EditorDialog, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { DatasetDetail } from './DatasetDetail'
import { NewEvaluation } from './NewEvaluation'
import { EvaluationDetail } from './EvaluationDetail'
import type { Dataset, Evaluation } from './types'

export function EvaluationsPage() {
  const { '*': path } = useParams()
  if (path?.startsWith('datasets/')) return <DatasetDetail key={path} identifier={path.slice(9)} />
  if (path) return <EvaluationDetail key={path} identifier={path} />
  return <EvaluationList />
}

function EvaluationList() {
  const datasets = useQuery<Schema<'DatasetList'>>('/admin/v1/evaluation-datasets')
  const evaluations = useQuery<Schema<'EvaluationList'>>('/admin/v1/evaluations')
  const [creating, setCreating] = useState<'dataset' | 'evaluation'>()
  const navigate = useNavigate()
  return <PageContainer title="效果评测" actions={<Button onClick={() => { datasets.reload(); evaluations.reload() }}>刷新</Button>}>
    <Tabs items={[
      { key: 'datasets', label: '样本集', children: <><Space style={{ marginBottom: 16 }}><ActionButtons actions={datasets.data?.actions ?? []} handlers={{ create: () => setCreating('dataset') }} /></Space>
        {datasets.error ? <ErrorState error={datasets.error} onRetry={datasets.reload} /> : !datasets.data ? <LoadingState /> : <Table rowKey="dataset_id" dataSource={datasets.data.items} columns={[
          { title: '样本集', render: (_, row) => <Link to={`/evaluations/datasets/${row.dataset_id}`}>{row.name}</Link> },
          { title: '适用能力', dataIndex: 'scenario' }, { title: '负责人', dataIndex: 'owner' }, { title: '适用范围', dataIndex: 'applicability' },
        ]} />}</> },
      { key: 'tasks', label: '任务与报告', children: <><Space style={{ marginBottom: 16 }}><ActionButtons actions={evaluations.data?.actions ?? []} handlers={{ create: () => setCreating('evaluation') }} /></Space>
        {evaluations.error ? <ErrorState error={evaluations.error} onRetry={evaluations.reload} /> : !evaluations.data ? <LoadingState /> : <Table rowKey="evaluation_id" dataSource={evaluations.data.items} columns={[
          { title: '评测任务', render: (_, row) => <Link to={`/evaluations/${row.evaluation_id}`}>{row.name}</Link> },
          { title: '样本集', render: (_, row) => `${row.dataset_name} · ${row.dataset_version_label}` },
          { title: '模式', dataIndex: 'execution_mode_label' }, { title: '状态', render: (_, row) => <StatusTag status={row.state} /> },
        ]} />}</> },
    ]} />
    {creating === 'dataset' && <EditorDialog title="新建样本集" fields={[{ name: 'name', label: '样本集名称', required: true }, { name: 'scenario', label: '适用能力', required: true }, { name: 'owner', label: '负责人', required: true }, { name: 'applicability', label: '适用范围', required: true }]} onClose={() => setCreating(undefined)} onSaved={() => { setCreating(undefined); datasets.reload() }} onSave={async values => { const value = await send<Dataset>('/admin/v1/evaluation-datasets', 'POST', values); navigate(`/evaluations/datasets/${value.dataset_id}`) }} />}
    {creating === 'evaluation' && datasets.data && <NewEvaluation datasets={datasets.data.items} onClose={() => setCreating(undefined)} onSaved={(value: Evaluation) => navigate(`/evaluations/${value.evaluation_id}`)} />}
  </PageContainer>
}
