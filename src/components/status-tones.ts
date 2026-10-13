import type { components } from '../api/generated/schema'

export type StatusTone = components['schemas']['DisplayStatus']['tone']

// 旧接口仅提供状态文案时补齐展示色，不推导或修改业务状态；未知文案使用中性色。
const labels: Record<Exclude<StatusTone, 'default'>, ReadonlySet<string>> = {
  success: new Set(['启用', '已启用', '已完成', '完成', '已发布', '成功', '已成功', '正常', '健康', '已连接',
    '可用', '有效', '生效中', '使用中', '通过', '已通过', '验证通过', '检查通过', '已支持', '已确认', '已明确确认',
    '已结算', '已计价', '供应商已上报', '已投递', '已受理', '已匹配', '一致', '金额一致', '完整', '价格完整', '可加载', '可执行', '可下载']),
  processing: new Set(['进行中', '执行中', '运行中', '处理中', '生成中', '整理中', '投递中', '派发中', '清理中', '删除中', '同步中', '连接中', '正在导出']),
  warning: new Set(['待确认', '待核实', '结果待核实', '待审核', '等待补充', '需要补充信息', '等待审批', '取消中',
    '待重试', '等待重试', '清理待重试', '部分完成', '部分结果', '数据不足', '异常', '降级', '需人工判定',
    '估算', '暂估', '未定价', '用量缺失', '部分费用未确认', '已触发', '已超限', '存在差异', '配置已过期',
    '金额差异', '平台记录缺失', '供应商记录缺失', '供应商重复行', '请求标识冲突', '币种不同', '时间不符', '平台缺价', '平台金额未确认']),
  error: new Set(['失败', '已失败', '执行失败', '验证失败', '连接失败', '投递失败', '受理失败', '整理失败', '导出失败', '未通过', '不支持',
    '超时', '已超时', '已拒绝', '拒绝', '不可用', '不可执行', '不可加载']),
}

export function statusTone(label?: string | null): StatusTone {
  for (const tone of ['success', 'processing', 'warning', 'error'] as const) {
    if (labels[tone].has(label?.trim() ?? '')) return tone
  }
  return 'default'
}
