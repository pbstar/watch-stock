# AGENTS.md

本文件为 AI 编程助手提供项目上下文，请在修改代码前先阅读。

## 项目简介

VS Code 扩展 "摸鱼看盘"（watch-stock）—— 在状态栏实时显示 A 股（沪/深/北）行情，支持价格闹钟、封单监控、大单异动检测。查看面板以终端文本风格呈现（ASCII 分时图 + 文本表格），旁人视角下如同日志输出。
技术栈：TypeScript + VS Code Extension API + esbuild，数据来源：新浪财经、腾讯财经公开行情接口。

## 常用命令

```bash
npm run typecheck   # TypeScript 类型检查（tsc --noEmit）
npm run build       # 类型检查 + esbuild 打包 + vsce 打包成 .vsix
```

调试：在 VS Code 中打开项目，按 F5 启动扩展开发宿主。

## 目录结构

```text
src/
├── extension.ts          # 插件入口（activate/deactivate）
├── commands.ts           # 命令注册与主菜单
├── config.ts             # 配置统一访问入口、指数/行业代码常量
├── refresher.ts          # 行情刷新与定时器调度
├── types.ts              # 全局类型定义（宿主与 webview 共用）
├── global.d.ts           # 全局类型声明（*.html / webview-bundle:* 虚拟模块）
├── managers/             # 业务管理器
│   ├── stockManager.ts   # 股票增删排序
│   ├── alarmManager.ts   # 价格闹钟
│   ├── lockManager.ts    # 涨跌停封单监控
│   └── largeManager.ts   # 大单监控
├── services/             # 数据服务
│   ├── stockService.ts   # 行情查询（新浪/腾讯双源）
│   └── stockSearch.ts    # 股票搜索
├── ui/                   # 宿主侧 UI
│   ├── statusBar.ts      # 状态栏渲染
│   └── stockHome.ts      # 查看股票面板：取数、10s 分时缓存、消息收发
├── utils/                # 通用工具
│   ├── http.ts           # HTTP 请求
│   ├── msg.ts            # 消息提示与限流
│   ├── stock.ts          # 股票代码/价格处理
│   └── time.ts           # 交易时间与日期工具
└── webview/              # 查看面板（独立编译的浏览器端工程）
    ├── stockHome.html    # 唯一 HTML 外壳：{{NONCE}} / {{STYLE}} / {{SCRIPT}}
    ├── style.css         # 全部样式，构建时压缩后内联
    ├── main.ts           # 浏览器入口：真实 DOM / postMessage / 宽度测量
    ├── app.ts            # 状态机与渲染编排（依赖注入，浏览器接线在 main.ts）
    ├── elements.ts       # DOM 契约：元素 id 单一来源
    ├── protocol.ts       # 宿主 ↔ webview 消息契约
    ├── chart.ts          # ASCII 分时图纯渲染核心
    ├── overview.ts       # 全览页文本表 / 行业流
    ├── detail.ts         # 个股详情头部与 kv 块
    └── format.ts         # 数字格式化 + 显示宽度对齐
```

## 核心架构

### 数据流（主循环）

```
refresher.ts（交易时间每 5 秒一次，refreshData 统一 try/catch 兜底）
  → 跨交易日时清空封单/大单监控缓存
  → stockService.ts（从新浪/腾讯拉取行情）
  → 每只股票计算封单 calculateLockInfo()（lockManager.ts）
  → 检查价格闹钟 checkAlarms()（alarmManager.ts）
  → 检查封单异动 / 大单异动（仅开启且稳定交易时段）
  → statusBar.ts 渲染（或隐藏）
```

### 关键设计决策

