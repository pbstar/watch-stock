# 🚀 摸鱼看盘 VS Code 插件

一个轻量极简的 VS Code 股票实时查看插件，让您在编码的同时轻松掌握股市动态。

## ✨ 核心功能

- 📈 **实时行情** 状态栏实时显示股票价格和涨跌幅
- ⏰ **价格闹钟** 设置价格提醒，价格达到目标自动通知
- 📋 **查看股票** 点击即可打开股票详情面板，查看分时图和成交量
- 🔄 **自定义排序** 支持调整股票显示顺序，优先关注重要股票
- 👁️ **显示/隐藏** 一键隐藏/显示状态栏股票信息
- ⌨️ **快捷键** 支持快捷键快速切换显示/隐藏

## 🎯 快速开始

### 安装插件

1. **从插件市场安装**：在 VS Code 插件市场搜索 `摸鱼看盘`/`watch-stock` 并安装
2. **从 VSIX 安装**：
   - 在 [GitHub Releases](https://github.com/pbstar/watch-stock/releases) 下载最新的 `watch-stock-*.vsix` 文件
   - 在 VS Code 中点击"扩展"图标，选择"从 VSIX 安装"，选择下载的插件包

### 使用步骤

1. **添加股票**：点击状态栏股票信息，选择"添加股票"，输入股票代码或名称
2. **管理股票**：点击状态栏股票信息，可添加、移除、排序、清空股票列表
3. **排序股票**：点击状态栏股票信息 → 选择"排序股票" → 选择要移动的股票 → 选择目标位置
4. **价格闹钟**：点击状态栏股票信息 → 选择"价格闹钟"
   - 设置新闹钟：选择股票 → 选择条件（高于/低于）→ 输入目标价格
   - 管理闹钟：在闹钟列表中点击即可删除，或选择"删除所有闹钟"
   - 触发机制：价格达到目标价格时自动弹出通知，并自动删除该闹钟
   - 自动清理：删除股票时会同步删除相关闹钟
5. **查看股票**：点击状态栏股票信息 → 选择"查看股票"
   - 打开详情面板，展示所关注股票的分时图和成交量
   - 点击顶部标签栏切换查看不同股票
   - 点击"刷新"按钮手动刷新当前股票数据
6. **显示/隐藏**：
   - 点击状态栏或使用命令面板
   - 使用快捷键：`Ctrl+Alt+S`（Windows/Linux）或 `Cmd+Alt+S`（macOS）
7. **手动刷新**：点击状态栏 → 选择"刷新行情数据" 或 使用命令面板
8. **个性化配置**：在扩展设置中可配置股票列表、最大显示数量、是否显示简称、自定义股票简称、是否显示涨跌值、是否根据开休市时间自动显示/隐藏状态栏等

## ⚙️ 配置选项

点击插件的`扩展设置`或在设置中搜索 `@ext:pbstar.watch-stock`，可配置以下选项：

| 配置项             | 类型    | 默认值         | 说明                                             |
| ------------------ | ------- | -------------- | ------------------------------------------------ |
| `stocks`           | array   | `["sh000001"]` | 股票代码列表                                     |
| `priceAlarms`      | array   | `[]`           | 价格闹钟列表                                     |
| `maxDisplayCount`  | number  | `5`            | 状态栏最大显示股票数量                           |
| `showMiniName`     | boolean | `false`        | 状态栏是否显示简称，没有配置时默认截取名称前两位 |
| `stockMiniNames`   | object  | `{}`           | 股票自定义简称映射，例如 `{"sh601318": "平安"}`  |
| `showChangeValue`  | boolean | `false`        | 状态栏是否显示涨跌值                             |
| `autoHideByMarket` | boolean | `false`        | 根据开休市时间自动显示/隐藏状态栏                |

## 🛠️ 常见问题

### ❓ 股票搜索失败怎么办？

1. **检查网络连接**：确保能访问新浪股票 API
2. **确认格式**：使用标准股票代码格式（如 `sh600519`）或中文名称搜索
3. **重试搜索**：网络波动可能导致暂时失败

### ❓ 支持哪些股票？

- ✅ **A 股**：上交所（sh）、深交所（sz）、北交所（bj）
- ❌ **不支持**：港股、美股、期货

### ❓ 股票太多状态栏显示不全怎么办？

状态栏空间有限，默认只显示前 5 只股票。你可以：

- **调整显示数量**：修改 `watch-stock.maxDisplayCount` 配置（建议 3-8 之间）
- **使用自定义排序**：通过"排序股票"功能，将最重要的股票排在前面优先显示
- **启用简称显示**：开启 `watch-stock.showMiniName`，显示股票简称（默认截取名称前两位），可通过 `watch-stock.stockMiniNames` 为每只股票配置自定义简称

### ❓ 开启了根据开休市时间自动显示/隐藏状态栏，但是状态栏还是不显示怎么办？

- 手动设置过状态栏显示/隐藏，插件会记住你的选择，重启编辑器后会自动恢复。

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
│   ├── services/                  # 服务层
│   ├── ui/                        # UI 层
│   └── utils/                     # 工具函数
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
