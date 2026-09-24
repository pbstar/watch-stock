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
        clearLockTipCache(removed);
        clearLargeTipCache(removed);
      }
    }),
    vscode.commands.registerCommand(COMMAND_MAP.clear, async () => {
      if (await clearStocks()) {
        await clearAllAlarms();
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
      // 等刷新完成再提示，避免数据未回来就报"完成"
      await refreshData(appState);
      sendMsg("股票行情数据刷新完成");
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (affectsRefresh(e)) scheduleRefresh(appState);
    }),
  ];
  context.subscriptions.push(...subs);
}

// 管理股票主菜单
async function manageStock(state: AppState): Promise<void> {
  const stocks = config.getStocks();
  const isSortTypeCustom = config.getStockSortType() === "custom";
  const visible = getIsVisible(state);
  // 一键隐藏后股票面板不存在，不提供「查看股票」
  const viewAvailable = state.userForced !== false;
  const options = [
    {
      label: "$(add) 添加股票",
      description: "输入股票代码或名称添加",
      action: "add",
    },
  ];

  if (stocks.length > 0) {
    options.push(
      ...(viewAvailable
        ? [
            {
              label: "$(list-flat) 查看股票",
              description: "在底部面板查看行情、指数与板块",
              action: "home",
            },
          ]
        : []),
      {
        label: "$(remove) 移除股票",
        description: "从已添加的股票中选择移除",
        action: "remove",
      },
      ...(isSortTypeCustom
        ? [
            {
              label: "$(arrow-swap) 排序股票",
              description: "调整股票的显示顺序",
              action: "sort",
            },
          ]
        : []),
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
      label: visible ? "$(eye-closed) 一键隐藏" : "$(eye) 恢复显示",
      description: visible
        ? "隐藏状态栏与股票面板"
        : "恢复状态栏股票信息",
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

  await vscode.commands.executeCommand(COMMAND_MAP[selected.action]);
}
