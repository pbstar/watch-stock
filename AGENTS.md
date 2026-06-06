# AGENTS.md

本文件为 AI 编程助手提供项目上下文与协作规范，请在修改代码前先阅读。

## AI 工作原则

### 工作前 · 思考先于行动

**1. 沟通语言**

- 始终使用中文与人类交互，确保沟通零障碍。

**2. 计划先行**

- 动手前先梳理思路，制定清晰计划。
- 向人类同步方案概要，对齐预期后再执行，避免方向性返工。

**3. 全局视角**

- 修改代码须先理解整体架构，评估改动影响面。
- 不因局部需求破坏模块边界、引入耦合或技术债。

**4. 依赖选择**

- 第三方插件与包优先选用最新稳定版。
- 引入新依赖前确认必要性、维护状态与兼容性。

**5. 文档优先**

- 遇到技术疑问先查阅对应技术栈的官方文档或项目已有文档。
- 文档明确后再动手，不基于模糊记忆或推测编码。

**6. 不确定必问**

- 遇到需求模糊、边界不清、多种可行方案时，必须向人类确认。
- 绝不猜测、不臆断、不擅自做主，宁可多问一句，不埋一颗雷。

### 工作中 · 质量建于细节

**1. 代码简洁**

- 追求代码清晰易读、结构扁平和逻辑直观。
- 避免过度设计、冗余抽象和炫技写法。
- 写好注释，解释“为什么”而非“做了什么”。

**2. 界面清晰**

- 页面设计遵循简洁清晰原则，参考 Google Material Design 风格。
- 信息层级分明，操作路径短，视觉噪音少。

**3. 复用优先**

- 多处出现相同或相似逻辑，及时封装为可复用组件/函数/工具方法。
- 复用粒度适中，不强行抽象，保持灵活与简单的平衡。

**4. 规范一致**

- 严格遵循项目已有的代码风格、命名规范、目录结构和架构约定。
- 新代码应与既有代码库浑然一体，而非自成风格。

### 工作后 · 交付即负责

**1. 主动测试**

- 功能完成后主动进行测试验证，覆盖正常路径与典型边界情况。
- 发现潜在关联影响一并验证，不只测“自己改的那一行”。

**2. 主动优化**

- 回看已完成代码，检查是否有可精简、可合并、可提升性能之处。
- 在不影响稳定性的前提下持续打磨，力求“完成且出色”。

**3. 主动反馈**

- 完成后向人类简明汇报：做了哪些改动、原因是什么、有无需要注意的地方。
- 若发现设计缺陷、潜在风险或更好的实现思路，主动提出建议供人类决策。

### 核心精神

**把每一次交互当作真实的工程协作：思考严谨、执行到位、交付负责。做人类最可靠的 AI 搭档，而非一个只会写代码的工具。**

---

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
├── config.ts             # 配置统一访问入口、常量定义
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
│   └── stockHome.ts      # 详情面板（Webview）
├── utils/                # 通用工具
│   ├── http.ts           # HTTP 请求
│   ├── msg.ts            # 消息提示
│   ├── stock.ts          # 股票代码/价格处理
│   └── time.ts           # 交易时间判断
└── webview/              # Webview HTML 模板
    ├── stockHome.html
    ├── stockOverview.html
    ├── stockDetail.html
    └── stockChart.html
```

## 核心架构

### 数据流（主循环）

```
refresher.ts（交易时间每 5 秒一次）
  → stockService.ts（从新浪/腾讯拉取行情）
  → 每只股票计算封单 calculateLockInfo()（lockManager.ts）
  → 检查价格闹钟 checkAlarms()（alarmManager.ts）
  → 检查封单异动 / 大单异动（仅开启且稳定交易时段）
  → statusBar.ts 渲染（或隐藏）
```

### 关键设计决策

- **入口**：`extension.ts` 创建 `AppState`，包含状态栏、用户显隐状态、定时器。
- **双数据源**：新浪用于批量行情（有买一/卖一，用于封单计算），腾讯用于完整行情（PE、PB、市值）和分时数据。早盘集合竞价期间（9:15-9:25）新浪无价格 → `getStockList(codes, isSina=false)` 回退到腾讯简版行情。
- **统一配置入口**：所有 VS Code 配置读取必须通过 `config.ts` 的 `config` 对象，禁止在业务代码中直接调用 `vscode.workspace.getConfiguration`。`config.getStocks()` 会自动校验股票代码格式并回写合法值。
- **状态栏显隐三态**：`AppState.userForced` 为三态 —— `null` = 跟随市场（根据 `autoHideByMarket` 配置自动显隐），`true` = 强制显示，`false` = 强制隐藏。手动切换后脱离自动模式，需重启编辑器恢复。
- **Webview 面板**：`StockHomePanel` 是单例，构建时将 4 个 HTML 模板通过 esbuild `text` loader 内联为字符串。占位符（`{{NONCE}}`、`{{OVERVIEW_HTML}}` 等）在运行时做字符串替换。每次加载面板生成新的 CSP nonce。修改 HTML 后无需手动构建，`npm run build` 自动压缩。
- **命令注册**：命令统一在 `commands.ts` 注册，命令 ID 集中在 `COMMAND_MAP`，禁止在其他文件中注册命令。
- **详情面板**：通过 Webview 加载 `src/webview/*.html`，由 esbuild 内联为字符串。
- **消息限流**：`msg.ts` 的 `sendRateLimitMsg()` 将封单/大单异动通知在 60 秒冷却窗口内合并，避免频繁弹窗打扰用户。
- **分时数据缓存**：`StockHomePanel` 中分时数据有 10 秒 TTL 缓存，避免切换股票标签时重复请求。
