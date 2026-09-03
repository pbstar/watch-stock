# AGENTS.md

本文件为 AI 编程助手提供项目上下文，请在修改代码前先阅读。

## 项目简介

VS Code 扩展 "摸鱼看盘"（watch-stock）—— 在状态栏实时显示 A 股（沪/深/北）行情，支持价格闹钟、封单监控、大单异动检测。
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
├── types.ts              # 全局类型定义
├── global.d.ts           # 全局类型声明
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
│   └── stockHome.ts      # 查看股票面板（Webview）
├── utils/                # 通用工具
│   ├── http.ts           # HTTP 请求
│   ├── msg.ts            # 消息提示与限流
│   ├── stock.ts          # 股票代码/价格处理
│   └── time.ts           # 交易时间与日期工具
└── webview/              # Webview HTML 模板
    ├── stockHome.html
    ├── stockOverview.html
    ├── stockDetail.html
    └── stockChart.html
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
- **状态栏显隐三态**：`AppState.userForced` 为三态 —— `null` = 跟随市场（根据 `autoHideByMarket` 配置自动显隐），`true` = 强制显示，`false` = 强制隐藏。手动切换后脱离自动模式，需重启编辑器恢复。
- **Webview 面板**：`StockHomePanel` 是单例，构建时将 4 个 HTML 模板通过 esbuild `text` loader 内联为字符串，运行时替换占位符（`{{NONCE}}`、`{{OVERVIEW_HTML}}` 等）并生成新的 CSP nonce。占位符替换必须用函数形式（`replace("{{X}}", () => value)`），避免片段中的 `$&`、`$'` 被当作特殊替换序列展开。修改 HTML 后无需手动构建，`npm run build` 自动压缩。
- **命令注册**：命令统一在 `commands.ts` 注册，命令 ID 集中在 `COMMAND_MAP`，禁止在其他文件中注册命令。
- **消息限流**：`msg.ts` 的 `sendRateLimitMsg()` 将封单/大单异动通知在 60 秒冷却窗口内合并，避免频繁弹窗打扰用户；通知频率统一由它控制，封单/大单判定逻辑内不再单独做冷却。
- **监控缓存跨日清理**：封单/大单监控快照缓存由 refresher 检测日期变化后统一清空（两个 manager 不自带跨日逻辑），避免隔日首帧用昨日快照误报异动。
- **大单判定参数**：阈值集中在 `largeManager.ts` 顶部常量区（绝对门槛、增量门槛下限、价格推动幅度、超大单分级），调灵敏度只动常量，不改判定结构。
- **分时数据缓存**：`StockHomePanel` 中分时数据有 10 秒 TTL 缓存，避免切换股票标签时重复请求。
