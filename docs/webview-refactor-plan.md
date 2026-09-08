# Webview 终端化重构方案

> 状态：**已定稿，待开工** ｜ 分支：`refactor-webview` ｜ 目标版本：2.5.0 ｜ 日期：2026-09-08

## 1. 目标

「摸鱼看盘」的终极形态：面板打开时，旁人看到的是一段**终端输出/文本日志**，而不是行情软件窗口。

- 分时走势、成交量等核心信息**保留**，但用字符方式呈现（ASCII 折线 + 文本数字），不再使用 SVG 图表；
- `enableColorful` 配置及彩色视图代码全部删除；
- 面板整体观感向终端看齐：等宽字体、行式布局、终端提示符前缀（`❯`）。

## 2. 历史背景（必读）

本仓库有过两轮相关尝试，本方案是第三轮，方向与两轮回退的原因并不冲突：

| commit | 内容 | 结局 |
| ------ | ---- | ---- |
| `ee3046a` | 低调化一期：标题伪装、黑白观感、chip 流、22px sparkline（SVG 弱化图） | 因发布节奏整体回退 |
| `1b03147` | 回退上面，仅保留老板键关面板 | — |

一期做的是「弱化 SVG 图」，本轮做的是「**抛弃 SVG 图，改用文本渲染**」——是升级而非重复，但一期中可复用的思路（标题伪装、简称复用、chip 流思想）仍纳入本方案。

## 3. 现状 → 目标映射

| 现状（SVG/卡片） | 终端化后 |
| ---------------- | -------- |
| `stockChart.html`：240px SVG 分时图（面积渐变、网格、坐标轴）+ 80px 成交量柱 + 十字线 tooltip | **ASCII 走势图 + 文本成交量直方图**（见 §4.2），`stockChart.html` 整文件删除，重写为文本渲染模块 |
| `stockDetail.html`：26px 大价格头部 + 4 列指标网格 | 终端风格 header 行 + 中文 kv 对齐文本块（§4.3） |
| `stockOverview.html`：卡片网格（18px 价格） | 等宽对齐的文本表格，像 `ps`/`top` 的输出（§4.4） |
| 彩色/黑白双模式（enableColorful + `body.mono` + `--c-up/--c-dn`） | 全部删除，恒为编辑器前景色；涨跌靠 `+`/`-` 与数值表达（§4.1） |
| tab 栏（股票全称） | 保留 tab 结构但内容终端化；`enableMiniName` 开启时显示简称（§4.5/§4.6） |

## 4. 方案设计

### 4.1 删除 enableColorful

触点清单：

| 文件 | 改动 |
| ---- | ---- |
| `package.json` | 删 `watch-stock.enableColorful` 配置块 |
| `src/config.ts` | 删 `ConfigShape.enableColorful`、`DEFAULTS`、`getEnableColorful` 三处 |
| `src/ui/stockHome.ts` | `buildHtml()` 删 `enableColorful` 读取与 `{{COLORFUL}}`/`{{BODY_CLASS}}` 替换 |
| `src/webview/stockHome.html` | 删 `IS_COLORFUL`（本就是死代码）、`body.mono` 规则、`--c-up/--c-dn/--op-vol-*/--op-area*` 彩色相关变量（终端化后仅存的 UI 元素用 `--c-axis` 灰色系即可） |
| README / CHANGELOG | 配置表行删除；2.5.0 记破坏性变更（存量 settings 残留键会提示「未知配置项」，属可接受惯例） |

### 4.2 ASCII 分时图 + 文本成交量（核心）

**渲染原理**：分时数据 `MinutePoint[]`（约 240 个点/天）按面板宽度分桶降采样为 N 列（每列取收盘时刻价格与该列增量成交量），逐行输出 `<pre>` 文本。

走势区示意（高度 8 行）：

```text
 33.52 ┤                              ╭─╮
 33.41 ┤                    ╭─────────╯ ╰──╮
 33.30 ┤   ╭───╮   ╭────────╯              ╰╮
 33.19 ┼───╯   ╰───╯                        ╰── 昨收 33.20
 33.08 ┤
       └──10:00────11:00────13:30────14:30──┘
 成交  ▁▁▂▁▃▂▁▁▄▃▂▁▁▁▂▅▂▁▁▂▁▁  计 8.42万手
```

设计要点：

- **字符集**：盒绘制线字符 `╭ ╮ ╰ ╯ ─ │ ╱ ╲`，`<pre>` 内渲染无兼容问题；成交量块字符 `▁▂▃▄▅▆▇█`；
- **昨收线**：用一行 `──────` 横贯 + 右侧标注昨收价，取代虚线网格；
- **坐标**：左轴价格仅标最高/中间/最低 3 档，轴标签即普通文本；时间轴 4 个刻度内嵌于底行，全部 `tabular-nums` 等宽对齐；
- **颜色**：走势线整体用编辑器前景色（灰度），**不给涨跌着色**——着色本身就是看盘特征；最高/最低价点可用 `▲`/`▼` 字符标注代替颜色；
- **tooltip 移除**：悬停查价是行情软件交互惯性，文本模式直接以「当前时刻 + 汇总行」代替（走势区下方一行：`14:56 33.42 +0.66% 成交 8.42万 额 2.81亿`）；
- **容器与字体**：`font-family: var(--vscode-editor-font-family)` 继承编辑器等宽字体，`<pre>` 行高压缩至约 1.15，字号可等于或略小于编辑器字号；
- **重绘**：保留 `ResizeObserver`，宽度变化时按新列数降采样重绘（替代现 SVG 的 width/height 重设）；
- **数据链路不变**：`getStockMinute` → 10s TTL 缓存 → `minuteData` 消息 → 文本渲染函数。`volume` 字段继续消费（降桶后聚合），`amount` 用于汇总行。

