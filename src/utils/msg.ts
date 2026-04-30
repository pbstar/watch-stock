// 统一消息发送，支持限流与时间戳合并
import * as vscode from "vscode";
import type { SendMsgOptions } from "../types";

const COOLDOWN = 60000;

// 全局限流状态
let lastNotifyTime = 0;
let pendingMessages: string[] = [];

// 格式化当前时间 HH:MM:SS
function formatTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// 调用 vscode 消息 API
function showVscodeMessage(
  msg: string,
  type: NonNullable<SendMsgOptions["type"]>,
  buttons: string[],
): void {
  switch (type) {
    case "warning":
      vscode.window.showWarningMessage(msg, ...buttons);
      break;
    case "error":
      vscode.window.showErrorMessage(msg, ...buttons);
      break;
    default:
      vscode.window.showInformationMessage(msg, ...buttons);
      break;
  }
}

// 发送统一消息
export function sendMsg(text: string, options: SendMsgOptions = {}): void {
  const { rateLimit = false, type = "info", showConfirm = false } = options;
  const buttons = showConfirm ? ["知道了"] : [];

  if (!rateLimit) {
    showVscodeMessage(text, type, buttons);
    return;
  }

  const now = Date.now();
  const canNotify = now - lastNotifyTime >= COOLDOWN;

  if (canNotify) {
    // 可以发送，带上之前被缓存的消息
    let finalText = text;
    if (pendingMessages.length > 0) {
      finalText = `${pendingMessages.join(" --- ")} --- [${formatTime()}] ${text}`;
      pendingMessages = [];
    }
    lastNotifyTime = now;
    showVscodeMessage(finalText, type, buttons);
  } else {
    // 被限流，缓存消息等下次一起发
    pendingMessages.push(`[${formatTime()}] ${text}`);
  }
}
