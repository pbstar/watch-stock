// 摸鱼看盘 - VS Code 入口
import * as vscode from "vscode";
import { registerCommands } from "./commands";

let cleanup: (() => void) | null = null;

export function activate(context: vscode.ExtensionContext): void {
  cleanup = registerCommands(context);
}

export function deactivate(): void {
  cleanup?.();
  cleanup = null;
}
