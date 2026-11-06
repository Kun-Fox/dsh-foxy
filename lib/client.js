window.__ModuleLoader__.load({
  id: 'dsh-foxy',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement

    const PANEL_ID = 'dsh-foxy'

    function FoxyIcon({ size = 18 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        h('path', { d: 'M4 5.5 7.5 8h9L20 5.5l-1.2 5.1c.4 1.2.2 2.5-.5 3.5-1 1.5-2.8 2.4-4.8 2.4h-3c-2 0-3.8-.9-4.8-2.4-.7-1-.9-2.3-.5-3.5Z' }),
        h('path', { d: 'M9 13.5h.01M15 13.5h.01M10 17c1.3.8 2.7.8 4 0' }),
      )
    }

    function Card({ label, value, detail, tone = 'idle' }) {
      return h(
        'div',
        { className: `foxy-card foxy-card-${tone}` },
        h('div', { className: 'foxy-card-label' }, label),
        h('div', { className: 'foxy-card-value' }, value),
        h('div', { className: 'foxy-card-detail' }, detail),
      )
    }

    function formatMemory(memory, presetId) {
      if (!memory) return { value: '未连接', detail: '安装 dsh-foxy-memory 子插件后，Foxy 会话会写入本地记忆。', tone: 'idle' }
      const bucket = memory.byPreset?.[presetId] || memory.byPreset?.['foxy3'] || null
      const total = bucket ? bucket.active + bucket.archived : memory.total || 0
      const active = bucket ? bucket.active : null
      return {
        value: total ? `${total} 条` : '空',
        detail: `${memory.entriesFile || memory.dataDir || 'local JSONL'}${active === null ? '' : ` · active ${active}`}`,
        tone: total ? 'live' : 'idle',
      }
    }

    function Field({ label, children }) {
      return h('label', { className: 'foxy-field' }, h('span', null, label), children)
    }

    function FoxyPage() {
      const [status, setStatus] = React.useState({ loading: true })
      const [nonce, setNonce] = React.useState(0)
      const [settings, setSettings] = React.useState(null)
      const [settingsMessage, setSettingsMessage] = React.useState('')

      React.useEffect(() => {
        let alive = true
        const controller = new AbortController()
        const load = async () => {
          try {
            const response = await fetch('/api/dsh-foxy/status', {
              cache: 'no-store',
              credentials: 'same-origin',
              signal: controller.signal,
            })
            const data = await response.json()
            if (alive) setStatus({ ...data, loading: false })
          } catch (error) {
            if (alive && error?.name !== 'AbortError') {
              setStatus({ ok: false, loading: false, error: error instanceof Error ? error.message : String(error) })
            }
          }
        }
        void load()
        const timer = setInterval(load, 10000)
        return () => {
          alive = false
          controller.abort()
          clearInterval(timer)
        }
      }, [nonce])

      React.useEffect(() => {
        fetch('/api/dsh-foxy/settings', { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => response.json())
          .then((data) => { if (data?.ok) setSettings(data.settings) })
          .catch(() => {})
      }, [])

      const saveSettings = async () => {
        setSettingsMessage('保存中…')
        try {
          const response = await fetch('/api/dsh-foxy/settings', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(settings),
          })
          const data = await response.json()
          if (!data?.ok) throw new Error(data?.error || '保存失败')
          setSettings(data.settings)
          setSettingsMessage(data.reloaded ? '已保存并重载记忆插件' : '已保存；重启 DSH 后完整生效')
        } catch (error) {
          setSettingsMessage(error instanceof Error ? error.message : String(error))
        }
      }

      const updateSetting = (key, value) => setSettings((current) => ({ ...(current || {}), [key]: value }))

      const preset = status.preset
      const presetName = status.loading ? '读取中…' : preset?.name || status.presetId || '未找到预设'
      const presetDetail = preset
        ? `${preset.lines} 行 · ${preset.format === 'foxy-persona' ? 'persona' : 'Character 投影'} · ${preset.path}`
        : status.error || '等待 host 返回预设状态。'

      const memory = formatMemory(status.memory, status.presetId)

      return h(
        'section',
        { className: 'foxy-page' },
        h('style', null, FOXY_CSS),
        h(
          'header',
          { className: 'foxy-header' },
          h(
            'div',
            null,
            h('div', { className: 'foxy-eyebrow' }, 'DSH · FOXY'),
            h('h1', null, 'Foxy'),
            h('p', null, '一个角色预设，一个扩展契约层。聊天在 DSH 原生会话里进行，记忆由子插件接入。'),
          ),
          h(
            'div',
            { className: 'foxy-actions' },
            h('span', { className: 'foxy-badge' }, status.loading ? 'loading' : status.ok ? 'live' : 'offline'),
            h('button', { className: 'foxy-refresh', onClick: () => setNonce((value) => value + 1), disabled: status.loading }, '刷新'),
          ),
        ),
        h(
          'div',
          { className: 'foxy-grid' },
          h(Card, {
            label: '预设',
            value: presetName,
            detail: presetDetail,
            tone: status.ok ? 'live' : 'idle',
          }),
          h(Card, {
            label: '记忆',
            value: memory.value,
            detail: memory.detail,
            tone: memory.tone,
          }),
          h(Card, {
            label: '运行方式',
            value: 'DSH agent preset',
            detail: '在会话顶部选择 Foxy，然后用 DSH 原生对话。',
            tone: 'live',
          }),
        ),
        h(
          'div',
          { className: 'foxy-panel' },
          h('h2', null, '记忆桥设置'),
          settings
            ? h(
                'div',
                { className: 'foxy-form' },
                h(Field, { label: '桥地址' }, h('input', { value: settings.bridgeUrl || '', onChange: (event) => updateSetting('bridgeUrl', event.target.value) })),
                h(Field, { label: 'Token（可空）' }, h('input', { type: 'password', value: settings.bridgeToken || '', onChange: (event) => updateSetting('bridgeToken', event.target.value) })),
                h(Field, { label: 'LivingMemory 预设 ID' }, h('input', { value: settings.bridgePresetId || '', onChange: (event) => updateSetting('bridgePresetId', event.target.value) })),
                h(Field, { label: '每批消息数' }, h('input', { type: 'number', min: 1, value: settings.batchSize || 8, onChange: (event) => updateSetting('batchSize', Number(event.target.value)) })),
                h(Field, { label: '定时冲刷（毫秒）' }, h('input', { type: 'number', min: 1000, value: settings.flushIntervalMs || 30000, onChange: (event) => updateSetting('flushIntervalMs', Number(event.target.value)) })),
                h(Field, { label: '提取模型' }, h('input', { value: settings.extractModel || '', onChange: (event) => updateSetting('extractModel', event.target.value) })),
                h('div', { className: 'foxy-form-actions' }, h('button', { className: 'foxy-refresh', onClick: saveSettings }, '保存'), h('span', { className: 'foxy-muted' }, settingsMessage)),
              )
            : h('p', { className: 'foxy-muted' }, '读取中…'),
        ),
        h(
          'div',
          { className: 'foxy-panel' },
          h('h2', null, '怎么用'),
          h(
            'ol',
            { className: 'foxy-steps' },
            h('li', null, '在 DSH 的会话预设选择器里选 Foxy。'),
            h('li', null, '直接在新会话里说话；聊天、工具、上下文都由 DSH 原生运行时处理。'),
            h('li', null, '切回标准 preset 就恢复普通 DSH；Foxy 不会常驻。'),
            h('li', null, '装 dsh-foxy-memory 后，Foxy 会话会自动写入本地记忆，下一轮注入长期记忆。'),
          ),
        ),
        status.error && h('div', { className: 'foxy-error' }, status.error),
        preset && preset.headings?.length
          ? h(
              'div',
              { className: 'foxy-panel' },
              h('h2', null, '人设结构'),
              h(
                'div',
                { className: 'foxy-contract' },
                preset.headings.slice(0, 12).map((heading) => h('code', { key: heading }, heading)),
              ),
              h('p', { className: 'foxy-muted' }, `更新于 ${new Date(preset.updatedAt).toLocaleString()} · ${preset.bytes} bytes · sha ${preset.sha256}`),
            )
          : null,
        status.available?.length
          ? h(
              'div',
              { className: 'foxy-panel' },
              h('h2', null, '可用预设文件'),
              h(
                'div',
                { className: 'foxy-contract' },
                status.available.map((item) => h('code', { key: item.id }, item.file)),
              ),
              h('p', { className: 'foxy-muted' }, `目录：${status.presetsDir}`),
            )
          : null,
        h(
          'div',
          { className: 'foxy-panel' },
          h('h2', null, '扩展契约'),
          h(
            'div',
            { className: 'foxy-contract' },
            h('code', null, 'ctx.foxy.registerMemoryProvider(name, factory)'),
            h('code', null, 'ctx.foxy.registerCapability(name, factory)'),
            h('code', null, 'ctx.foxy.registerTransport(name, factory)'),
            h('code', null, 'ctx.foxy.registerPreset(preset)'),
          ),
          h('p', { className: 'foxy-muted' }, '主插件只负责 persona 与注册表；记忆、平台、语音、表情等能力都由独立子插件实现。'),
        ),
      )
    }

    const FOXY_CSS = `
.foxy-page {
  --foxy-accent: var(--dsw-alias-brand-primary, #d97757);
  --foxy-bg: var(--dsw-alias-bg-layer-1, #fff);
  --foxy-soft: var(--dsw-alias-bg-layer-2, #f7f7f5);
  --foxy-text: var(--dsw-alias-label-primary, #1f1e1d);
  --foxy-muted: var(--dsw-alias-label-secondary, #6f6d68);
  --foxy-border: var(--dsw-alias-border-l3, #e7e4de);
  height: 100%;
  overflow: auto;
  padding: 30px 34px 40px;
  color: var(--foxy-text);
  background: var(--foxy-bg);
  font: 14px/1.6 var(--dsh-font-family-content, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif);
  box-sizing: border-box;
}
.foxy-page * { box-sizing: border-box; }
.foxy-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 26px; border-bottom: 1px solid var(--foxy-border); }
.foxy-eyebrow { color: var(--foxy-accent); font-size: 11px; letter-spacing: .16em; font-weight: 700; }
.foxy-header h1 { margin: 5px 0 8px; font-size: 32px; line-height: 1.15; letter-spacing: -.03em; }
.foxy-header p { margin: 0; color: var(--foxy-muted); max-width: 660px; }
.foxy-badge { flex: none; padding: 5px 9px; border: 1px solid var(--foxy-border); border-radius: 999px; color: var(--foxy-muted); font-size: 11px; background: var(--foxy-soft); }
.foxy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 22px 0; }
.foxy-card { padding: 16px 17px; border: 1px solid var(--foxy-border); border-radius: 12px; background: var(--foxy-soft); min-width: 0; }
.foxy-card-label { color: var(--foxy-muted); font-size: 12px; }
.foxy-card-value { margin: 7px 0 5px; font-size: 18px; font-weight: 650; }
.foxy-card-detail { color: var(--foxy-muted); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
.foxy-card-live { border-color: color-mix(in srgb, var(--foxy-accent) 42%, var(--foxy-border)); background: color-mix(in srgb, var(--foxy-accent) 7%, var(--foxy-soft)); }
.foxy-panel { padding: 20px 0; border-top: 1px solid var(--foxy-border); }
.foxy-panel h2 { margin: 0 0 12px; font-size: 17px; }
.foxy-contract { display: flex; flex-wrap: wrap; gap: 8px; }
.foxy-contract code { padding: 6px 9px; border: 1px solid var(--foxy-border); border-radius: 7px; background: var(--foxy-soft); font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
.foxy-muted { color: var(--foxy-muted); font-size: 12px; margin: 12px 0 0; overflow-wrap: anywhere; }
.foxy-steps { margin: 0; padding-left: 22px; color: var(--foxy-muted); }
.foxy-steps li { margin: 6px 0; }
.foxy-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.foxy-field { display: flex; flex-direction: column; gap: 4px; color: var(--foxy-muted); font-size: 12px; }
.foxy-field input { padding: 7px 9px; border: 1px solid var(--foxy-border); border-radius: 7px; background: var(--foxy-bg); color: var(--foxy-text); font: inherit; font-size: 12px; }
.foxy-form-actions { display: flex; align-items: center; gap: 10px; grid-column: 1 / -1; }
.foxy-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.foxy-refresh { padding: 5px 10px; border: 1px solid var(--foxy-border); border-radius: 999px; color: var(--foxy-text); background: var(--foxy-soft); font: inherit; font-size: 11px; cursor: pointer; }
.foxy-refresh:disabled { opacity: .55; cursor: wait; }
.foxy-error { margin: 0 0 18px; padding: 12px 14px; border: 1px solid color-mix(in srgb, #d9534f 42%, var(--foxy-border)); border-radius: 10px; color: #a33; background: color-mix(in srgb, #d9534f 8%, var(--foxy-bg)); font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 620px) { .foxy-page { padding: 20px 16px 28px; } .foxy-header h1 { font-size: 26px; } }
`

    const name = 'dsh-foxy'
    const inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID, inject: () => ({ workbench: true }) }, FoxyPage),
      )
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 12, label: () => 'Foxy' }, FoxyIcon),
      )
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    exports.PANEL_ID = PANEL_ID
    return module.exports
  },
})
