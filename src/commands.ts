// 命令注册与定时刷新
import * as vscode from "vscode";
import { StatusBarManager } from "./ui/statusBar";
import { StockHomePanel } from "./ui/stockHome";
import {
  addStock,
  removeStock,
  clearStocks,
  sortStocks,
} from "./managers/stockManager";
import { AlarmManager } from "./managers/alarmManager";
import { calculateLockInfo, checkLockTip } from "./managers/lockManager";
import { sendMsg } from "./utils/msg";
import { config } from "./config";
import { getStockList } from "./services/stockService";
import {
  isTradingTime,
  isMorningAuctionTime,
  isAfternoonAuctionTime,
} from "./utils/time";

// 刷新间隔 5 秒
const REFRESH_INTERVAL = 5000;

interface AppState {
  statusBar: StatusBarManager;
  alarm: AlarmManager;
  // null=自动 true=用户强制显示 false=用户强制隐藏
  userForced: boolean | null;
  refreshTimer: NodeJS.Timeout | null;
}

function getIsVisible(state: AppState): boolean {
  if (state.userForced !== null) return state.userForced;
  return config.getAutoHideByMarket() ? isTradingTime() : true;
}

// 拉取数据 -> 计算封单 -> 触发闹钟/异动 -> 渲染状态栏
async function updateDataAndCheckAlarms(state: AppState): Promise<void> {
  const stocks = config.getStocks();
  const isMorningAuction = isMorningAuctionTime();
  const isAfternoonAuction = isAfternoonAuctionTime();
  const stockInfos =
    stocks.length > 0 ? await getStockList(stocks, !isMorningAuction) : [];

  for (const stock of stockInfos) {
    const lockInfo = calculateLockInfo(stock);
    Object.assign(stock, lockInfo);
  }

  if (stockInfos.length > 0) {
    await state.alarm.checkAlarms(stockInfos);
  }

  if (!isMorningAuction && !isAfternoonAuction && config.getEnableLockTip()) {
    checkLockTip(stockInfos);
  }

  if (getIsVisible(state)) {
    state.statusBar.render(stocks, stockInfos);
  } else {
    state.statusBar.setHidden();
  }
}

// 启动定时器，固定 5s 间隔，仅交易时段拉数据
function startRefreshTimer(state: AppState): void {
  if (state.refreshTimer) clearInterval(state.refreshTimer);

  void updateDataAndCheckAlarms(state);

  state.refreshTimer = setInterval(() => {
    if (isTradingTime()) {
      void updateDataAndCheckAlarms(state);
    } else if (config.getAutoHideByMarket() && state.userForced === null) {
      state.statusBar.setHidden();
    }
  }, REFRESH_INTERVAL);
}

// 停止刷新
function stopRefreshTimer(state: AppState): void {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

// 注册全部命令
export function registerCommands(context: vscode.ExtensionContext): () => void {
  const state: AppState = {
    statusBar: new StatusBarManager(),
    alarm: new AlarmManager(),
    userForced: null,
    refreshTimer: null,
  };

  state.statusBar.initialize();

  const refresh = (): void => {
    void updateDataAndCheckAlarms(state);
  };

  const subs: vscode.Disposable[] = [
    state.statusBar.getStatusBarItem()!,
    vscode.commands.registerCommand("watch-stock.addStock", () =>
      addStock(refresh),
    ),
    vscode.commands.registerCommand("watch-stock.removeStock", () =>
      removeStock(refresh, state.alarm),
    ),
    vscode.commands.registerCommand("watch-stock.clearStocks", () =>
      clearStocks(refresh, state.alarm),
    ),
    vscode.commands.registerCommand("watch-stock.sortStocks", () =>
      sortStocks(refresh),
    ),
    vscode.commands.registerCommand("watch-stock.priceAlarm", () =>
      state.alarm.manageAlarms(),
    ),
    vscode.commands.registerCommand("watch-stock.manageStock", () =>
      manageStock(state),
    ),
    vscode.commands.registerCommand("watch-stock.toggleVisibility", () => {
      state.userForced = getIsVisible(state) ? false : true;
      if (state.userForced) {
        refresh();
      } else {
        state.statusBar.setHidden();
      }
    }),
    vscode.commands.registerCommand("watch-stock.refreshData", async () => {
      await updateDataAndCheckAlarms(state);
      sendMsg("股票行情数据刷新完成");
    }),
    vscode.commands.registerCommand("watch-stock.viewHome", async () => {
      const stocks = config.getStocks();
      if (stocks.length === 0) {
        sendMsg("请先添加股票", { type: "warning" });
        return;
      }
      await StockHomePanel.show();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("watch-stock")) refresh();
    }),
  ];

  context.subscriptions.push(...subs);

  startRefreshTimer(state);

  return (): void => {
    stopRefreshTimer(state);
    state.statusBar.dispose();
  };
}

// 管理股票主菜单
async function manageStock(state: AppState): Promise<void> {
  const stocks = config.getStocks();
  const visible = getIsVisible(state);

  type Action =
    | "add"
    | "home"
    | "remove"
    | "sort"
    | "clear"
    | "alarm"
    | "toggle"
    | "refresh";

  interface Item extends vscode.QuickPickItem {
    action: Action;
  }

  const options: Item[] = [
    {
      label: "$(add) 添加股票",
      description: "输入股票代码或名称添加",
      action: "add",
    },
  ];

  if (stocks.length > 0) {
    options.push(
      {
        label: "$(list-flat) 查看股票",
        description: "查看股票详细数据",
        action: "home",
      },
      {
        label: "$(remove) 移除股票",
        description: "从已添加的股票中选择移除",
        action: "remove",
      },
      {
        label: "$(arrow-swap) 排序股票",
        description: "调整股票的显示顺序",
        action: "sort",
      },
      {
        label: "$(trash) 清空股票",
        description: "清空所有已添加的股票",
        action: "clear",
      },
      {
        label: "$(bell) 价格闹钟",
        description: "股票价格达到目标时提醒",
        action: "alarm",
      },
    );
  }

  options.push(
    {
      label: visible ? "$(eye-closed) 隐藏状态栏" : "$(eye) 显示状态栏",
      description: visible ? "隐藏状态栏股票信息显示" : "显示状态栏股票信息",
      action: "toggle",
    },
    {
      label: "$(refresh) 刷新行情数据",
      description: "手动刷新股票行情数据",
      action: "refresh",
    },
  );

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: stocks.length > 0 ? "选择操作" : "还没有添加股票，请选择操作",
  });
  if (!selected) return;

  const map: Record<Action, string> = {
    add: "watch-stock.addStock",
    home: "watch-stock.viewHome",
    remove: "watch-stock.removeStock",
    sort: "watch-stock.sortStocks",
    clear: "watch-stock.clearStocks",
    alarm: "watch-stock.priceAlarm",
    toggle: "watch-stock.toggleVisibility",
    refresh: "watch-stock.refreshData",
  };
  await vscode.commands.executeCommand(map[selected.action]);
}
