// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { startRefreshTimer, stopRefreshTimer } from "./refresher";
import { StatusBarManager } from "./ui/statusBar";
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
  if (appState) {
    stopRefreshTimer(appState);
    appState.statusBar.dispose();
  }
  disposeRateLimit();
  appState = null;
}
