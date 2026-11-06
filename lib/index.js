/**
 * dsh-foxy — host half.
 *
 * Foxy is a persona preset plus an extension-contract layer, not a chat
 * application. The actual conversation runs in a normal DSH session using the
 * `Foxy` agent preset. This plugin owns:
 *
 *   - the `ctx.foxy` registry that memory/capability/transport subplugins use;
 *   - the read-only status API used by the sidebar panel;
 *   - preset discovery and validation.
 *
 * It intentionally does not create agents, own a chat transcript, or store
 * memory. Those belong to DSH sessions and the optional memory subplugin.
 */

import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { readPersona } from './preset.js'

export const name = 'dsh-foxy'

export const STATUS_ROUTE = '/api/dsh-foxy/status'
export const SETTINGS_ROUTE = '/api/dsh-foxy/settings'
const STATUS_CACHE_MS = 1500
const DEFAULT_PRESET_ID = 'foxy3'
const SETTINGS_KEYS = [
  'presetId',
  'presetPath',
  'enableTools',
  'includeRuntimeContext',
  'memoryContextEntries',
  'provider',
  'bridgeUrl',
  'bridgeToken',
  'bridgePresetId',
  'batchSize',
  'flushIntervalMs',
  'extractModel',
]
const NUMBER_SETTINGS = new Set(['memoryContextEntries', 'batchSize', 'flushIntervalMs'])
const BOOLEAN_SETTINGS = new Set(['enableTools', 'includeRuntimeContext'])

function settingsPath() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'foxy', 'settings.json')
}

async function readSettings(config = {}) {
  const defaults = {
    presetId: config.presetId || DEFAULT_PRESET_ID,
    presetPath: config.presetPath || '',
    enableTools: config.enableTools === true,
    includeRuntimeContext: config.includeRuntimeContext === true,
    memoryContextEntries: Number(config.memoryContextEntries) || 20,
    provider: config.provider || 'livingmemory',
    bridgeUrl: config.bridgeUrl || 'http://127.0.0.1:5140/foxy-memory',
    bridgeToken: config.bridgeToken || '',
    bridgePresetId: config.bridgePresetId || 'foxy3（Character）',
    batchSize: Number(config.batchSize) || 8,
    flushIntervalMs: Number(config.flushIntervalMs) || 30000,
    extractModel: config.extractModel || 'deepseek/deepseek-flash',
  }
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), 'utf8'))
    for (const key of SETTINGS_KEYS) {
      if (parsed[key] === undefined) continue
      if (BOOLEAN_SETTINGS.has(key)) defaults[key] = parsed[key] === true
      else if (NUMBER_SETTINGS.has(key)) defaults[key] = Math.max(1, Number(parsed[key]) || defaults[key])
      else defaults[key] = String(parsed[key] ?? '')
    }
  } catch {}
  return defaults
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function parseRequestBody(request) {
  const raw = request?.body
  if (raw && typeof raw.getReader === 'function') {
    const text = await new Response(raw).text()
    return text ? JSON.parse(text) : {}
  }
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) return raw
  if (typeof request?.json === 'function') {
    try {
      return await request.json()
    } catch {}
  }
  if (typeof request?.text === 'function') {
    const text = await request.text()
    return text ? JSON.parse(text) : {}
  }
  if (typeof raw === 'string') return raw ? JSON.parse(raw) : {}
  if (raw && (Buffer.isBuffer(raw) || raw instanceof Uint8Array)) {
    const text = Buffer.from(raw).toString('utf8')
    return text ? JSON.parse(text) : {}
  }
  return {}
}

function expandPath(path) {
  if (!path) return ''
  const value = String(path).replace(/^~(?=$|[\\/])/, homedir())
  return resolve(value)
}

export function resolvePresetsDir(config = {}) {
  if (config.presetsDir) return expandPath(config.presetsDir)
  if (process.env.FOXY_PRESETS_DIR) return expandPath(process.env.FOXY_PRESETS_DIR)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'foxy', 'presets')
}

