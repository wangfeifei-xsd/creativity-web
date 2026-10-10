export const capabilityOptions = [{ value: 'text', label: '文本生成' }, { value: 'tools', label: '工具调用' },
  { value: 'structured_output', label: '原生结构化输出' }, { value: 'streaming', label: '流式输出' }, { value: 'embedding', label: '向量生成' }]
export const parameterOptions = [{ value: 'max_tokens', label: '最大输出 Token 数' }, { value: 'temperature', label: '温度' },
  { value: 'top_p', label: '采样范围' }, { value: 'stop', label: '停止词' }, { value: 'seed', label: '随机种子' }]
export const dimensionNames: Record<string, string> = { input: '输入', output: '输出', cache_read: '缓存读取', cache_write: '缓存写入' }
export { jsonObject } from '../../api/json'
