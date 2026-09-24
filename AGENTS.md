# AGENTS.md

本文件为 AI 编程助手提供项目上下文，请在修改代码前先阅读。

## 项目简介

VS Code 扩展 "摸鱼看盘"（watch-stock）—— 在状态栏实时显示 A 股（沪/深/北）行情，支持价格闹钟、封单监控、大单异动检测。
技术栈：TypeScript + VS Code Extension API + esbuild，数据来源：新浪财经、腾讯财经公开行情接口。

## 常用命令

```bash
npm run typecheck   # TypeScript 类型检查（扩展端 + webview 端）
npm run build       # 类型检查 + esbuild 打包 + vsce 打包成 .vsix
```

调试：在 VS Code 中打开项目，按 F5 启动扩展开发宿主。

## 目录结构

```text
src/
├── extension.ts          # 插件入口（activate/deactivate）
├── commands.ts           # 命令注册与主菜单
├── config.ts             # 配置统一访问入口
├── constants.ts          # 指数/行业代码常量
├── refresher.ts          # 行情刷新与定时器调度
├── types.ts              # 全局类型定义
├── managers/             # 业务管理器
│   ├── stockManager.ts   # 股票增删排序
│   ├── alarmManager.ts   # 价格闹钟
│   ├── lockManager.ts    # 涨跌停封单监控
│   └── largeManager.ts   # 大单监控
├── services/             # 数据服务
│   ├── stockService.ts   # 行情查询（新浪/腾讯双源）
│   └── stockSearch.ts    # 股票搜索
├── ui/                   # UI 模块
│   ├── statusBar.ts      # 状态栏渲染
│   └── stockView.ts      # 股票面板（底部面板 WebviewView）
├── shared/
│   └── protocol.ts       # 扩展 ⇄ webview 消息协议（两端共用）
├── utils/                # 通用工具
│   ├── http.ts           # HTTP 请求
│   ├── msg.ts            # 消息提示与限流
│   ├── stock.ts          # 股票代码/价格处理
│   └── time.ts           # 交易时间与日期工具
└── webview/              # 浏览器端（独立 tsconfig，lib: DOM）
    ├── main.ts           # 入口：消息分发、tab 切换、状态恢复
    ├── list.ts           # 自选/指数行渲染 + 行内展开
    ├── sector.ts         # 板块网格
    ├── chart.ts          # 迷你分时图 + 成交量柱
    ├── format.ts         # 格式化工具
    └── style.css
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
  → stockView.update() 推送股票面板（仅面板可见时发送）
  → statusBar.ts 渲染（或隐藏）
```

### 关键设计决策

- **入口**：`extension.ts` 创建 `AppState`（状态栏、股票面板、用户显隐状态、定时器）；状态栏与股票面板注册到 `context.subscriptions` 统一释放，停用时另行清理刷新/防抖定时器与限流定时器。
- **双数据源**：新浪用于批量行情（有买一/卖一，用于封单计算），腾讯用于完整行情（PE、PB、市值）和分时数据。早盘集合竞价期间（9:15-9:25）新浪无价格 → `getStockList(codes, isSina=false)` 回退到腾讯简版行情。腾讯响应按变量名中的代码键名匹配解析，勿改回按下标对齐（接口返回行数与请求不一致时数据会错位）。
- **统一配置入口**：所有 VS Code 配置读取必须通过 `config.ts` 的 `config` 对象，禁止在业务代码中直接调用 `vscode.workspace.getConfiguration`。`config.getStocks()` 会自动校验股票代码格式、统一转为小写并回写。
- **配置变更刷新**：写配置会触发 `onDidChangeConfiguration`，由 `scheduleRefresh()` 200ms 防抖统一刷新，命令内不要再手动调用刷新；仅 `priceAlarms` 变化不触发刷新（`affectsRefresh()`），避免 `checkAlarms` 刷新中写配置引起连锁刷新。
- **状态栏显隐三态**：`AppState.userForced` 为三态 —— `null` = 跟随市场（根据 `autoHideByMarket` 配置自动显隐），`true` = 强制显示，`false` = 强制隐藏。手动切换后脱离自动模式，需重启编辑器恢复。
- **一键隐藏联动面板**：视图 `when` 条件为上下文键 `watch-stock.show`，激活时设为 true，老板键隐藏时设为 false 使「看盘」tab 从面板中消失（不执行 `closePanel`，避免误关终端）。`autoHideByMarket` 只作用于状态栏，不影响面板。用正向键而非 `!hidden`，是为了激活前视图不存在，防止启动时恢复面板直接弹出行情。
- **股票面板**：`StockViewProvider`（`WebviewView`）注册在底部面板，界面为终端风格（等宽、默认单色，`enableColorful` 仅控制涨跌色；股票名始终显示全称，`showMiniName`/`stockMiniNames` 只作用于状态栏）。webview 端为独立打包的 TS（`src/webview/` → `dist/webview.js` + `dist/webview-style.css`），通过 `asWebviewUri` 引用；CSP 不含 `'unsafe-inline'`，样式一律写在 `style.css` 用 class 控制，勿在 HTML/SVG 中写内联 `style`。两端消息类型定义在 `src/shared/protocol.ts`，该文件须保持环境无关（不依赖 vscode/DOM/node）。
- **面板数据流**：自选行情复用 refresher 主循环数据，不额外请求；指数/板块/展开详情仅在面板可见时按当前 tab 拉取。`retainContextWhenHidden` 关闭，面板重新可见时 webview 重新加载并发送 `ready`（携带 `getState` 恢复的 tab 与展开行），扩展端据此补发数据。面板可见时即使状态栏隐藏，定时器也不跳过刷新。
- **命令注册**：命令统一在 `commands.ts` 注册，命令 ID 集中在 `COMMAND_MAP`，禁止在其他文件中注册命令。
- **消息限流**：`msg.ts` 的 `sendRateLimitMsg()` 将封单/大单异动通知在 60 秒冷却窗口内合并，避免频繁弹窗打扰用户；通知频率统一由它控制，封单/大单判定逻辑内不再单独做冷却。
- **监控缓存跨日清理**：封单/大单监控快照缓存由 refresher 检测日期变化后统一清空（两个 manager 不自带跨日逻辑），避免隔日首帧用昨日快照误报异动。
- **大单判定参数**：阈值集中在 `largeManager.ts` 顶部常量区（绝对门槛、增量门槛下限、价格推动幅度、超大单分级），调灵敏度只动常量，不改判定结构。
- **分时数据缓存**：`StockViewProvider` 中分时数据有 10 秒 TTL 缓存，避免展开行随主循环每 5 秒重复拉分时。
