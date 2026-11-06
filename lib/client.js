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

    function formatMemory(memory, presetId) {
      if (!memory) {
        return { value: '未启用', detail: '安装 dsh-foxy-memory 子插件后显示统计', tone: 'idle' }
      }
      const baseId = String(presetId || '').replace(/（Character）$/i, '')
      const bucket = memory.byPreset?.[presetId] || memory.byPreset?.[baseId] || null
      const total = bucket ? bucket.active + bucket.archived : memory.total || 0
      const pending = Number(memory.pending) || 0
      const isBridge = memory.provider === 'livingmemory'
      const provider = isBridge ? 'LivingMemory' : '本地 JSONL'
      return {
        value: isBridge && !total ? '已连接' : `${total} 条`,
        detail: pending ? `${provider} · 待提炼 ${pending} 条` : `${provider} · ${total ? '已同步' : '等待首轮对话'}`,
        tone: total || isBridge ? 'live' : 'idle',
      }
    }

    function Row({ label, hint, children }) {
      return h(
        'div',
        { className: 'foxy-row' },
        h(
          'div',
          { className: 'foxy-row-label' },
          h('span', null, label),
          hint ? h('small', null, hint) : null,
        ),
        h('div', { className: 'foxy-row-control' }, children),
      )
    }

    function Check({ checked, onChange, children }) {
      return h(
        'label',
        { className: 'foxy-check' },
        h('input', { type: 'checkbox', checked: Boolean(checked), onChange: (event) => onChange(event.target.checked) }),
        h('span', null, children),
      )
    }

    function FoxyPage() {
      const [status, setStatus] = React.useState({ loading: true })
      const [nonce, setNonce] = React.useState(0)
      const [settings, setSettings] = React.useState(null)
      const [message, setMessage] = React.useState('')

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
        const timer = setInterval(load, 15000)
        return () => {
          alive = false
          controller.abort()
          clearInterval(timer)
        }
      }, [nonce])

      React.useEffect(() => {
        fetch('/api/dsh-foxy/settings', { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => response.json())
          .then((data) => {
            if (!data?.ok) return
            setSettings(data.settings)
          })
          .catch(() => setMessage('设置读取失败'))
      }, [])

      const update = (key, value) => setSettings((current) => ({ ...(current || {}), [key]: value }))

      const save = async () => {
        if (!settings) return
        setMessage('保存中…')
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
          setMessage(data.reloaded ? '已保存，记忆插件已重载' : '已保存；新会话或重启 DSH 后生效')
          setNonce((value) => value + 1)
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      }

      const preset = status.preset
      const presetName = status.loading ? '读取中…' : preset?.name || status.presetId || '未找到预设'
      const memory = formatMemory(status.memory, status.presetId)
      const available = Array.isArray(status.available) ? status.available : []
      const currentPreset = settings?.presetId || status.presetId || 'foxy3'
      const options = available.length ? available : [{ id: currentPreset, file: `${currentPreset}.yml` }]

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
            h('h1', null, 'Foxy'),
            h('p', null, '角色预设与记忆设置。聊天在 DSH 原生会话里进行。'),
          ),
          h(
            'div',
            { className: 'foxy-actions' },
            h('span', { className: `foxy-state ${status.ok ? 'is-live' : ''}` }, status.loading ? '读取中' : status.ok ? '正常' : '异常'),
            h('button', { className: 'foxy-button', onClick: () => setNonce((value) => value + 1), disabled: status.loading }, '刷新'),
          ),
        ),
        status.error ? h('div', { className: 'foxy-error' }, status.error) : null,
        h(
          'div',
          { className: 'foxy-summary' },
          h('div', null, h('span', null, '当前预设'), h('strong', null, presetName), h('small', null, preset?.path || status.presetsDir || '')),
          h('div', null, h('span', null, '记忆'), h('strong', null, memory.value), h('small', null, memory.detail)),
          h('div', null, h('span', null, '运行方式'), h('strong', null, 'DSH 原生会话'), h('small', null, '在会话顶部选择 Foxy')),
        ),
        h(
          'section',
          { className: 'foxy-section' },
          h('h2', null, '角色预设'),
          h('p', { className: 'foxy-help' }, '选择 Foxy 读取的人设文件。修改后对新会话生效；已经开始的会话不会被改写。'),
          settings
            ? h(
                'div',
                { className: 'foxy-rows' },
                h(
                  Row,
                  { label: '预设文件', hint: '来自 Foxy 预设目录' },
                  h(
                    'select',
                    { value: currentPreset, onChange: (event) => update('presetId', event.target.value) },
                    options.map((item) => h('option', { key: item.id, value: item.id }, item.file)),
                  ),
                ),
                h(
                  Row,
                  { label: '预设路径', hint: '留空则使用预设目录中的同名文件' },
                  h('input', {
                    value: settings.presetPath || '',
                    placeholder: '例如 C:\\Users\\me\\.dsh\\foxy\\presets\\foxy3.yml',
                    onChange: (event) => update('presetPath', event.target.value),
                  }),
                ),
                h(
                  Row,
                  { label: '注入记忆' },
                  h('div', { className: 'foxy-inline' }, h('input', {
                    type: 'number',
                    min: 1,
                    max: 100,
                    value: settings.memoryContextEntries || 20,
                    onChange: (event) => update('memoryContextEntries', Number(event.target.value)),
                  }), h('span', null, '条')),
                ),
                h(
                  Row,
                  { label: '工具权限' },
                  h(Check, { checked: settings.enableTools, onChange: (value) => update('enableTools', value) }, '允许 Foxy 使用 DSH 工具'),
                ),
                h(
                  Row,
                  { label: '运行时上下文' },
                  h(Check, { checked: settings.includeRuntimeContext, onChange: (value) => update('includeRuntimeContext', value) }, '把时间、工作区等上下文交给模型'),
                ),
              )
            : h('p', { className: 'foxy-help' }, '读取设置中…'),
        ),
        h(
          'section',
          { className: 'foxy-section' },
          h('h2', null, '记忆保存'),
          h('p', { className: 'foxy-help' }, '默认写入 LivingMemory。每积累一批对话后由模型提炼，不再逐句保存。'),
          settings
            ? h(
                'div',
                { className: 'foxy-rows' },
                h(
                  Row,
                  { label: '保存方式' },
                  h(
                    'select',
                    { value: settings.provider || 'livingmemory', onChange: (event) => update('provider', event.target.value) },
                    h('option', { value: 'livingmemory' }, 'LivingMemory（通过 Koishi 桥）'),
                    h('option', { value: 'local' }, '本地 JSONL'),
                  ),
                ),
                h(
                  Row,
                  { label: '桥地址', hint: 'Koishi 侧 foxy-memory-bridge 的地址' },
                  h('input', {
                    value: settings.bridgeUrl || '',
                    placeholder: 'http://127.0.0.1:5140/foxy-memory',
                    onChange: (event) => update('bridgeUrl', event.target.value),
                  }),
                ),
                h(
                  Row,
                  { label: 'Token', hint: '桥只监听本机时可留空' },
                  h('input', {
                    type: 'password',
                    value: settings.bridgeToken || '',
                    onChange: (event) => update('bridgeToken', event.target.value),
                  }),
                ),
                h(
                  Row,
                  { label: 'LivingMemory 预设', hint: 'Character 记忆池带（Character）后缀' },
                  h('input', {
                    value: settings.bridgePresetId || '',
                    onChange: (event) => update('bridgePresetId', event.target.value),
                  }),
                ),
                h(
                  Row,
                  { label: '批量大小', hint: '累计多少条消息后提炼' },
                  h('input', {
                    type: 'number',
                    min: 1,
                    max: 50,
                    value: settings.batchSize || 8,
                    onChange: (event) => update('batchSize', Number(event.target.value)),
                  }),
                ),
                h(
                  Row,
                  { label: '定时冲刷', hint: '毫秒；到时间即使不满一批也提炼' },
                  h('input', {
                    type: 'number',
                    min: 5000,
                    step: 1000,
                    value: settings.flushIntervalMs || 30000,
                    onChange: (event) => update('flushIntervalMs', Number(event.target.value)),
                  }),
                ),
                h(
                  Row,
                  { label: '提取模型', hint: '用于把对话整理成记忆' },
                  h('input', {
                    value: settings.extractModel || '',
                    placeholder: 'deepseek/deepseek-flash',
                    onChange: (event) => update('extractModel', event.target.value),
                  }),
                ),
              )
            : h('p', { className: 'foxy-help' }, '读取设置中…'),
        ),
        h(
          'div',
          { className: 'foxy-save' },
          h('button', { className: 'foxy-button is-primary', onClick: save, disabled: !settings }, '保存设置'),
          h('span', null, message || '保存后写入 ~/.dsh/foxy/settings.json'),
        ),
        h(
          'p',
          { className: 'foxy-footnote' },
          'Foxy 只负责人设与设置；聊天、工具和上下文由 DSH 原生会话提供。记忆插件可用 ctx.foxy 注册自己的 provider。',
        ),
      )
    }

    const FOXY_CSS = `
.foxy-page {
  --foxy-bg: var(--dsw-alias-bg-layer-1, #fff);
  --foxy-soft: var(--dsw-alias-bg-layer-2, #f6f6f4);
  --foxy-text: var(--dsw-alias-label-primary, #1f1e1d);
  --foxy-muted: var(--dsw-alias-label-secondary, #6f6d68);
  --foxy-border: var(--dsw-alias-border-l3, #e6e3dc);
  --foxy-accent: var(--dsw-alias-brand-primary, #d97757);
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 28px 32px 48px;
  color: var(--foxy-text);
  background: var(--foxy-bg);
  font: 14px/1.55 var(--dsh-font-family-content, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif);
}
.foxy-page * { box-sizing: border-box; }
.foxy-page > * { max-width: 860px; margin-left: auto; margin-right: auto; }
.foxy-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--foxy-border); }
.foxy-header h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.2; letter-spacing: -.02em; }
.foxy-header p { margin: 0; color: var(--foxy-muted); font-size: 13px; }
.foxy-actions { display: flex; align-items: center; gap: 10px; }
.foxy-state { color: var(--foxy-muted); font-size: 12px; }
.foxy-state::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #b8b4aa; vertical-align: 1px; }
.foxy-state.is-live::before { background: #3f9b68; }
.foxy-button { padding: 6px 12px; border: 1px solid var(--foxy-border); border-radius: 7px; background: var(--foxy-bg); color: var(--foxy-text); font: inherit; font-size: 12px; cursor: pointer; }
.foxy-button:hover { background: var(--foxy-soft); }
.foxy-button:disabled { opacity: .55; cursor: default; }
.foxy-button.is-primary { border-color: var(--foxy-text); background: var(--foxy-text); color: var(--foxy-bg); }
.foxy-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin-top: 18px; border: 1px solid var(--foxy-border); border-radius: 8px; overflow: hidden; }
.foxy-summary > div { min-width: 0; padding: 12px 14px; border-right: 1px solid var(--foxy-border); }
.foxy-summary > div:last-child { border-right: 0; }
.foxy-summary span { display: block; color: var(--foxy-muted); font-size: 11px; }
.foxy-summary strong { display: block; margin: 3px 0 2px; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.foxy-summary small { display: block; color: var(--foxy-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.foxy-section { padding: 24px 0 8px; border-bottom: 1px solid var(--foxy-border); }
.foxy-section h2 { margin: 0 0 4px; font-size: 15px; }
.foxy-help { margin: 0 0 14px; color: var(--foxy-muted); font-size: 12px; }
.foxy-rows { display: flex; flex-direction: column; }
.foxy-row { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; align-items: start; padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--foxy-border) 65%, transparent); }
.foxy-row:first-child { border-top: 0; }
.foxy-row-label { padding-top: 5px; }
.foxy-row-label span { display: block; font-size: 12px; }
.foxy-row-label small { display: block; margin-top: 2px; color: var(--foxy-muted); font-size: 11px; }
.foxy-row-control { min-width: 0; }
.foxy-row-control input:not([type="checkbox"]), .foxy-row-control select { width: 100%; padding: 7px 9px; border: 1px solid var(--foxy-border); border-radius: 7px; background: var(--foxy-bg); color: var(--foxy-text); font: inherit; font-size: 12px; }
.foxy-row-control input:focus, .foxy-row-control select:focus { outline: 2px solid color-mix(in srgb, var(--foxy-accent) 30%, transparent); outline-offset: 1px; border-color: var(--foxy-accent); }
.foxy-inline { display: flex; align-items: center; gap: 8px; }
.foxy-inline input { width: 96px !important; }
.foxy-inline span { color: var(--foxy-muted); font-size: 12px; }
.foxy-check { display: inline-flex; align-items: center; gap: 8px; padding-top: 5px; color: var(--foxy-text); font-size: 12px; cursor: pointer; }
.foxy-check input { width: 14px; height: 14px; accent-color: var(--foxy-accent); }
.foxy-save { display: flex; align-items: center; gap: 12px; padding: 20px 0 0; }
.foxy-save span { color: var(--foxy-muted); font-size: 12px; }
.foxy-footnote { margin: 18px 0 0; color: var(--foxy-muted); font-size: 11px; line-height: 1.7; }
.foxy-error { margin: 14px 0 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, #c74a45 40%, var(--foxy-border)); border-radius: 7px; color: #a33; background: color-mix(in srgb, #c74a45 6%, var(--foxy-bg)); font-size: 12px; }
@media (max-width: 700px) { .foxy-page { padding: 20px 16px 32px; } .foxy-summary { grid-template-columns: 1fr; } .foxy-summary > div { border-right: 0; border-bottom: 1px solid var(--foxy-border); } .foxy-summary > div:last-child { border-bottom: 0; } .foxy-row { grid-template-columns: 1fr; gap: 4px; } }
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

