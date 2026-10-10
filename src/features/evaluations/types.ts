import type { Schema } from '../../components/Management'
export { parseJson as parse } from '../../api/json'

export type Dataset = Schema<'DatasetView'>
export type Evaluation = Schema<'EvaluationView'>
export type Report = Schema<'ComparisonReport'>
export type Sample = Schema<'CaseInput'>
export const pretty = (value: unknown) => JSON.stringify(value, null, 2)
export const decisions = [{ value: 'approved', label: '通过' }, { value: 'rejected', label: '不通过' }, { value: 'disputed', label: '有争议' }]
export type Candidate = { candidate_id: string; agent_name: string; version_id: string; version_label: string; total: number; counts: Record<string, number>; pass_rate: number; regression: number | null; critical_failures: number; human_disagreements?: number; quality_passed: boolean; release_passed: boolean }
export type Result = { result_id: string; title: string; candidate_id: string; run_id: string | null; state: string; state_label: string; attempt_number: number; revision: number; difference_label?: string; labels: string[]; judgment: { passed?: boolean; human_required?: boolean; violations: { name: string }[]; reason?: string; semantic?: { score?: number } | null } | null; human_label: { decision: string; reason: string } | null }
