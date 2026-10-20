// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { config } from "./config";
import { refreshData, startRefreshTimer, stopRefreshTimer } from "./refresher";
import { clearMarketCache } from "./services/marketApi";
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
  // 视图 when 条件为 watch-stock.show：激活前视图不存在，避免启动时恢复面板直接弹出行情
  void vscode.commands.executeCommand("setContext", "watch-stock.show", true);
  registerCommands(context, state);
  // 手写配置里的非法或大写代码在此规范化一次，之后的增量变更由配置监听处理
  void config.normalizeStocks();
  startRefreshTimer(state);
}

export function deactivate(): void {
  // 状态栏与股票面板已注册到 context.subscriptions，由 VS Code 统一释放
  if (appState) stopRefreshTimer(appState);
  // 停用即释放接口缓存，重新激活时不复用停用前的行情
  clearMarketCache();
  disposeRateLimit();
  appState = null;
}