代码位置：`stockChart.html`（SVG 引擎 342 行）删除，新增 `src/webview/stockTerminalChart.html` 片段（预计 ≤150 行：分桶、画线、直方图、模板字符串拼装），仍走 `FRAGMENT_SCRIPTS` 注入机制。

### 4.3 个股详情终端化

头部从「大字号价格海报」改为终端提示符风格的一行摘要 + kv 文本块：

```text
❯ sh600519 贵州茅台 33.42 +0.66% ( +0.22 ) 14:56:03    [刷新]

  今开 33.20   最高 33.52   最低 33.08   昨收 33.20
  成交 8.42万  额   2.81亿  换手 1.23%   量比 1.05
  市盈 28.4  市净 8.12    总市值 4.2万亿 流值 4.2万亿
```

- `26px .s-price` 取消，头部字号 13px 与正文一致；
- 指标从 CSS grid 改为 `<pre>` 内手工对齐（列间距固定字符数），视觉上即终端输出；
- 字段措辞：**保持中文**，用两字缩写（今开/最高/最低/昨收/成交/换手/量比/市盈/市净）便于定宽对齐；注意中文字符占 2 列，列对齐须按显示宽度计算（见 §6-4）；
- 刷新按钮弱化为 `[刷新]` 文本样式按钮。

### 4.4 A股全览终端化

卡片网格改为 `top` 命令式文本表：

```text
❯ overview — 大盘指数
  上证指数   3051.22  +0.42%   深证成指  9841.10  -0.13%
  创业板指   1912.05  +0.66%   科创50    774.33   +1.02%
❯ 行业板块（涨幅排序）
  软件服务 +2.31%  半导体 +1.87%  汽车整车 +1.44%  银行 +1.02% ...
```

- 指数：定宽列对齐，涨跌用 `+`/`-`（不着色）；
- 行业：chip 流文本（`名称 +x.x%` 空格分隔自动换行），48 行业约 6-8 行；
- 点击行业 chip 的行为维持现状（保留 `data-code` 点击切 tab 的既有交互，仅换外观）。

### 4.5 结构层低调化

- **面板标题**固定 `watch-stock`（编辑器 tab 页不再显示「查看股票」）；固定 tab 文案 `A股全览` → `overview`；
- **股票名简称**：tab 与详情页头部跟随简称配置显示（配置改名见 §4.6）；
- **容器** `max-width: 1000px` → `720px`（终端文本按 80/120 列设计，宽屏留白更像终端窗口）。

### 4.6 showMiniName → enableMiniName 改名（简称不再只服务于状态栏）

现状：`watch-stock.showMiniName`（description「状态栏是否显示简称」）+ `watch-stock.stockMiniNames`（映射表），仅 `statusBar.ts` 消费。本轮 webview 的 tab/详情头部也将使用简称，配置语义扩大，需要改名。新名沿用插件既有 `enable*` 前缀惯例（`enableLockTip`/`enableLargeTip`）。

**改名方案（新 key + 旧 key 回退，不丢用户配置）**：

| 项 | 处理 |
| -- | ---- |
| 新 key | `watch-stock.showMiniName` → **`watch-stock.enableMiniName`**，description 改为「是否显示股票简称（状态栏与查看面板）」 |
| `stockMiniNames` | 映射表本体 key 不变（语义本就通用，仅描述微调「为每只股票配置简称」） |
| `src/config.ts` | `ConfigShape.showMiniName` → `enableMiniName`；访问器 `getShowMiniName()` → `getEnableMiniName()`，读取顺序：新 key 有值 → 用新 key；否则回退读旧 key（`raw().has("showMiniName")` 判定显式设置），保证存量用户无感迁移 |
| `package.json` | 只注册新 key；旧 key 不声明（VS Code 会提示「未知配置项」，README/CHANGELOG 注明迁移说明） |
| `src/ui/statusBar.ts` | 改调 `config.getEnableMiniName()`，简称回退逻辑（`stockMiniNames[code] \|\| 截取前两位`）不变 |
| `src/ui/stockHome.ts` | `init` 消息按简称生效结果给 stocks 数组下发 `displayName` 字段，webview 端零配置读取；tab 与详情头部统一用 `displayName` |

### 4.7 不改动

状态栏、refresher、managers、stockService（含分时接口）、命令注册、消息协议骨架、CSP/nonce/占位符注入机制、老板键关面板。

## 5. 文件级改动清单

