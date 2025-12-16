# 🚀 摸鱼看盘 VS Code 插件

一个轻量极简的 VS Code 股票实时查看插件，让您在编码的同时轻松掌握股市动态。

## ✨ 核心功能

- 📈 **实时行情** 状态栏实时显示股票价格和涨跌幅
- 📊 **股票看板** 侧边栏分类显示指数、板块和自选股
- 🎯 **智能搜索** 支持股票代码、中文名称搜索
- 🔄 **自动刷新** 可配置刷新频率，默认 5 秒更新
- 👁️ **显示/隐藏** 一键隐藏/显示状态栏股票信息
- ⌨️ **快捷键** 支持快捷键快速切换显示/隐藏
- ⚡ **手动刷新** 随时手动刷新获取最新股票数据
- 🔤 **极简简称** 可配置状态栏显示股票两位简称

## 🎯 快速开始

### 安装插件

1. **从插件市场安装**：在 VS Code 插件市场搜索 `摸鱼看盘`/`watch-stock` 并安装
2. **从 VSIX 安装**：
   - 在 [GitHub Releases](https://github.com/pbstar/watch-stock/releases) 下载最新的 `watch-stock-*.vsix` 文件
   - 在 VS Code 中点击"扩展"图标，选择"从 VSIX 安装"，选择下载的插件包

### 使用步骤

1. **查看股票看板**：点击活动栏的"摸鱼看盘"图标，打开侧边栏查看指数、板块和自选股
2. **添加自选股**：点击状态栏或侧边栏齿轮图标，选择"添加自选股票"，输入股票代码或名称
3. **管理股票**：点击状态栏或侧边栏齿轮图标，可添加、移除、清空自选股票列表
4. **显示/隐藏**：
   - 点击状态栏或使用命令面板
   - 使用快捷键：`Ctrl+Alt+S`（Windows/Linux）或 `Cmd+Alt+S`（macOS）
5. **手动刷新**：点击状态栏 → 选择"刷新行情数据" 或 使用命令面板
6. **个性化配置**：在 VS Code 设置中搜索 `watch-stock`，可配置股票、指数、板块列表、刷新频率、最大显示数量、是否显示 2 位简称等

## 📋 支持的输入格式

- **股票代码**：`sh600519`（上交所）、`sz000001`（深交所）、`bj430047`（北交所）
- **中文名称**：`贵州茅台`、`中国平安` 等

## ⚙️ 配置选项

在 VS Code 设置中搜索 `watch-stock`，可配置以下选项：

| 配置项                          | 类型    | 默认值         | 说明                           |
| ------------------------------- | ------- | -------------- | ------------------------------ |
| `watch-stock.stocks`            | array   | `["sh000001"]` | 自选股票代码表                 |
| `watch-stock.indices`           | array   | `[...]`        | 指数代码列表(在股票看板中显示) |
| `watch-stock.sectors`           | array   | `[...]`        | 板块代码列表(在股票看板中显示) |
| `watch-stock.refreshInterval`   | number  | `5000`         | 刷新间隔（毫秒），最小 3000    |
| `watch-stock.maxDisplayCount`   | number  | `5`            | 状态栏最大显示股票数量         |
| `watch-stock.showTwoLetterCode` | boolean | `false`        | 状态栏是否显示 2 位简称        |

### 配置示例

```json
{
  "watch-stock.stocks": ["sh600519", "sz000001", "sh601318"],
  "watch-stock.indices": ["sh000001", "sz399001", "sz399006"],
  "watch-stock.sectors": ["sh512760", "sh512690", "sh512170"],
  "watch-stock.refreshInterval": 3000,
  "watch-stock.maxDisplayCount": 3,
  "watch-stock.showTwoLetterCode": true
}
```

## 🛠️ 常见问题

### ❓ 股票搜索失败怎么办？

1. **检查网络连接**：确保能访问新浪股票 API
2. **确认格式**：使用标准股票代码格式（如 `sh600519`）
3. **重试搜索**：网络波动可能导致暂时失败

### ❓ 支持哪些股票？

- ✅ **A 股**：上交所（sh）、深交所（sz）、北交所（bj）
- ✅ **支持中文名称搜索**
- ❌ **不支持**：港股、美股、期货

### ❓ 状态栏股票名称太长怎么办？

在 VS Code 设置中启用 `watch-stock.showTwoLetterCode`，状态栏将显示股票两位简称，悬停提示仍显示完整名称。

**示例**：

- 关闭：`贵州茅台 1687.50 ↗1.23%`
- 开启：`贵州 1687.50 ↗1.23%`

### ❓ 数据格式异常怎么办？

如果存储的股票数据格式不正确，插件会自动过滤掉无效的股票代码。

## 🚀 开发说明

### 本地开发

```bash
# 克隆项目
git clone https://github.com/pbstar/watch-stock.git
cd watch-stock

# 使用 VS Code 打开项目
# 按 F5 启动调试模式
```

### 打包发布

```bash
# 安装打包工具
npm install -g @vscode/vsce

# 打包插件
vsce package

# 发布到 VS Code 市场
vsce publish

# 发布到 Open VSX
ovsx publish
```

### 项目结构

```
watch-stock/
├── src/
│   ├── extension.js               # 主入口文件
│   ├── config.js                  # 配置管理
│   ├── managers/                  # 业务管理模块
│   │   └── stockManager.js        # 股票管理
│   ├── pages/                     # 页面模块
│   │   └── indexProvider.js       # 看板页面
│   ├── services/                  # 服务层
│   │   ├── stockService.js        # 股票数据服务
│   │   └── stockSearch.js         # 股票搜索服务
│   ├── ui/                        # UI 层
│   │   └── statusBar.js           # 状态栏管理
│   └── utils/                     # 工具函数
│       ├── stockCode.js           # 股票代码工具
│       └── tradingTime.js         # 交易时间判断
├── images/                        # 图片资源
├── package.json                   # 插件配置
└── README.md                      # 说明文档
```

## 📞 技术支持

### 问题反馈

- **GitHub Issues**: [提交问题](https://github.com/pbstar/watch-stock/issues)
- **功能建议**: 欢迎提交 Pull Request

## 📄 开源协议

本项目采用 [MIT 开源协议](https://github.com/pbstar/watch-stock/blob/main/LICENSE)。

---

<div align="center">
  <p><strong>享受编码，轻松看盘！ 📈💻</strong></p>
  <p>投资有风险，入市需谨慎。本插件仅供学习交流，不构成任何投资建议。</p>
  <p>
    <a href="https://github.com/pbstar/watch-stock">⭐ Star on GitHub</a> |
    <a href="https://github.com/pbstar/watch-stock/issues">🐛 报告问题</a> |
    <a href="https://github.com/pbstar/watch-stock/blob/main/CHANGELOG.md">📝 更新日志</a>
  </p>
</div>
