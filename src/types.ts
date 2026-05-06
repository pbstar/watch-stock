// 全局类型定义

export type PriceType = "up" | "down" | "none" | "err";

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

// 详情面板的完整行情（腾讯源）
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
  avgPrice: string;
  circulatingShares: number;
  totalShares: number;
  isETF: boolean;
  dateTime: string;
}

// 详情面板上半部分的概览数据
export interface StockOverview {
  name: string;
  code: string;
  current: string;
  changeValue: string;
  changePercent: string;
  preClose: string;
  isETF: boolean;
  dateTime: string;
}

// 分时数据点（无数据时各字段为 null）
export interface MinutePoint {
  time: string;
  price: number | null;
  volume: number | null;
  amount: number | null;
}

export interface Alarm {
  id: string;
  stockCode: string;
  targetPrice: number;
  condition: AlarmCondition;
  createdAt: string;
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
  rateLimit?: boolean;
  type?: "info" | "warning" | "error";
  showConfirm?: boolean;
}
