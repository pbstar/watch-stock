// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { registerCommands, disposeCommands, type AppState } from "./commands";

// 应用状态，由 registerCommands 创建并返回
let appState: AppState | null = null;

export function activate(context: vscode.ExtensionContext): void {
  appState = registerCommands(context);
}

export function deactivate(): void {
  if (appState) disposeCommands(appState);
  appState = null;
}
