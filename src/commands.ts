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
  userForced: boolean | null; // null=自动 true=用户强制显示 false=用户强制隐藏
  refreshTimer: NodeJS.Timeout | null;
}

// 全局状态
let appState: AppState | null = null;
const cMap: Record<string, string> = {
  add: "watch-stock.addStock",
  home: "watch-stock.viewHome",
  remove: "watch-stock.removeStock",
  sort: "watch-stock.sortStocks",
  clear: "watch-stock.clearStocks",
  alarm: "watch-stock.priceAlarm",
  toggle: "watch-stock.toggleVisibility",
  refresh: "watch-stock.refreshData",
  manage: "watch-stock.manageStock",
};

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

// 注册全部命令
export function registerCommands(context: vscode.ExtensionContext): void {
  appState = {
    statusBar: new StatusBarManager(),
    alarm: new AlarmManager(),
    userForced: null,
    refreshTimer: null,
  };

  appState.statusBar.initialize();

  const refresh = (): void => {
    void updateDataAndCheckAlarms(appState!);
  };

  const subs: vscode.Disposable[] = [
    appState.statusBar.getStatusBarItem()!,
    vscode.commands.registerCommand(cMap.add, () => addStock(refresh)),
    vscode.commands.registerCommand(cMap.remove, () =>
      removeStock(refresh, appState!.alarm),
    ),
    vscode.commands.registerCommand(cMap.clear, () =>
      clearStocks(refresh, appState!.alarm),
    ),
    vscode.commands.registerCommand(cMap.sort, () => sortStocks(refresh)),
    vscode.commands.registerCommand(cMap.alarm, () =>
      appState!.alarm.manageAlarms(),
    ),
    vscode.commands.registerCommand(cMap.manage, () => manageStock(appState!)),
    vscode.commands.registerCommand(cMap.toggle, () => {
      appState!.userForced = getIsVisible(appState!) ? false : true;
      if (appState!.userForced) {
        refresh();
      } else {
        appState!.statusBar.setHidden();
      }
    }),
    vscode.commands.registerCommand(cMap.refresh, () => {
      refresh();
      sendMsg("股票行情数据刷新完成");
    }),
    vscode.commands.registerCommand(cMap.home, async () => {
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
  if (appState.refreshTimer) clearInterval(appState.refreshTimer);
  void updateDataAndCheckAlarms(appState);
  appState.refreshTimer = setInterval(() => {
    if (!appState) return;
    if (isTradingTime()) {
      void updateDataAndCheckAlarms(appState);
    } else if (config.getAutoHideByMarket() && appState.userForced === null) {
      appState.statusBar.setHidden();
    }
  }, REFRESH_INTERVAL);
}

// 销毁命令及相关资源
export function disposeCommands(): void {
  if (appState) {
    if (appState.refreshTimer) {
      clearInterval(appState.refreshTimer);
      appState.refreshTimer = null;
    }
    appState.statusBar.dispose();
    appState = null;
  }
}

// 管理股票主菜单
async function manageStock(state: AppState): Promise<void> {
  const stocks = config.getStocks();
  const visible = getIsVisible(state);
  const options = [
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

  await vscode.commands.executeCommand(cMap[selected.action]);
}