async function listPresetFiles(dir) {
  try {
    const names = await readdir(dir)
    return names
      .filter((entry) => /\.(ya?ml)$/i.test(entry))
      .sort((a, b) => a.localeCompare(b))
      .map((entry) => ({ id: entry.replace(/\.(ya?ml)$/i, ''), file: entry, path: join(dir, entry) }))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function blockHeadings(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => /^#{1,4}\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
    .filter(Boolean)
}

async function findPresetPath(config = {}) {
  const id = String(config.presetId || config.id || DEFAULT_PRESET_ID)
  const candidates = []
  if (config.presetPath) candidates.push(expandPath(config.presetPath))
  if (process.env.FOXY_PRESET_PATH) candidates.push(expandPath(process.env.FOXY_PRESET_PATH))
  candidates.push(join(resolvePresetsDir(config), `${id}.yml`))
  candidates.push(join(resolvePresetsDir(config), `${id}.yaml`))

  for (const path of candidates) {
    try {
      const info = await stat(path)
      if (info.isFile()) return path
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return ''
}

/**
 * Read the visible status of the selected persona preset.
 *
 * This uses the same `readPersona` used by the agent-preset half, so the
 * panel shows exactly what the model will receive (including projection from
 * a ChatLuna Character `system` block).
 */
export async function readPresetStatus(config = {}) {
  const presetsDir = resolvePresetsDir(config)
  const available = await listPresetFiles(presetsDir)
  const path = await findPresetPath(config)

  if (!path) {
    return {
      ok: false,
      presetsDir,
      available,
      error: `No Foxy persona found. Put ${DEFAULT_PRESET_ID}.yml in ${presetsDir}, or set presetPath.`,
    }
  }

  const file = await readFile(path, 'utf8')
  const fileInfo = await stat(path)
  let persona
  try {
    persona = readPersona({ ...config, presetPath: path })
  } catch (error) {
    return {
      ok: false,
      presetsDir,
      available,
      path,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const headings = blockHeadings(persona.text)
  return {
    ok: true,
    presetsDir,
    available,
    format: persona.format,
    name: persona.nickName || persona.name,
    fileId: persona.name,
    path,
    lines: persona.text.split(/\r?\n/).length,
    systemLines: persona.text.split(/\r?\n/).length,
    headings,
    bytes: Buffer.byteLength(file),
    updatedAt: fileInfo.mtimeMs,
    sha256: createHash('sha256').update(file).digest('hex').slice(0, 12),
  }
}

function memoryStats(ctx) {
  try {
    const provider = typeof ctx.get === 'function' ? ctx.get('foxyMemory') : ctx.foxyMemory
    if (!provider || typeof provider.stats !== 'function') return null
    const value = provider.stats()
    return value && typeof value.then === 'function' ? null : value
  } catch {
    return null
  }
}

export function apply(ctx, config = {}) {
  const presets = new Map()
  const memoryProviders = new Map()
  const capabilities = new Map()
  const transports = new Map()
  let cached = null
  let cachedAt = 0

  const getStatus = async (force = false) => {
    if (!force && cached && Date.now() - cachedAt < STATUS_CACHE_MS) return cached
    const settings = await getSettings()
    const effective = { ...config, ...settings }
    const raw = await readPresetStatus(effective)
    const memory = memoryStats(ctx)
    const presetId = String(settings.presetId || DEFAULT_PRESET_ID)
    cached = raw.ok
      ? {
          ...raw,
          presetId,
          settings,
          memory,
          preset: {
            format: raw.format,
            name: raw.name,
            fileId: raw.fileId,
            path: raw.path,
            lines: raw.lines,
            systemLines: raw.systemLines,
            headings: raw.headings,
            bytes: raw.bytes,
            updatedAt: raw.updatedAt,
            sha256: raw.sha256,
          },
        }
      : { ...raw, presetId, settings, memory }
    cachedAt = Date.now()
    if (raw.ok) {
      try {
        service.registerPreset({
          id: raw.fileId,
          name: raw.name,
          format: raw.format,
          source: raw.path,
          path: raw.path,
        })
      } catch {
        // A preset without an id is still valid to display.
      }
    }
    return cached
  }

  const service = {
    version: 2,
    contract: 'foxy/1',
    presetId: String(config.presetId || DEFAULT_PRESET_ID),

    registerPreset(preset) {
      const id = String(preset?.id || '').trim()
      if (!id) throw new TypeError('foxy preset needs an id')
      presets.set(id, { ...preset, id })
      return () => presets.delete(id)
    },
    getPreset(id) {
      return presets.get(String(id)) || null
    },
    listPresets() {
      return [...presets.values()]
    },

    registerMemoryProvider(providerName, factory) {
      const key = String(providerName || '').trim()
      if (!key || typeof factory !== 'function') {
        throw new TypeError('foxy memory provider needs a name and factory')
      }
      memoryProviders.set(key, factory)
      return () => memoryProviders.delete(key)
    },
    async getMemoryProvider(providerName = 'local') {
      const factory = memoryProviders.get(String(providerName))
      return factory ? await factory() : null
    },
    listMemoryProviders() {
      return [...memoryProviders.keys()]
    },

    registerCapability(capabilityName, factory) {
      const key = String(capabilityName || '').trim()
      if (!key || typeof factory !== 'function') {
        throw new TypeError('foxy capability needs a name and factory')
      }
      capabilities.set(key, factory)
      return () => capabilities.delete(key)
    },
    async getCapability(capabilityName) {
      const factory = capabilities.get(String(capabilityName))
      return factory ? await factory() : null
    },
    listCapabilities() {
      return [...capabilities.keys()]
    },

    registerTransport(transportName, factory) {
      const key = String(transportName || '').trim()
      if (!key || typeof factory !== 'function') {
        throw new TypeError('foxy transport needs a name and factory')
      }
      transports.set(key, factory)
      return () => transports.delete(key)
    },
    async getTransport(transportName) {
      const factory = transports.get(String(transportName))
      return factory ? await factory() : null
    },
    listTransports() {
      return [...transports.keys()]
    },

    status: () => getStatus(),
    refresh: () => getStatus(true),
    memoryStats: () => memoryStats(ctx),
  }

  if (typeof ctx.provide === 'function') ctx.provide('foxy', service)
  else if (typeof ctx.set === 'function') ctx.set('foxy', service)
  ctx.foxy = service

  let settingsCache = null
  const getSettings = async () => {
    if (!settingsCache) settingsCache = await readSettings(config)
    return settingsCache
  }

  ctx.inject?.(['connection'], (host) => {
    const register = host?.connection?.fetch?.register
    if (typeof register !== 'function') return
    try {
      register({
        path: STATUS_ROUTE,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => json(await getStatus(true)),
      })
      register({
        path: SETTINGS_ROUTE,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          try {
            if (request.method === 'GET') return json({ ok: true, settings: await getSettings() })
            let patch = {}
            try {
              patch = await parseRequestBody(request)
            } catch {
              return json({ ok: false, error: 'request body is not valid JSON' }, 400)
            }
            const current = await getSettings()
            const next = { ...current }
            for (const key of SETTINGS_KEYS) {
              if (patch[key] === undefined) continue
              if (BOOLEAN_SETTINGS.has(key)) next[key] = patch[key] === true
              else if (NUMBER_SETTINGS.has(key)) next[key] = Math.max(1, Number(patch[key]) || current[key])
              else next[key] = String(patch[key] ?? '')
            }
            const file = settingsPath()
            await mkdir(dirname(file), { recursive: true })
            await writeFile(file, JSON.stringify(next, null, 2), 'utf8')
            settingsCache = next
            let reloaded = false
            try {
              const loader = typeof ctx.get === 'function' ? ctx.get('loader') : ctx.loader
              const entry = loader?.resolve?.('dsh-foxy-memory')
              if (entry && typeof loader.update === 'function') {
                await loader.update(entry.id || 'dsh-foxy-memory', { config: { ...(entry.options?.config || {}), ...next } })
                reloaded = true
              }
            } catch (error) {
              ctx.logger?.warn?.(`[dsh-foxy] settings saved but reload failed: ${error instanceof Error ? error.message : String(error)}`)
            }
            return json({ ok: true, settings: next, reloaded })
          } catch (error) {
            const message = error instanceof Error ? error.stack || error.message : String(error)
            ctx.logger?.warn?.(`[dsh-foxy] settings request failed: ${message}`)
            try {
              await appendFile(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'foxy', 'settings-error.log'), `${new Date().toISOString()} ${message}\n`)
            } catch {}
            return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500)
          }
        },
      })
    } catch (error) {
      ctx.logger?.warn?.(
        `[dsh-foxy] could not register ${STATUS_ROUTE}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })

  ctx.logger?.info?.(`[dsh-foxy] registry ready; presetsDir=${resolvePresetsDir(config)}`)
  return { service, getStatus }
}

export const internals = {
  blockHeadings,
  findPresetPath,
  listPresetFiles,
  readPresetStatus,
  resolvePresetsDir,
}

