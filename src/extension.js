/**
 * 摸鱼看盘 - VS Code股票实时查看插件
 *
 * 功能特点：
 * - 实时显示股票价格信息
 * - 支持股票代码和中文名称搜索
 * - 状态栏显示，不影响编码
 * - 可管理多只股票
 * - 定时自动刷新数据
 * - 批量查询优化，一次请求获取多只股票数据
 */

const vscode = require("vscode");
const StatusBarManager = require("./ui/statusBar");
const StockManager = require("./managers/stockManager");
const IndexProvider = require("./pages/indexProvider");
const { getStocks, getRefreshInterval } = require("./config");
const { isTradingTime } = require("./utils/tradingTime");

// 全局变量
let statusBarManager;
let stockManager;
let refreshInterval;
let indexProvider;

/**
 * 插件激活函数
 */
function activate(context) {
  console.log("摸鱼看盘插件已启动");

  // 初始化管理器
  statusBarManager = new StatusBarManager();
  stockManager = new StockManager();

  // 注册侧边栏视图
  indexProvider = new IndexProvider();
  const treeView = vscode.window.createTreeView("watchStockIndex", {
    treeDataProvider: indexProvider,
  });

  // 监听股票看板可见性变化
  treeView.onDidChangeVisibility((event) => {
    indexProvider.setShowPage(event.visible);
    console.log(`股票看板可见性: ${event.visible ? "显示" : "隐藏"}`);
  });

  context.subscriptions.push(treeView);

  // 添加 IndexProvider 到订阅中，确保正确清理
  context.subscriptions.push(indexProvider);

  // 初始化状态栏
  statusBarManager.initialize();

  // 注册命令
  registerCommands(context);

  // 监听配置变化，自动更新定时器
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (e) => {
      // 刷新股票数据
      statusBarManager.updateStockInfo();
      indexProvider.updateData();
      if (e.affectsConfiguration("watch-stock.refreshInterval")) {
        startRefreshTimer();
      }
    }
  );
  context.subscriptions.push(configChangeListener);

  // 开始定时更新
  startRefreshTimer();
  // 初始化时先刷新一次数据
  statusBarManager.updateStockInfo();
  indexProvider.updateData();
}

/**
 * 注册所有命令
 */
function registerCommands(context) {
  // 添加自选股票
  const addStockCommand = vscode.commands.registerCommand(
    "watch-stock.addStock",
    () =>
      stockManager.addStock(() => {
        statusBarManager.updateStockInfo();
        indexProvider.updateData();
      })
  );

  // 移除自选股票
  const removeStockCommand = vscode.commands.registerCommand(
    "watch-stock.removeStock",
    () => stockManager.removeStock(() => statusBarManager.updateStockInfo())
  );

  // 清空自选股票
  const clearStocksCommand = vscode.commands.registerCommand(
    "watch-stock.clearStocks",
    () => stockManager.clearStocks(() => statusBarManager.updateStockInfo())
  );

  // 管理股票（主菜单）
  const manageStockCommand = vscode.commands.registerCommand(
    "watch-stock.manageStock",
    async () => {
      const stocks = getStocks();
      const isVisible = statusBarManager.getIsVisible();

      const options = [
        {
          label: "$(add) 添加自选股票",
          description: "输入股票代码或名称添加新的自选股票",
          action: "add",
        },
      ];

      // 如果已有股票，添加更多选项
      if (stocks.length > 0) {
        options.push({
          label: "$(remove) 移除自选股票",
          description: "从已添加的自选股票中选择移除",
          action: "remove",
        });
        options.push({
          label: "$(trash) 清空自选股票",
          description: "清空所有已添加的自选股票",
          action: "clear",
        });
      }

      // 其他操作
      options.push(
        {
          label: isVisible ? "$(eye-closed) 隐藏状态栏" : "$(eye) 显示状态栏",
          description: isVisible
            ? "隐藏状态栏股票信息显示"
            : "显示状态栏股票信息",
          action: "toggle",
        },
        {
          label: "$(refresh) 刷新行情数据",
          description: "手动刷新股票行情数据",
          action: "refresh",
        }
      );

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder:
          stocks.length > 0 ? "选择操作" : "还没有添加股票，请选择操作",
      });

      if (!selected) return;

      switch (selected.action) {
        case "add":
          await vscode.commands.executeCommand("watch-stock.addStock");
          break;
        case "remove":
          await vscode.commands.executeCommand("watch-stock.removeStock");
          break;
        case "clear":
          await vscode.commands.executeCommand("watch-stock.clearStocks");
          break;
        case "toggle":
          await vscode.commands.executeCommand("watch-stock.toggleVisibility");
          break;
        case "refresh":
          await vscode.commands.executeCommand("watch-stock.refreshData");
          break;
      }
    }
  );

  // 切换显示/隐藏
  const toggleVisibilityCommand = vscode.commands.registerCommand(
    "watch-stock.toggleVisibility",
    () => {
      statusBarManager.toggleVisibility();
    }
  );

  // 刷新行情数据
  const refreshDataCommand = vscode.commands.registerCommand(
    "watch-stock.refreshData",
    async () => {
      await statusBarManager.updateStockInfo();
      await indexProvider.updateData();
      vscode.window.showInformationMessage("股票行情数据刷新完成");
    }
  );

  // 指数视图操作按钮
  const indexViewActionCommand = vscode.commands.registerCommand(
    "watch-stock.indexViewAction",
    async () => {
      await vscode.commands.executeCommand("watch-stock.manageStock");
    }
  );

  // 注册所有命令到订阅
  context.subscriptions.push(
    statusBarManager.getStatusBarItem(),
    addStockCommand,
    removeStockCommand,
    clearStocksCommand,
    manageStockCommand,
    toggleVisibilityCommand,
    refreshDataCommand,
    indexViewActionCommand
  );
}

/**
 * 启动定时刷新
 */
function startRefreshTimer() {
  const interval = getRefreshInterval();

  // 清除现有定时器
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // 设置新的定时器，只在交易时间内刷新
  refreshInterval = setInterval(() => {
    if (isTradingTime()) {
      // 同时更新状态栏和指数视图
      statusBarManager.updateStockInfo();
      indexProvider.updateData();
    } else {
      console.log("当前非交易时间，跳过刷新");
    }
  }, interval);
}

/**
 * 插件停用函数
 */
function deactivate() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (statusBarManager) {
    statusBarManager.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