| 文件 | 类型 | 说明 |
| ---- | ---- | ---- |
| `package.json` | 修改 | 删 enableColorful；showMiniName → enableMiniName（§4.6） |
| `src/config.ts` | 修改 | 删 enableColorful ×3 处；`enableMiniName` 新 key 优先 + `showMiniName` 旧 key 回退 |
| `src/ui/statusBar.ts` | 修改 | 改调 `getEnableMiniName()`，简称处理逻辑不变 |
| `src/ui/stockHome.ts` | 修改 | buildHtml 删占位符；注入新片段；面板标题固定 `watch-stock`；init 消息下发 `displayName` |
| `src/webview/stockHome.html` | 修改 | 删彩色变量/mono/IS_COLORFUL；终端化 tab 栏样式；容器宽度 720px；`A股全览` → `overview` |
| `src/webview/stockChart.html` | **删除** | SVG 引擎整体废弃 |
| `src/webview/stockTerminalChart.html` | **新增** | ASCII 分时 + 文本成交量渲染片段 |
| `src/webview/stockDetail.html` | 重写 | 终端 header + kv 文本块 |
| `src/webview/stockOverview.html` | 重写 | top 式文本表 |
| `AGENTS.md` | 修改 | 目录结构、Webview 设计决策条目（新增「终端化渲染」决策与 ASCII 分桶说明） |
| `README.md` | 修改 | 功能描述改写（「以终端文本形式查看分时走势…」）、配置表 |
| `CHANGELOG.md` | 修改 | 2.5.0：破坏性变更 + 新功能 |

## 6. 风险与对策

1. **ASCII 图在窄面板下的可读性**：列数 = f(容器宽/字符宽)，设下限（如 60 列），低于则横向滚动容器（`overflow-x: auto`），不强行挤压变形；
2. **降采样信息损失**：每桶记录（开盘价、收盘价、桶内最高/最低、增量成交量），折线取桶收盘价、`▲▼` 标全日极值桶——分桶逻辑与 K 线聚合同理，240 点 → 约 100 列无损观感；
3. **字体非等宽回退**：`--vscode-editor-font-family` 个别主题下可能是比例字体，兜底链 `var(--vscode-editor-font-family), monospace`；
4. **esbuild 压缩**：模板字符串中的多空格对齐可能被 `>\s+<` 与 `\s+` 规则压缩——所有文本块放 `<pre>`，且对齐用 CSS 无法补救时改为 JS 内 `padEnd` 运行时生成（实现时验证）；**中文字符占 2 显示列**，所有 kv 对齐须按「显示宽度 = 中文计 2 / ASCII 计 1」计算而非 `String.length`，封装一个 `padW()` 工具函数统一处理；
5. **存量设置键**：`enableColorful` 删除后残留键提示「未知配置项」，CHANGELOG 注明手动删除即可；`showMiniName` 旧键因 §4.6 回退读取仍生效，用户迁移到 `enableMiniName` 后删除旧键即消除提示。

## 7. 决策记录（已关闭）

| # | 问题 | 结论 |
| - | ---- | ---- |
| D1 | 走势线字符集 | **a) 盒绘制线** `╭─╮╰╯│╱╲`，观感平滑 |
| D2 | 成交量呈现 | **a) 走势下方独立一行块字符直方图** `▁▂▃▄▅` + `计 x万手` 汇总 |
| D3 | 指标字段措辞 | **a) 保持中文**，用两字缩写 + 按显示宽度对齐（放弃英文缩写方案，可读性优先） |
| D4 | 简称显示 | **跟随配置开关**（面板 tab / 详情头部在开关开启时显示简称），配置项改名 `showMiniName` → `enableMiniName`，方案见 §4.6 |
| D4b | 面板标题伪装 | **纳入**：面板标题固定 `watch-stock`、固定 tab 文案 `A股全览` → `overview` |
| D5 | 悬停查任意分钟价格 | **放弃**，十字线与 tooltip 全删，靠曲线形态 + 汇总行 + `▲▼` 极值标注 |
| D6 | 全览行业 chip 点击切 tab | **保留**（外观终端化，交互不损失） |
| D7 | 一轮做完 vs 分轮 | **一轮做完**（按 §8 拆 4 个提交） |

## 8. 实施顺序

1. **提交 1**：`enableColorful` 全链路删除 + `showMiniName` → `enableMiniName` 改名与回退（§4.1/§4.6，配置层先行）；
2. **提交 2**：`stockTerminalChart.html` 新增 + 详情页终端化（§4.2/§4.3，最大件；含 `padW()` 显示宽度工具、分桶降采样）；
3. **提交 3**：全览页终端化 + 结构层（§4.4/§4.5：面板标题、tab 文案、容器 720px、`displayName` 下发）；
4. **提交 4**：文档同步（AGENTS.md 架构条目 / README 功能与配置表 / CHANGELOG 2.5.0）；
5. 验收：`npm run typecheck` + F5 开发宿主走查清单——窄/宽面板重绘、切 tab 缓存命中、手动刷新、集合竞价无数据兜底文案（需终端化措辞，不出现「正在获取分时数据...」）、`enableMiniName` 开关联动、旧 `showMiniName` 回退生效、老板键关面板。
