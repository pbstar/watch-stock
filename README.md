# 🚀 摸鱼看盘 VS Code 插件

一个优雅、极简的 VS Code 股票实时查看插件，让您在编码的同时轻松掌握股市动态。

> **项目地址**: [https://github.com/pbstar/watch-stock](https://github.com/pbstar/watch-stock)

## ✨ 核心功能

| 功能            | 描述                           |
| --------------- | ------------------------------ |
| 📈 **实时行情** | 状态栏实时显示股票价格和涨跌幅 |
| 🎯 **智能搜索** | 支持股票代码、中文名称搜索     |
| 🔄 **自动刷新** | 可配置刷新频率，默认 5 秒更新  |
| 👁️ **显示/隐藏** | 一键隐藏/显示状态栏股票信息   |
| ⚡ **手动刷新** | 随时手动刷新获取最新股票数据   |
| 🔤 **极简简称** | 可配置状态栏显示股票两位简称 |

## 🎯 使用教程

- **安装插件**：在 VS Code 插件市场搜索 `watch-stock` 并安装
- **添加股票**：点击状态栏的股票信息，选择"添加股票"，输入股票代码或名称
- **管理股票**：点击状态栏的股票信息，选择"管理股票"，可移除、清空股票列表
- **显示/隐藏**：点击状态栏或使用命令面板，一键隐藏/显示股票信息
- **手动刷新**：点击状态栏 → 选择"刷新股票数据" 或 使用命令面板
- **个性化配置**：在 VS Code 设置中搜索 `watch-stock`，可配置股票列表、刷新频率、极简简称等

![图片教程](./images/use.png)

### 🛠️ 常见问题

#### ❓ 股票搜索失败怎么办？

1. **检查网络连接**：确保能访问新浪股票 API
2. **确认格式**：使用标准股票代码格式
3. **重试搜索**：网络波动可能导致暂时失败

#### ❓ 支持哪些股票？

- ✅ A 股：上交所、深交所、北交所
- ✅ 支持中文名称搜索
- ❌ 不支持港股、美股、期货

#### ❓ 在插件市场搜不到怎么办？

1. **下载 vsix 插件包**：在 [github](https://github.com/pbstar/watch-stock) 下载最新的 `watch-stock-*.vsix` 文件
2. **安装插件**：在 VS Code 中点击"扩展"图标，选择"从 VSIX 安装"，选择下载的插件包

![图片教程](./images/setup2.png)

### 📋 支持的输入格式

- **股票代码**：`sh600519`、`sz000001`、`bj430047`
- **中文名称**：`贵州茅台`

## 🚀 开发说明

### 从 GitHub 安装

```bash
# 克隆项目
git clone https://github.com/pbstar/watch-stock.git
cd watch-stock

# 使用VS Code打开
# 按 F5 启动调试模式

# 打包插件
npm install -g @vscode/vsce
vsce package

# 发布插件
vsce publish
ovsx publish
```

## 📞 技术支持

### 问题反馈

- **GitHub Issues**: [提交问题](https://github.com/pbstar/watch-stock/issues)

## 📄 开源协议

本项目采用 [MIT 开源协议](https://github.com/pbstar/watch-stock/blob/main/LICENSE)。

---

<div align="center">
  <p><strong>💡 点击状态栏股票信息开始使用！</strong></p>
  <p><a href="https://github.com/pbstar/watch-stock">⭐ Star on GitHub</a></p>
</div>

#### ❓ 状态栏股票名称太长怎么办？

在 VS Code 设置中搜索 `watch-stock.showTwoLetterCode`，启用后状态栏将显示股票两位简称，悬停提示仍显示完整名称。

例如：
- 关闭：贵州茅台 1687.50 ↗1.23%
- 开启：贵州 1687.50 ↗1.23%
