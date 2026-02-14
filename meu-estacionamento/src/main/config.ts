import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const configPath = () => join(app.getPath('userData'), 'config.json')

export interface AppConfig {
  printerName?: string
}

const defaults: AppConfig = {}

export function getConfig(): AppConfig {
  try {
    const p = configPath()
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, 'utf8'))
      return { ...defaults, ...data }
    }
  } catch (e) {
    console.error('Erro ao ler config:', e)
  }
  return { ...defaults }
}

export function saveConfig(config: Partial<AppConfig>): void {
  try {
    const current = getConfig()
    const next = { ...current, ...config }
    writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (e) {
    console.error('Erro ao salvar config:', e)
  }
}
