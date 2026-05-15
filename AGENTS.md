# AGENTS.md

> 本文件为 AI 编程助手提供项目上下文与协作规范，请在修改代码前先阅读。

## 项目简介

- 名称：摸鱼看盘（watch-stock）
- 类型：VS Code 扩展插件
- 功能：在状态栏实时显示 A 股行情、价格闹钟、封单监控等
- 技术栈：TypeScript + VS Code Extension API + esbuild
- 数据源：新浪财经、腾讯财经的公开行情接口

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

- 入口 `extension.ts` 创建 `AppState`，包含状态栏、用户显隐状态、定时器
- `refresher.ts` 每 5 秒拉取行情 → 计算封单 → 触发闹钟 → 渲染状态栏
- 所有 VS Code 配置通过 `config.ts` 的 `config` 对象访问，禁止直接调用 `vscode.workspace.getConfiguration`
- 命令统一在 `commands.ts` 注册，命令 ID 集中在 `COMMAND_MAP`
- 详情面板通过 Webview 加载 `src/webview/*.html`，由 esbuild 内联为字符串

## 编码规范

### 通用

- 所有注释使用简短的中文单行注释，避免多行注释
- 注释与代码同步更新，仅解释非显而易见的意图、权衡、约束
- 不写 `// 导入模块`、`// 返回结果` 这类废注释
- 以简单优雅、易读为原则，避免复杂逻辑

### 命名

- 变量与函数：小驼峰 `camelCase`
- 类型/接口：大驼峰 `PascalCase`
- 文件名：小驼峰 `camelCase.ts`
- 常量：全大写 `SNAKE_CASE`

### TypeScript

- 禁用 `any`，使用具体类型或 `unknown`
- 函数参数与返回值必须显式标注类型
- 对象类型用 `interface`，联合/工具类型用 `type`
- 启用 `strict`、`noUnusedLocals`、`noUnusedParameters`，提交前清理未使用代码

### 代码组织

- `import` 顺序：第三方库 → 项目内部模块 → 类型定义（`import type`）
- 同一路径只 `import` 一次，所有 `import` 置于文件顶部
- 单文件不超过 300 行，单函数不超过 30 行，嵌套不超过 3 层
- 异步错误用 `try-catch` 处理，给出有意义的错误信息

### Webview / HTML

- HTML 模板以 `text` 形式被 esbuild 内联，无需考虑路径
- 占位符使用 `{{ key }}` 形式，由 TS 侧字符串替换
- 修改 HTML 后无需手动构建，`npm run build` 自动压缩

## 开发流程

### 修改代码前

- 先 `Read` 相关文件了解上下文
- 检查是否有可复用的实现
- 涉及 `package.json` 依赖增删/版本变更必须先与用户确认

### 修改代码后

- 检查能否在功能不变的前提下简化逻辑
- 修复 linter / TypeScript 错误
- 运行 `npm run typecheck` 确保类型通过
- 清理未使用的导入、变量、注释

### 构建命令

```bash
npm run typecheck   # 类型检查
npm run build       # 类型检查 + esbuild 打包 + vsce 打包成 .vsix
```

## 关键约定

- 股票代码格式：交易所前缀 + 6 位数字，如 `sh600519`、`sz000001`、`bj899050`
- 大盘指数代码列表在 `config.ts` 的 `INDEX_CODES`
- 行业板块代码列表在 `config.ts` 的 `INDUSTRY_CODES`
- 交易时间判断统一走 `utils/time.ts`，禁止在业务代码中硬编码时间
- 状态栏显示数量由 `maxDisplayCount` 控制（默认 5）
- 仅支持 A 股（沪/深/北），不支持港股、美股、期货、场外基金
- 消息提示统一调用 `utils/msg.ts` 的 `sendMsg`，不要直接用 `vscode.window.showXxxMessage`

## 不要做

- 不要修改 `dist/`、`node_modules/`、`versions/`、`*.vsix` 等构建产物
- 不要在业务代码中直接调用 `vscode.workspace.getConfiguration`，请走 `config.ts`
- 不要在 `commands.ts` 之外注册命令
- 不要在状态栏渲染中做异步请求，请先在 `refresher.ts` 拉好数据
- 不要主动创建文档 / README 文件，除非用户明确要求

## 反馈与发布

- 用户反馈渠道：[GitHub Issues](https://github.com/pbstar/watch-stock/issues)
- 版本号在 `package.json` 与 `CHANGELOG.md` 同步维护
