#!/usr/bin/env bash
# 按项目目录定位 Vite，不依赖端口、Node.js 或 pnpm，也不停止其他项目。
set -euo pipefail

web_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

if [[ $# -ne 0 ]]; then
    printf '%s\n' '用法：./scripts/stop-local.sh' >&2
    exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
    printf '%s\n' '缺少 lsof，无法安全定位本项目的前端进程，请安装后重试。' >&2
    exit 1
fi

pids=()
identities=()
candidates="$(lsof -nP -a -d cwd -t -- "$web_dir" 2>/dev/null || true)"
while IFS= read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    identity="$(ps -p "$pid" -o lstart= -o command= 2>/dev/null || true)"
    case "$identity" in
        *"/vite/bin/vite.js" | *"/vite/bin/vite.js "* | \
        *"/node_modules/.bin/vite" | *"/node_modules/.bin/vite "*)
            pids+=("$pid")
            identities+=("$identity")
            ;;
    esac
done <<< "$candidates"

if [[ ${#pids[@]} -eq 0 ]]; then
    printf '%s\n' '本项目的前端未运行，无需停止。'
    exit 0
fi

for index in "${!pids[@]}"; do
    pid="${pids[$index]}"
    # 同时核对启动时间与命令，避免旧进程退出后误杀复用进程号的新进程。
    if [[ "$(ps -p "$pid" -o lstart= -o command= 2>/dev/null || true)" == "${identities[$index]}" ]]; then
        kill -TERM "$pid" 2>/dev/null || true
    fi
done

deadline=$((SECONDS + 15))
while true; do
    running=()
    for index in "${!pids[@]}"; do
        pid="${pids[$index]}"
        if [[ "$(ps -p "$pid" -o lstart= -o command= 2>/dev/null || true)" == "${identities[$index]}" ]]; then
            running+=("$pid")
        fi
    done
    [[ ${#running[@]} -ne 0 ]] || break
    if (( SECONDS >= deadline )); then
        printf '前端进程未在期限内停止（进程号：%s），请检查原启动终端。\n' "${running[*]}" >&2
        exit 1
    fi
    sleep 0.2
done

printf '%s\n' '本项目的前端已停止。'
