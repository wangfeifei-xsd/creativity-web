#!/usr/bin/env bash
# 从前端目录读取配置与锁文件，不依赖调用时的工作目录。
set -euo pipefail

web_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$web_dir"

# 优先复用项目内的 Node.js 与 pnpm，避免系统默认版本不匹配。
local_tools_dir="$web_dir/../.tools/js/node_modules/.bin"
if [[ -d "$local_tools_dir" ]]; then
    export PATH="$local_tools_dir:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
    printf '%s\n' '缺少 Node.js，请安装 22 LTS（至少 22.12.0）后重试。' >&2
    exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 22 && minor >= 12 ? 0 : 1)'; then
    printf 'Node.js 版本不匹配：当前 %s，需要 >=22.12.0 <23。\n' "$(node --version)" >&2
    exit 1
fi

required_pnpm_version="$(node -p "require('./package.json').packageManager.slice('pnpm@'.length)")"
if ! command -v pnpm >/dev/null 2>&1; then
    printf '缺少 pnpm，请安装 %s 后重试。\n' "$required_pnpm_version" >&2
    exit 1
fi

pnpm_version="$(pnpm --version)"
if [[ "$pnpm_version" != "$required_pnpm_version" ]]; then
    printf 'pnpm 版本不匹配：当前 %s，需要 %s。\n' "$pnpm_version" "$required_pnpm_version" >&2
    exit 1
fi

if [[ ! -f .env ]]; then
    (umask 077 && cp .env.example .env)
    printf '%s\n' '已从 .env.example 创建本地配置 .env'
fi

pnpm install --frozen-lockfile
exec pnpm dev "$@"
