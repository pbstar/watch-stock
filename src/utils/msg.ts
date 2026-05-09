// 统一消息发送，支持限流与时间戳合并
import * as vscode from "vscode";
import type { SendMsgOptions } from "../types";

// 限流冷却时间：60秒内同类型消息合并
const RATE_LIMIT_COOLDOWN = 60000;

// 全局限流状态
let lastNotifyTime = 0;
let pendingMessages: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

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
  type: NonNullable<SendMsgOptions["type"]> = "info",
  buttons: string[] = [],
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

// 发送缓存消息
function sendPendingMessages(): void {
  const finalText = pendingMessages.join(" ---- ");
  pendingMessages = [];
  lastNotifyTime = Date.now();
  showVscodeMessage(finalText);
}

// 发送统一消息
export function sendMsg(text: string, options: SendMsgOptions = {}): void {
  const { rateLimit = false, type = "info", showConfirm = false } = options;
  const newText = `[${formatTime()}] ${text}`;

  if (!rateLimit) {
    showVscodeMessage(newText, type, showConfirm ? ["知道了"] : []);
    return;
  }

  // 放入消息队列
  pendingMessages.push(newText);

  // 检查是否可以发送
  const now = Date.now();
  const canNotify = now - lastNotifyTime >= RATE_LIMIT_COOLDOWN;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (canNotify) {
    sendPendingMessages();
  } else {
    flushTimer = setTimeout(() => {
      sendPendingMessages();
    }, RATE_LIMIT_COOLDOWN + 30);
  }
}