- **入口**：`extension.ts` 创建 `AppState`（状态栏、用户显隐状态、定时器）；停用时统一释放定时器、状态栏、股票面板与限流定时器。
- **双数据源**：新浪用于批量行情（有买一/卖一，用于封单计算），腾讯用于完整行情（PE、PB、市值）和分时数据。早盘集合竞价期间（9:15-9:25）新浪无价格 → `getStockList(codes, isSina=false)` 回退到腾讯简版行情。腾讯响应按变量名中的代码键名匹配解析，勿改回按下标对齐（接口返回行数与请求不一致时数据会错位）。
- **统一配置入口**：所有 VS Code 配置读取必须通过 `config.ts` 的 `config` 对象，禁止在业务代码中直接调用 `vscode.workspace.getConfiguration`。`config.getStocks()` 会自动校验股票代码格式、统一转为小写并回写。
- **状态栏显隐三态**：`AppState.userForced` 为三态 —— `null` = 跟随市场（根据 `autoHideByMarket` 配置自动显隐），`true` = 强制显示，`false` = 强制隐藏。手动切换后脱离自动模式，需重启编辑器恢复。切换为强制隐藏（老板键）时会同时关闭股票面板，一次按键清除所有看盘痕迹。
- **Webview 面板（宿主侧）**：`StockHomePanel` 是单例，构造时**只构建一次 HTML**（`{{NONCE}}`/`{{STYLE}}`/`{{SCRIPT}}` 占位符替换，替换必须用函数形式 `replace("{{X}}", () => value)`，否则产物里的 `$&`、`$'` 会被当成替换序列）；之后每次 `show()` 只重新取数并下发 `init`，不再复位 webview。`dispose()` 有幂等守卫（`onDidDispose` 会回调它自己），停用与老板键都走同一条路径。
- **Webview 渲染工程**：`src/webview/` 是独立编译的浏览器端 TypeScript 工程，由 `esbuild.config.mjs` 以 `iife/browser` 单独打包成字符串，经虚拟模块 `webview-bundle:js` / `webview-bundle:style` 内联进扩展包。**不要**再往 HTML 里注入脚本片段，也不要用自定义 HTML 压缩器（旧实现会把字符串字面量里的连续空白压坏，是历史 bug 来源）。
- **纯渲染核心**：`format.ts`/`chart.ts`/`overview.ts`/`detail.ts` 全是零 DOM 依赖的纯函数（输入数据 + 列宽 → 输出文本），DOM 与宿主能力经 `AppDeps` 注入给 `app.ts`，浏览器接线全部收敛在 `main.ts`。改渲染逻辑只动这几个纯模块，不要去 `main.ts` 里加业务分支。
- **DOM 契约**：webview 用到的元素 id 只在 `elements.ts` 定义，`stockHome.html` 必须提供全部 id；`AppElements` 由该表派生，`main.ts` 缺元素立即抛错。
- **消息契约**：宿主 ↔ webview 的消息类型集中在 `webview/protocol.ts`，两侧共用同一套类型（webview 侧只做 type-only 引用）。新增消息必须同时更新类型与两侧处理分支。
- **无 HTML 注入面**：面板文本一律经 `textContent` 写入，禁止用 `innerHTML` 拼内容；CSP 因此只需 `script-src 'nonce-…'`（样式层保留 `unsafe-inline`，因为 VS Code 会向 webview 注入默认样式）。
- **终端化渲染**：查看面板整体以纯文本呈现，旁人视角下如同日志输出。`chart.ts` 把分时渲染成四段文本（走势 / 时间轴 / 成交量直方图 / 汇总），分别落到四个 `<pre>`；走势用盒绘制线字符（`╭ ╮ ╰ ╯ ─ │`），成交量用块字符（`▁▂▃▄▅▆▇█`），极值用 `▲▼` 标注，涨跌一律靠 `+`/`-` 与数值表达，**不给涨跌着色**。分桶降采样：242 个槽位按列数分桶，每列取末点价格（收盘语义）与桶内增量成交量（接口给的是累计量）。曲线铺满 8 行，极值标注从极值列向两侧找空格；同行走平补线时**必须保留已落笔的拐角**（`╭╮╰╯`），否则弧线会断。
- **Webview 文本对齐**：终端化文本全部放在 `<pre>` 内，等宽字体走 `var(--vscode-editor-font-family), monospace`，面板 `body` 也统一用编辑器等宽字体与字号（否则 `❯` 标题行是比例字体、与下方表格列首对不齐）。**中文字符占 2 显示列**：对齐只能用 `format.ts` 的 `displayWidth()`/`padToWidth()`，禁止用 `String.length`；列宽取各列实际最大显示宽度，不写死。百分比统一 `fmtPercent()` 定点两位（不能直接把数字拼进字符串，否则会出现 `0.6666666%` 这类破坏对齐的输出）。
- **面板低调化**：面板标题固定 `watch-stock`（`PANEL_TITLE` 常量，HTML `<title>` 同步），固定 tab 文案为 `overview`，容器宽度上限 720px，按 80/120 列文本布局设计。
- **窄面板横向滚动**：`.content` / `.tab-bar` **不设 `min-width`**，否则整页先横向滚动、分时图的 60 列下限永远命中不到。窄面板下由 tab 栏、`.chart`（列数低于 `MIN_COLUMNS`=60 时）、指数表各自横向滚动，行业流走 `pre-wrap` 自动换行。
- **简称下发**：`enableMiniName` 开启时，`stockHome.ts` 在 `load()` 中一次性把简称算好写入 `StockOverview.displayName`，webview 端零配置直接消费（tab 与详情头部统一读 `displayName`），避免 webview 侧重复读配置。
- **命令注册**：命令统一在 `commands.ts` 注册，命令 ID 集中在 `COMMAND_MAP`，禁止在其他文件中注册命令。
- **消息限流**：`msg.ts` 的 `sendRateLimitMsg()` 将封单/大单异动通知在 60 秒冷却窗口内合并，避免频繁弹窗打扰用户；通知频率统一由它控制，封单/大单判定逻辑内不再单独做冷却。
- **监控缓存跨日清理**：封单/大单监控快照缓存由 refresher 检测日期变化后统一清空（两个 manager 不自带跨日逻辑），避免隔日首帧用昨日快照误报异动。
- **大单判定参数**：阈值集中在 `largeManager.ts` 顶部常量区（绝对门槛、增量门槛下限、价格推动幅度、超大单分级），调灵敏度只动常量，不改判定结构。
- **分时数据缓存**：`StockHomePanel` 中分时数据有 10 秒 TTL 缓存，避免切换股票标签时重复请求。
