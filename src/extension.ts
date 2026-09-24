// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { startRefreshTimer, stopRefreshTimer } from "./refresher";
import { StatusBarManager } from "./ui/statusBar";
import { StockHomePanel } from "./ui/stockHome";
import { disposeRateLimit } from "./utils/msg";
import type { AppState } from "./types";

// 应用状态
let appState: AppState | null = null;

export function activate(context: vscode.ExtensionContext): void {
  appState = {
    statusBar: new StatusBarManager(),
    userForced: null,
    refreshTimer: null,
  };
  appState.statusBar.initialize();
  registerCommands(context, appState);
  startRefreshTimer(appState);
}

export function deactivate(): void {
  // 状态栏已注册到 context.subscriptions，由 VS Code 统一释放
  if (appState) stopRefreshTimer(appState);
  StockHomePanel.current?.dispose();
  disposeRateLimit();
  appState = null;
}
