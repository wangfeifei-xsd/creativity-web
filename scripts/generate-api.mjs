import { readFile, writeFile } from 'node:fs/promises'
import openapiTS, { astToString } from 'openapi-typescript'

const source = new URL('../../creativity-service/contracts/openapi.json', import.meta.url)
const target = new URL('../src/api/generated/schema.ts', import.meta.url)
const schema = JSON.parse(await readFile(source, 'utf8'))
const content = '// 此文件由服务端 OpenAPI 自动生成，请勿手工修改。\n' +
  astToString(await openapiTS(schema, { alphabetize: true }))

if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8').catch(() => '') !== content) {
    throw new Error('接口类型已变化，请执行 pnpm api:generate')
  }
} else {
  await writeFile(target, content)
}
