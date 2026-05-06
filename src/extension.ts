// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { createAppState, type AppState } from "./appState";
import { registerCommands } from "./commands";
import { startRefreshTimer, stopRefreshTimer } from "./refresher";

// 应用状态
let appState: AppState | null = null;

export function activate(context: vscode.ExtensionContext): void {
  appState = createAppState();
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
