# dsh-foxy

Foxy 是 DeepSeek Harness 的一个 **agent preset**：它把 `foxy3` 的人设投影成该会话的系统提示词，并把记忆、平台、能力留给独立子插件。

它**不是**另一个聊天应用，也没有自己的聊天面板/API。聊天使用 DSH 原生会话；左侧栏的 Foxy 面板只显示当前预设、记忆状态和扩展契约。

```
DSH 会话（选择 Foxy preset）
        │
   dsh-foxy（host registry + agent preset）
        │
   dsh-foxy-memory（可选，本地记忆）
        │
   koishi-plugin-foxy-memory-bridge（可选，LivingMemory 桥）
```

## 安装

在 DSH 的 profile 里安装两个包（记忆子插件可选，但推荐）：

```powershell
dsh plugin --profile desktop add "file:D:\path\to\dsh-foxy"
dsh plugin --profile desktop add "file:D:\path\to\dsh-foxy-memory"
```

安装后完全重启 DSH。新的 `Foxy` preset 会出现在会话预设选择器里。

开发时如果 profile 里是复制安装而不是链接，修改源码后需要重新 `dsh plugin add`，或把 `lib/` 复制到：

```text
C:\Users\<you>\.dsh\profiles\desktop\node_modules\dsh-foxy
```

## 使用

1. 新建一个 DSH 会话。
2. 在预设选择器里选 **Foxy**。
3. 直接说话即可；上下文、工具、模型选择都由 DSH 原生运行时处理。
4. 切回 `standard` 或其他 preset，就恢复普通 DSH。Foxy 不会常驻。

`enableTools: false`（默认）时，Foxy 会话会隐藏继承的工具；需要工具时在 preset 配置里改成 `true`。

## 预设

默认读取：

```text
%USERPROFILE%\.dsh\foxy\presets\foxy3.yml
```

也可以用 `presetPath` 指向任意 Foxy/Character 预设文件，例如 ChatLuna 的：

```text
...\data\chathub\character\presets\foxy3.yml
```

读取规则：

- 有 `persona:` 块：直接使用；
- 只有 Character 的 `system:` 块：自动投影，只保留角色设定标题（基本设定、详细设定、真实身世、语言风格、发言风格、情境应对、群友共同特点、边界），丢弃好感度、affinity、toolbox、`character_reply`、status/think、群友 ID 目录、名词解释等运行时内容；
- 不需要维护两份文件：DSH 和 ChatLuna 可以读同一个 `foxy3.yml`。

投影用 `complete: true` 和 `interpolate: false` 注册，所以：

- 它是该 agent 唯一的系统提示词段，不会被 DSH 的 coding-agent 人设污染；
- 预设里的 `{{...}}` 原样保留，不会被 DSH 模板插值。

## 记忆

`dsh-foxy-memory` 是一个独立子插件，默认把 Foxy 会话写成 JSONL：

```text
%USERPROFILE%\.dsh\foxy\memory\entries.jsonl
```

每条记录带 `presetId`、`sessionId`、`platform=dsh`、`sourceLabel=DSH`、说话人和时间，例如：

```text
- [2026-11-06 20:00] [DSH] kunfox: 今天在 DSH 做了……
- [2026-11-06 20:00] [DSH] Foxy: 记住啦。
```

下一轮 Foxy 会话会把最近 N 条注入 `[长期记忆]`。默认值是 20 条，可用 `memoryContextEntries` 调整。

记忆不是逐条写：`dsh-foxy-memory` 会按 `batchSize`（默认 8）和 `flushIntervalMs`（默认 30 秒）调用桥的 `/ingest`，由模型提炼成中文、Foxy 第一人称的长期记忆。Foxy 左侧面板的「记忆桥设置」可以改桥地址、token、预设、批次、提取模型，保存到 `$DSH_HOME/foxy/settings.json`，不必改 profile 文件。

它不依赖 ChatLuna。如果要接 `chatluna-livingmemory`，安装 `koishi-plugin-foxy-memory-bridge`，在设置页填 `bridgeUrl`、`bridgeToken`、`bridgePresetId`。桥通过 `ctx.chatluna_living_memory.createMemory(...)` 写入 `foxy3（Character）` 池；**不要直接写 SQLite**，否则会绕过 speaker key、profile 和 PGlite 向量索引。

## 配置

Host（`dsh-foxy`）只有 `presetId`，默认 `foxy3`。

Agent preset 子插件（`dsh-foxy/preset`）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `presetId` | `foxy3` | 读取哪个预设文件 |
| `presetPath` | 空 | 直接指定预设路径；优先于 `presetId` |
| `enableTools` | `false` | 是否让 Foxy 会话继承 DSH 工具 |
| `includeRuntimeContext` | `false` | 是否附加 DSH 运行时上下文 |
| `memoryContextEntries` | `20` | 注入多少条长期记忆 |
| `keepHeadings` | 内置 | Character `system` 投影时保留的标题 |
| `dropHeadings` | 内置 | 投影时丢弃的标题 |

## 扩展契约

Host 通过 `ctx.foxy` 暴露：

```js
ctx.foxy.registerPreset(preset)
ctx.foxy.registerMemoryProvider(name, factory)
ctx.foxy.registerCapability(name, factory)
ctx.foxy.registerTransport(name, factory)
ctx.foxy.status()
```

子插件可以按需接入：

- 记忆：`dsh-foxy-memory`、未来的 livingmemory 桥；
- 平台：微博、OOPZ、B站、QQ；
- 能力：TTS/STT、VISION、VTube Studio。

主插件只负责人设和注册表，不拥有对话循环。

## 限制

- LivingMemory 桥是独立 Koishi 插件；未安装/未配置时退回本地 JSONL。
- Foxy 会话默认无工具，这是刻意的安全默认值。
- 会话中途切换 preset 取决于 DSH 版本；最稳妥是新建 Foxy 会话。
- 侧栏面板是状态页，不是聊天页；聊天请用 DSH 原生对话。

## 开发

```powershell
node --check lib/index.js
node --check lib/client.js
node --check lib/preset.js
node ..\research\test-foxy-preset.mjs
node ..\research\test-foxy-memory.mjs
node ..\research\test-foxy.mjs
node ..\research\test-foxy-status.mjs
```

## License

MIT
