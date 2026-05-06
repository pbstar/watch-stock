// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { StatusBarManager } from "./ui/statusBar";
import { registerCommands, type AppState } from "./commands";
import { startRefreshTimer, stopRefreshTimer } from "./refresher";

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
  appState = null;
}
