// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { refreshData, startRefreshTimer, stopRefreshTimer } from "./refresher";
import { StatusBarManager } from "./ui/statusBar";
import { StockViewProvider } from "./ui/stockView";
import { disposeRateLimit } from "./utils/msg";
import type { AppState } from "./types";

// 应用状态
let appState: AppState | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const state: AppState = {
    statusBar: new StatusBarManager(),
    stockView: new StockViewProvider(context.extensionUri, () =>
      refreshData(state),
    ),
    userForced: null,
    refreshTimer: null,
  };
  appState = state;
  state.statusBar.initialize();
  context.subscriptions.push(
    state.stockView,
    vscode.window.registerWebviewViewProvider(
      StockViewProvider.viewId,
      state.stockView,
    ),
  );
  // 视图 when 条件为 watchStock.show：激活前视图不存在，避免启动时恢复面板直接弹出行情
  void vscode.commands.executeCommand("setContext", "watchStock.show", true);
  registerCommands(context, state);
  startRefreshTimer(state);
}

export function deactivate(): void {
  // 状态栏与股票面板已注册到 context.subscriptions，由 VS Code 统一释放
  if (appState) stopRefreshTimer(appState);
  disposeRateLimit();
  appState = null;
}
