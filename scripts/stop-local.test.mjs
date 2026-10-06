import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'

const webDir = dirname(dirname(fileURLToPath(import.meta.url)))
let workspace
let root
let script
let children

beforeEach(() => {
  const output = join(webDir, '.local')
  mkdirSync(output, { recursive: true })
  workspace = mkdtempSync(join(output, 'stop-script-'))
  root = join(workspace, '前端 项目')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  script = join(root, 'scripts', 'stop-local.sh')
  copyFileSync(join(webDir, 'scripts', 'stop-local.sh'), script)
  children = []
})

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGKILL')
      await exited
    }
  }
  rmSync(workspace, { recursive: true, force: true })
})

async function startFixture(cwd, relativePath, args = []) {
  const entry = join(cwd, relativePath)
  const ready = `${entry}.ready`
  mkdirSync(dirname(entry), { recursive: true })
  writeFileSync(entry, `
    require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid))
    setInterval(() => {}, 1000)
  `)
  const child = spawn(process.execPath, [entry, ...args], { cwd, stdio: 'ignore' })
  children.push(child)
  for (let attempt = 0; attempt < 100 && !existsSync(ready); attempt += 1) {
    await delay(20)
  }
  expect(existsSync(ready)).toBe(true)
  return child
}

function stop(...args) {
  // 从其他工作目录调用，验证脚本自行定位项目，而非依赖调用者目录。
  return spawnSync('/bin/bash', [script, ...args], {
    cwd: workspace, encoding: 'utf8', timeout: 20000,
  })
}

test('停止本项目全部自定义端口的 Vite，保留其他项目及普通 Node 进程', async () => {
  const vite = await startFixture(root, 'node_modules/vite/bin/vite.js', ['--port', '5174'])
  const second = await startFixture(root, 'node_modules/.bin/vite', ['--port', '6174'])
  const ordinary = await startFixture(root, 'ordinary.cjs')
  const other = await startFixture(
    join(workspace, '其他项目'), 'node_modules/vite/bin/vite.js',
  )
  const viteExited = once(vite, 'exit')
  const secondExited = once(second, 'exit')
  const result = stop()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('前端已停止')
  await Promise.all([viteExited, secondExited])
  expect(() => process.kill(vite.pid, 0)).toThrow()
  expect(() => process.kill(second.pid, 0)).toThrow()
  expect(() => process.kill(ordinary.pid, 0)).not.toThrow()
  expect(() => process.kill(other.pid, 0)).not.toThrow()
  expect(stop().stdout).toContain('未运行')
}, 25000)

test('未运行时重复停止成功，不创建配置或安装依赖', () => {
  expect(stop().status).toBe(0)
  expect(stop().stdout).toContain('未运行')
  expect(existsSync(join(root, '.env'))).toBe(false)
  expect(existsSync(join(root, 'node_modules'))).toBe(false)
})

test('拒绝未知参数', () => {
  const result = stop('--unknown')
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('用法')
})
