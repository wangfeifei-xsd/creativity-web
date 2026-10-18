import { isObject, type SchemaObject } from '../../components/schema-fields/schema'

export const validationSource = `def transform(value, context):
    inputs = {
        key: item.strip() if isinstance(item, str) else item
        for key, item in value.items()
    }
    missing = [key for key, item in inputs.items() if item is None or item == ""]
    success = not missing
    return {
        "business_status": "COMPLETED" if success else "NEEDS_INPUT",
        "schema_version": "1.0",
        "data": {
            "success": success,
            "conclusion": "校验通过" if success else "以下参数不能为空：" + "、".join(missing),
            "inputs": inputs,
        },
        "warnings": [],
        "evidence_refs": [],
    }
`
export function validationSchema(inputs: SchemaObject): SchemaObject {
  // 业务失败也要保留整理后的参数，出参只声明结构，不复用可能未通过的取值约束。
  function structure(schema: SchemaObject): SchemaObject {
    return Object.fromEntries(Object.entries(schema).filter(([key]) => ['type', 'title', 'description', 'properties', 'items', 'required', 'additionalProperties'].includes(key)).map(([key, value]) => [key,
      key === 'properties' && isObject(value) ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, isObject(child) ? structure(child) : child])) : key === 'items' && isObject(value) ? structure(value) : value,
    ]))
  }
  return { type: 'object', properties: {
    business_status: { type: 'string', title: '业务状态', enum: ['COMPLETED', 'NEEDS_INPUT'] },
    schema_version: { type: 'string', title: '结构版本', const: '1.0' },
    data: { type: 'object', title: '校验结果', properties: {
      success: { type: 'boolean', title: '校验通过' }, conclusion: { type: 'string', title: '校验结论' },
      inputs: { ...structure(inputs), type: 'object', title: '结构化入参', properties: structure(inputs).properties ?? {} },
    }, required: ['success', 'conclusion', 'inputs'], additionalProperties: false },
    warnings: { type: 'array', title: '警告', items: { type: 'string' } }, evidence_refs: { type: 'array', title: '证据引用', items: { type: 'object' } },
  }, required: ['business_status', 'schema_version', 'data', 'warnings', 'evidence_refs'], additionalProperties: false }
}

