// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { registerCommands, disposeCommands } from "./commands";

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);
}

export function deactivate(): void {
  disposeCommands();
}
