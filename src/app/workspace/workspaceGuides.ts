export interface GuideAction {
  label: string
  navigationKey: string
  search?: string
}

interface GuideStep {
  title: string
  description: string
  action: GuideAction
}

interface WorkspaceGuide {
  key: string
  label: string
  steps: GuideStep[]
}

const connections: GuideAction = { label: '打开供应商连接', navigationKey: 'models', search: '?tab=connections' }
const models: GuideAction = { label: '打开模型配置', navigationKey: 'models' }
const routes: GuideAction = { label: '打开模型路由', navigationKey: 'model-routes' }
const prompts: GuideAction = { label: '打开提示词', navigationKey: 'prompts' }
const mcp: GuideAction = { label: '打开 MCP 连接', navigationKey: 'mcp-connections' }
const tools: GuideAction = { label: '打开工具', navigationKey: 'tools' }
const skills: GuideAction = { label: '打开技能', navigationKey: 'skills' }
const agents: GuideAction = { label: '打开智能体', navigationKey: 'agents' }

export const workspaceGuides: readonly WorkspaceGuide[] = [
  {
    key: 'initialization', label: '初始化配置修改', steps: [
      {
        title: '核对供应商地址与允许的 IP 范围',
        description: '在供应商连接中点击“编辑”，核对基础地址。允许的 IP 范围留空时仅访问公网；使用内网模型或代理时，填写实际使用的 CIDR 网段，每行一个。',
        action: connections,
      },
      {
        title: '确认模型 API Key 可用',
        description: '在同一连接的编辑窗口填写“API Key”。留空会保留原密钥；恢复后密钥无法解密或鉴权失败时，重新填写并保存，再到模型列表测试连接。',
        action: connections,
      },
      {
        title: '核对 MCP 地址与鉴权',
        description: '打开对应连接，核对服务地址，在“配置鉴权”中更新鉴权地址、appId 和 appSecret，或对应的服务令牌。保存后执行连接测试与工具发现。',
        action: mcp,
      },
      {
        title: '重新验证当前环境',
        description: '先在模型列表执行“测试连接”，再按需进行“能力验证”。归档中的历史成功记录不代表当前环境可用；地址、协议或 IP 范围变更后，需要重新验证所需能力。',
        action: models,
      },
      {
        title: '核对智能体依赖与执行计划',
        description: '确认模型路由、提示词、工具和技能均可用，使用测试输入调试智能体。已有定时计划可在“业务接入 → 运行与事件 → 定时运行”中核对启用状态与时间安排。',
        action: agents,
      },
    ],
  },
  {
    key: 'models', label: '模型配置', steps: [
      {
        title: '创建供应商连接',
        description: '选择供应商和协议，填写 HTTPS 基础地址、API Key、超时及允许的 IP 范围。同一连接可以供多个模型使用。',
        action: connections,
      },
      {
        title: '登记模型',
        description: '新增模型，选择供应商连接，填写模型名称、稳定别名和供应商模型名。上下文上限按供应商实际能力填写，未知时可留空。',
        action: models,
      },
      {
        title: '测试连接',
        description: '在模型列表点击“测试连接”，检查网络和密钥。连接失败时按反馈修正地址、IP 范围或 API Key，然后重新测试。',
        action: models,
      },
      {
        title: '验证所需能力',
        description: '执行“能力验证”，选择实际需要的文本生成、工具调用、流式输出等能力。验证会调用模型并产生用量，通过后再配置模型路由。',
        action: models,
      },
    ],
  },
  {
    key: 'routes', label: '模型路由', steps: [
      {
        title: '新建路由并选择模型',
        description: '填写路由名称与编码，选择首选模型。需要回退时按优先顺序添加其他模型，回退列表可留空。',
        action: routes,
      },
      {
        title: '设置能力与尝试上限',
        description: '按用途选择必需能力，配置模型参数、总尝试上限和每个模型的重试上限。用于语义检索的路由需要向量能力。',
        action: routes,
      },
      {
        title: '发布并关联使用',
        description: '确认候选模型已通过当前配置所需的能力验证，再发布路由。发布后可在提示词调试和智能体配置中选择。',
        action: routes,
      },
      {
        title: '修改前查看引用',
        description: '查看哪些资源正在使用该路由。已发布路由保存修改后，对引用方的新任务生效；需要独立策略时另建路由。',
        action: routes,
      },
    ],
  },
  {
    key: 'prompts', label: '提示词', steps: [
      {
        title: '创建提示词并编写指令',
        description: '填写名称与用途，明确任务目标、处理边界和输出要求。将业务输入放入消息模板，通过变量传入实际内容。',
        action: prompts,
      },
      {
        title: '声明变量并预览',
        description: '为模板中使用的变量配置名称、类型、来源和必填规则。填入样例预览渲染结果，检查缺失变量及输入组织。',
        action: prompts,
      },
      {
        title: '使用模型路由调试',
        description: '选择已发布的模型路由，填写正常、信息不足等样例，检查实际输出是否满足要求。调试会产生模型用量。',
        action: prompts,
      },
      {
        title: '发布后绑定智能体',
        description: '完成验证后发布提示词，再在智能体中选择。后续修改已发布提示词前查看引用，保存后会影响所有引用方的新任务。',
        action: prompts,
      },
    ],
  },
  {
    key: 'mcp', label: 'MCP连接', steps: [
      {
        title: '登记服务连接',
        description: '新增连接，填写名称、连接方式和 MCP 服务地址，设置操作超时。地址需能从平台服务端访问。',
        action: mcp,
      },
      {
        title: '配置鉴权',
        description: '进入连接详情，点击“配置鉴权”。服务间鉴权填写令牌地址、appId 和 appSecret；使用 Bearer Token 的服务填写对应令牌。',
        action: mcp,
      },
      {
        title: '测试连接并发现工具',
        description: '手动测试连接，成功后发现远程工具。若提示目的地址未获允许，请联系管理员核对服务端出站配置。',
        action: mcp,
      },
      {
        title: '审阅工具并启用连接',
        description: '检查远程工具名称、参数及同步差异，选择需要的工具导入。完成连接校验后启用，再到工具管理补齐配置并发布。',
        action: mcp,
      },
    ],
  },
  {
    key: 'tools', label: '工具', steps: [
      {
        title: '导入或创建工具',
        description: '业务 MCP 工具从连接详情发现并导入；其他已支持来源可在工具管理创建。为工具填写清楚的名称和用途。',
        action: tools,
      },
      {
        title: '核对参数、结果和连接',
        description: '检查输入输出契约、必填字段及连接绑定，确认工具的实际影响是只读、幂等写入还是外部写入。',
        action: tools,
      },
      {
        title: '设置权限与执行策略',
        description: '配置适用环境、主体要求、超时和重试。写入工具需明确授权方式；幂等写入还需配置回执核查，避免结果未知时重复执行。',
        action: tools,
      },
      {
        title: '测试、发布并加入白名单',
        description: '用测试参数验证结果。写入测试可能产生实际业务操作，先核对参数和授权。发布后将工具加入智能体的工具白名单。',
        action: tools,
      },
    ],
  },
  {
    key: 'skills', label: '技能', steps: [
      {
        title: '创建技能或导入技能包',
        description: '填写技能名称、用途和指令，或导入包含 SKILL.md 的技能包。指令中说明适用情况、处理步骤和结果要求。',
        action: skills,
      },
      {
        title: '检查文件与依赖',
        description: '在包文件中核对指令和参考资料，绑定当前渠道的工具并声明所需模型能力。导入外部技能后需要重新确认工具映射。',
        action: skills,
      },
      {
        title: '验证加载并发布',
        description: '检查变量、文件及上下文预算，执行加载验证与测试，确认技能内容可用，再发布技能。',
        action: skills,
      },
      {
        title: '配置智能体加载方式',
        description: '在智能体中选择已发布技能，设置始终加载或按需加载，并配置参考资料、优先级与上下文额度。调试时核对实际加载内容。',
        action: agents,
      },
    ],
  },
  {
    key: 'agents', label: '智能体', steps: [
      {
        title: '定义任务与输入输出',
        description: '新建智能体，填写名称、编码与用途，选择流程类型。定义输入输出字段及必填规则，明确任务完成条件。',
        action: agents,
      },
      {
        title: '组合已发布的资源',
        description: '选择模型路由、提示词、工具白名单和技能，配置步骤与流转条件。仅在需要时启用会话、记忆和语义检索。',
        action: agents,
      },
      {
        title: '设置运行限制并调试',
        description: '配置模型轮数、工具调用次数、Token、上下文和时间上限。校验流程后，用测试输入检查输出及步骤记录，修正失败环节。',
        action: agents,
      },
      {
        title: '发布到当前环境',
        description: '核对配置差异、依赖和权限，完成发布。需要定时执行时，进入“业务接入 → 运行与事件 → 定时运行”配置计划及输入，再查看运行记录。',
        action: agents,
      },
    ],
  },
]
