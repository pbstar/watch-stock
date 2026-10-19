// 命令注册
import * as vscode from "vscode";
import {
  addStock,
  removeStock,
  clearStocks,
  sortStocks,
} from "./managers/stockManager";
import {
  manageAlarms,
  removeAlarmsByStock,
  clearAllAlarms,
} from "./managers/alarmManager";
import { clearLockTipCache } from "./managers/lockManager";
import { clearLargeTipCache } from "./managers/largeManager";
import { sendMsg } from "./utils/msg";
import { config, getIsVisible, affectsRefresh } from "./config";
import { refreshData, scheduleRefresh } from "./refresher";
import { invalidateQuote, clearMarketCache } from "./services/marketApi";
import type { AppState } from "./types";

// 命令 ID 映射
const COMMAND_MAP: Record<string, string> = {
  add: "watch-stock.addStock",
  home: "watch-stock.view.focus", // VS Code 为视图自动生成的聚焦命令
  remove: "watch-stock.removeStock",
  sort: "watch-stock.sortStocks",
  clear: "watch-stock.clearStocks",
  alarm: "watch-stock.priceAlarm",
  toggle: "watch-stock.toggleVisibility",
  refresh: "watch-stock.refreshData",
  manage: "watch-stock.manageStock",
};

// 注册全部命令
export function registerCommands(
  context: vscode.ExtensionContext,
  appState: AppState,
): void {
  // 增删排序写入 stocks 配置后，统一由 onDidChangeConfiguration 防抖刷新，命令内不再重复刷新
  const subs: vscode.Disposable[] = [
    appState.statusBar,
    vscode.commands.registerCommand(COMMAND_MAP.add, () => addStock()),
    vscode.commands.registerCommand(COMMAND_MAP.remove, async () => {
      const removed = await removeStock();
      if (removed) {
        await removeAlarmsByStock(removed);
        invalidateQuote([removed]);
        clearLockTipCache(removed);
        clearLargeTipCache(removed);
      }
    }),
    vscode.commands.registerCommand(COMMAND_MAP.clear, async () => {
      if (await clearStocks()) {
        await clearAllAlarms();
        clearMarketCache();
        clearLockTipCache();
        clearLargeTipCache();
      }
    }),
    vscode.commands.registerCommand(COMMAND_MAP.sort, () => sortStocks()),
    vscode.commands.registerCommand(COMMAND_MAP.alarm, () => manageAlarms()),
    vscode.commands.registerCommand(COMMAND_MAP.manage, () =>
      manageStock(appState),
    ),
    vscode.commands.registerCommand(COMMAND_MAP.toggle, () => {
      appState.userForced = !getIsVisible(appState);
      // 老板键同时控制股票面板：隐藏时视图 tab 从面板中消失，恢复时回来但不主动聚焦
      void vscode.commands.executeCommand(
        "setContext",
        "watch-stock.show",
        appState.userForced,
      );
      if (appState.userForced) {
        void refreshData(appState);
      } else {
        appState.statusBar.setHidden();
      }
    }),
    vscode.commands.registerCommand(COMMAND_MAP.refresh, async () => {
      // 先穿透接口缓存，等刷新完成再提示，避免数据未回来就报"完成"
      clearMarketCache();
      // 面板当前列表同样在本轮强制刷新，不受各列表到点判断影响
      appState.stockView.forceNextRefresh();
      await refreshData(appState);
      sendMsg("股票行情数据刷新完成");
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      // 规范化回写自身会再触发一次本监听，但那时配置已是规范形态，不会再来一轮
      if (e.affectsConfiguration("watch-stock.stocks")) {
        void config.normalizeStocks();
      }
      if (affectsRefresh(e)) {
        scheduleRefresh(appState);
        appState.stockView.onConfigChanged(e);
      }
    }),
  ];
  context.subscriptions.push(...subs);
}

// 管理菜单项：action 对应 COMMAND_MAP 里的键
interface ManageOption extends vscode.QuickPickItem {
  action: string;
}

// 股票增删改：没有股票时全部不露出（闹钟也依赖股票）
function stockMenuOptions(
  hasStocks: boolean,
  isSortTypeCustom: boolean,
): ManageOption[] {
  if (!hasStocks) return [];
  const options: ManageOption[] = [
    {
      label: "$(remove) 移除股票",
      description: "从已添加的股票中选择移除",
      action: "remove",
    },
  ];
  if (isSortTypeCustom) {
    options.push({
      label: "$(arrow-swap) 排序股票",
      description: "调整股票的显示顺序",
      action: "sort",
    });
  }
  options.push(
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
  return options;
}

// 面板操作：一键隐藏后面板不存在，不提供「打开面板」
function panelMenuOptions(viewAvailable: boolean): ManageOption[] {
  if (!viewAvailable) return [];
  return [
    {
      label: "$(list-flat) 打开面板",
      description: "在底部面板查看行情、指数与板块",
      action: "home",
    },
  ];
}

// 显隐与刷新始终可用
function commonMenuOptions(visible: boolean): ManageOption[] {
  return [
    {
      label: visible ? "$(eye-closed) 一键隐藏" : "$(eye) 恢复显示",
      description: visible ? "隐藏状态栏与股票面板" : "恢复状态栏与股票面板",
      action: "toggle",
    },
    {
      label: "$(refresh) 刷新行情数据",
      description: "手动刷新股票行情数据",
      action: "refresh",
    },
  ];
}

// 管理股票主菜单：按「增删改 / 面板 / 显隐与刷新」三段拼装
async function manageStock(state: AppState): Promise<void> {
  const stocks = config.getStocks();
  const options: ManageOption[] = [
    {
      label: "$(add) 添加股票",
      description: "输入股票代码或名称添加",
      action: "add",
    },
    ...stockMenuOptions(
      stocks.length > 0,
      config.getStockSortType() === "custom",
    ),
    ...panelMenuOptions(state.userForced !== false),
    ...commonMenuOptions(getIsVisible(state)),
  ];

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: stocks.length > 0 ? "选择操作" : "还没有添加股票，请选择操作",
  });
  if (!selected) return;

  await vscode.commands.executeCommand(COMMAND_MAP[selected.action]);
}
