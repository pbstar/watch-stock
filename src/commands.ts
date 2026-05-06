// 命令注册
import * as vscode from "vscode";
import { StatusBarManager } from "./ui/statusBar";
import { StockHomePanel } from "./ui/stockHome";
import {
  addStock,
  removeStock,
  clearStocks,
  sortStocks,
} from "./managers/stockManager";
import { manageAlarms } from "./managers/alarmManager";
import { sendMsg } from "./utils/msg";
import { config } from "./config";
import { getIsVisible, refreshData } from "./refresher";

export interface AppState {
  statusBar: StatusBarManager;
  userForced: boolean | null; // null=跟随市场 true=强制显示 false=强制隐藏
  refreshTimer: NodeJS.Timeout | null;
}

// 命令 ID 映射
const COMMAND_MAP: Record<string, string> = {
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

// 注册全部命令
export function registerCommands(
  context: vscode.ExtensionContext,
  appState: AppState,
): void {
  const refresh = (): void => {
    void refreshData(appState);
  };

  const subs: vscode.Disposable[] = [
    appState.statusBar.getStatusBarItem()!,
    vscode.commands.registerCommand(COMMAND_MAP.add, () => addStock(refresh)),
    vscode.commands.registerCommand(COMMAND_MAP.remove, () =>
      removeStock(refresh),
    ),
    vscode.commands.registerCommand(COMMAND_MAP.clear, () =>
      clearStocks(refresh),
    ),
    vscode.commands.registerCommand(COMMAND_MAP.sort, () =>
      sortStocks(refresh),
    ),
    vscode.commands.registerCommand(COMMAND_MAP.alarm, () => manageAlarms()),
    vscode.commands.registerCommand(COMMAND_MAP.manage, () =>
      manageStock(appState),
    ),
    vscode.commands.registerCommand(COMMAND_MAP.toggle, () => {
      appState.userForced = !getIsVisible(appState);
      if (appState.userForced) {
        refresh();
      } else {
        appState.statusBar.setHidden();
      }
    }),
    vscode.commands.registerCommand(COMMAND_MAP.refresh, () => {
      refresh();
      sendMsg("股票行情数据刷新完成");
    }),
    vscode.commands.registerCommand(COMMAND_MAP.home, async () => {
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

  await vscode.commands.executeCommand(COMMAND_MAP[selected.action]);
}
