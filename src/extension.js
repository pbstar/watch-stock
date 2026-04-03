/**
 * 摸鱼看盘 - VS Code股票实时查看插件
 */

const vscode = require("vscode");
const StatusBarManager = require("./ui/statusBar");
const StockDetailPanel = require("./ui/stockDetail");
const StockManager = require("./managers/stockManager");
const AlarmManager = require("./managers/alarmManager");
const { getStocks, getAutoHideByMarket } = require("./config");
const { getStockList } = require("./services/stockService");
const { isTradingTime } = require("./utils/tradingTime");

// 全局变量
let statusBarManager;
let stockManager;
let alarmManager;
let refreshInterval;
// null=自动  true=用户强制显示  false=用户强制隐藏
let userForced = null;

// 获取状态栏是否可见
const getIsVisible = () => {
  if (userForced !== null) return userForced;
  return getAutoHideByMarket() ? isTradingTime() : true;
};

/**
 * 插件激活函数
 */
function activate(context) {
  console.log("摸鱼看盘插件已启动");

  // 初始化管理器
  statusBarManager = new StatusBarManager();
  stockManager = new StockManager();
  alarmManager = new AlarmManager();

  // 初始化状态栏
  statusBarManager.initialize();

  // 注册命令
  registerCommands(context);

  // 开始定时更新
  startRefreshTimer();
}

/**
 * 注册所有命令
 */
function registerCommands(context) {
  // 添加股票
  const addStockCommand = vscode.commands.registerCommand(
    "watch-stock.addStock",
    () =>
      stockManager.addStock(() => {
        updateDataAndCheckAlarms();
      }),
  );

  // 移除股票
  const removeStockCommand = vscode.commands.registerCommand(
    "watch-stock.removeStock",
    () =>
      stockManager.removeStock(() => {
        updateDataAndCheckAlarms();
      }, alarmManager),
  );

  // 清空股票
  const clearStocksCommand = vscode.commands.registerCommand(
    "watch-stock.clearStocks",
    () =>
      stockManager.clearStocks(() => {
        updateDataAndCheckAlarms();
      }, alarmManager),
  );

  // 排序股票
  const sortStocksCommand = vscode.commands.registerCommand(
    "watch-stock.sortStocks",
    () =>
      stockManager.sortStocks(() => {
        updateDataAndCheckAlarms();
      }),
  );

  // 价格闹钟
  const priceAlarmCommand = vscode.commands.registerCommand(
    "watch-stock.priceAlarm",
    () => alarmManager.manageAlarms(),
  );

  // 管理股票（主菜单）
  const manageStockCommand = vscode.commands.registerCommand(
    "watch-stock.manageStock",
    async () => {
      const stocks = getStocks();
      const isVisible = getIsVisible();

      const options = [
        {
          label: "$(add) 添加股票",
          description: "输入股票代码或名称添加",
          action: "add",
        },
      ];

      // 如果已有股票，添加更多选项
      if (stocks.length > 0) {
        options.push({
          label: "$(list-flat) 查看股票",
          description: "查看股票详情",
          action: "detail",
        });
        options.push({
          label: "$(remove) 移除股票",
          description: "从已添加的股票中选择移除",
          action: "remove",
        });
        options.push({
          label: "$(arrow-swap) 排序股票",
          description: "调整股票的显示顺序",
          action: "sort",
        });
        options.push({
          label: "$(trash) 清空股票",
          description: "清空所有已添加的股票",
          action: "clear",
        });
        options.push({
          label: "$(bell) 价格闹钟",
          description: "股票价格达到目标时提醒",
          action: "alarm",
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
        },
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
        case "detail":
          await vscode.commands.executeCommand("watch-stock.viewDetail");
          break;
        case "remove":
          await vscode.commands.executeCommand("watch-stock.removeStock");
          break;
        case "sort":
          await vscode.commands.executeCommand("watch-stock.sortStocks");
          break;
        case "clear":
          await vscode.commands.executeCommand("watch-stock.clearStocks");
          break;
        case "alarm":
          await vscode.commands.executeCommand("watch-stock.priceAlarm");
          break;
        case "toggle":
          await vscode.commands.executeCommand("watch-stock.toggleVisibility");
          break;
        case "refresh":
          await vscode.commands.executeCommand("watch-stock.refreshData");
          break;
      }
    },
  );

  // 切换显示/隐藏
  const toggleVisibilityCommand = vscode.commands.registerCommand(
    "watch-stock.toggleVisibility",
    () => {
      userForced = getIsVisible() ? false : true;
      // 恢复显示时重新渲染，否则停留在隐藏图标
      if (userForced) {
        updateDataAndCheckAlarms();
      } else {
        statusBarManager.setHidden();
      }
    },
  );

  // 刷新行情数据
  const refreshDataCommand = vscode.commands.registerCommand(
    "watch-stock.refreshData",
    async () => {
      await updateDataAndCheckAlarms();
      vscode.window.showInformationMessage("股票行情数据刷新完成");
    },
  );

  // 查看分时图
  const viewDetailCommand = vscode.commands.registerCommand(
    "watch-stock.viewDetail",
    async () => {
      const stocks = getStocks();
      if (stocks.length === 0) {
        vscode.window.showInformationMessage("请先添加股票");
        return;
      }
      const infos = await getStockList(stocks);
      if (infos.length === 0) {
        vscode.window.showErrorMessage("获取股票数据失败，请检查网络连接");
        return;
      }
      await StockDetailPanel.show(infos);
    },
  );

  // 监听配置变化，只响应本插件配置变化
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (e) => {
      if (e.affectsConfiguration("watch-stock")) {
        updateDataAndCheckAlarms();
      }
    },
  );

  // 注册所有命令到订阅
  context.subscriptions.push(
    statusBarManager.getStatusBarItem(),
    addStockCommand,
    removeStockCommand,
    clearStocksCommand,
    sortStocksCommand,
    priceAlarmCommand,
    manageStockCommand,
    toggleVisibilityCommand,
    refreshDataCommand,
    viewDetailCommand,
    configChangeListener,
  );
}

/**
 * 获取股票数据、更新状态栏、检查闹钟
 * 数据获取与状态栏可见性无关，确保隐藏时闹钟仍能触发
 */
async function updateDataAndCheckAlarms() {
  const stocks = getStocks();
  const stockInfos = stocks.length > 0 ? await getStockList(stocks) : [];

  // 闹钟检查不依赖可见性
  if (stockInfos.length > 0) {
    await alarmManager.checkAlarms(stockInfos);
  }

  // 渲染状态栏
  if (getIsVisible()) {
    statusBarManager.render(stocks, stockInfos);
  } else {
    statusBarManager.setHidden();
  }
}

/**
 * 启动定时刷新
 */
function startRefreshTimer() {
  // 清除现有定时器
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // 初始化时先刷新一次数据
  updateDataAndCheckAlarms();

  // 设置新的定时器，只在交易时间内刷新
  refreshInterval = setInterval(() => {
    const trading = isTradingTime();
    if (trading) {
      updateDataAndCheckAlarms();
    } else {
      console.log("当前非交易时间，跳过刷新");
      if (getAutoHideByMarket() && userForced === null) {
        statusBarManager.setHidden();
      }
    }
  }, 5000);
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
