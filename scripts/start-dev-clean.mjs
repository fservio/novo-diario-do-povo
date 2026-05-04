import { mkdirSync, openSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = '3000'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repo = resolve(scriptDir, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const logDir = resolve(repo, '.agent', 'logs')
mkdirSync(logDir, { recursive: true })
const outLog = resolve(logDir, `novo-diario-dev-${stamp}.out.log`)
const errLog = resolve(logDir, `novo-diario-dev-${stamp}.err.log`)

const out = openSync(outLog, 'a')
const err = openSync(errLog, 'a')

const env = {
  SystemRoot: process.env.SystemRoot || 'C:\\Windows',
  windir: process.env.windir || process.env.SystemRoot || 'C:\\Windows',
  ComSpec: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
  TEMP: process.env.TEMP || 'C:\\tmp',
  TMP: process.env.TMP || 'C:\\tmp',
  USERPROFILE: process.env.USERPROFILE || '',
  APPDATA: process.env.APPDATA || '',
  LOCALAPPDATA: process.env.LOCALAPPDATA || '',
  HOMEDRIVE: process.env.HOMEDRIVE || 'C:',
  HOMEPATH: process.env.HOMEPATH || '\\',
  Path: [
    'C:\\Program Files\\nodejs',
    `${process.env.SystemRoot || 'C:\\Windows'}\\System32`,
    process.env.SystemRoot || 'C:\\Windows',
    `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0`,
  ].join(';'),
  NODE_ENV: 'development',
}

const node = 'C:\\Program Files\\nodejs\\node.exe'
const npmCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
const child = spawn(node, [npmCli, 'run', 'dev:sandbox'], {
  cwd: repo,
  env,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', out, err],
})

child.unref()

console.log(JSON.stringify({
  pid: child.pid,
  url: `http://localhost:${port}`,
  outLog,
  errLog,
}, null, 2))
