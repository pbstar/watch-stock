// 全局类型定义
import type { StatusBarManager } from "./ui/statusBar";
import type { StockViewProvider } from "./ui/stockView";

export type PriceType = "up" | "down" | "none" | "err";

// 应用状态
export interface AppState {
  statusBar: StatusBarManager;
  stockView: StockViewProvider;
  userForced: boolean | null; // null=跟随市场 true=强制显示 false=强制隐藏
  refreshTimer: NodeJS.Timeout | null;
}

export type AlarmCondition = "above" | "below";

// 状态栏列表/闹钟检查/封单计算共用的轻量行情结构
export interface Stock {
  name: string;
  code: string;
  current: string;
  changeValue: string;
  changePercent: string;
  amount: number;
  isETF: boolean;
  dateTime: string;
  close?: number;
  buy1Volume?: number;
  sell1Volume?: number;
  buy1Price?: number;
  sell1Price?: number;
  // 以下 calculateLockInfo 后注入
  priceType?: PriceType;
  lockAmount?: number;
}

// 股票面板展开详情的完整行情（腾讯源）
export interface StockQuote {
  name: string;
  code: string;
  current: string;
  close: string;
  open: string;
  volume: number;
  changeValue: string;
  changePercent: string;
  high: string;
  low: string;
  amount: number;
  turnoverRatio: string;
  pe: number;
  circulationMarket: number;
  totalMarket: number;
  pb: number;
  volumeRatio: string;
  isETF: boolean;
  dateTime: string;
}

// 分时数据点定义在消息协议中，两端共用
export type { MinutePoint } from "./shared/protocol";

export interface Alarm {
  id: string;
  stockCode: string;
  targetPrice: number;
  condition: AlarmCondition;
}

export interface LockInfo {
  priceType: PriceType;
  lockAmount: number;
}

// 行业板块配置项
export interface IndustryConfig {
  code: string;
  name: string;
}

// sendMsg 选项
export interface SendMsgOptions {
  type?: "info" | "warning" | "error"; // 消息类型
}
