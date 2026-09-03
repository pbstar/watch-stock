// 大单异动监控：基于最近多次刷新的成交额变化
import { sendRateLimitMsg } from "../utils/msg";
import { formatAmount } from "../utils/stock";
import type { Stock } from "../types";

// 单次行情快照，仅保留大单分析所需字段
interface LargeSnapshot {
  amount: number; // 累计成交额
  current: number; // 当前价
  timestamp: number; // 行情时间戳（秒）
}

// 将行情时间字符串解析为时间戳，无效时返回0
function toTimestamp(text: string): number {
  if (!text) return 0;
  const t = new Date(text).getTime();
  return isNaN(t) ? 0 : Math.floor(t / 1000);
}

// 保留最近 N 次行情快照，用于对比近期均值识别异动
const HISTORY_SIZE = 7;
const largeTipCache = new Map<string, LargeSnapshot[]>();
const BASE_AMOUNT = 1000000; // 区间成交额绝对阈值：100万
const LARGE_RATIO = 2; // 放量倍数
const PRICE_MOVE_RATIO = 0.001; // 价格干扰

// 根据快照历史生成大单异动通知文案
function getLargeChangeMessage(history: LargeSnapshot[], stock: Stock): string {
  if (history.length < HISTORY_SIZE) return "";
  const first = history[0];
  const prev = history[HISTORY_SIZE - 2];
  const cur = history[HISTORY_SIZE - 1];
  // 处理时间异常
  const span = cur.timestamp - first.timestamp;
  if (span > 35 || span < 25) return "";
  // 最后一段金额
  const lastAmount = cur.amount - prev.amount;
  // 未达到绝对金额门槛则不视为大单
  if (lastAmount < BASE_AMOUNT * LARGE_RATIO) return "";
  // 成交额均值
  const avgAmount = (prev.amount - first.amount) / (HISTORY_SIZE - 2);
  // 异动增量
  const deltaAmount = lastAmount - avgAmount;
  const deltaFloor = Math.max(BASE_AMOUNT, avgAmount);
  // 增量小于门槛/均值不视为大单
  if (deltaAmount < deltaFloor) return "";
  // 放量倍率（用于超大单分级）
  const ratio = Number((lastAmount / avgAmount).toFixed(2));
  // 价格变化方向：最近一次间隔内的涨跌判断买卖意图
  const priceDiff = Number((cur.current - prev.current).toFixed(3));
  // 价格推动不显著（tick 级波动不算买卖意图）
  if (Math.abs(priceDiff) < prev.current * PRICE_MOVE_RATIO) return "";

  const emoji = priceDiff > 0 ? "💰" : "💸";
  const direction = priceDiff > 0 ? "买入" : "卖出";
  // 超大单条件
  const sb1 = ratio > 5 && deltaAmount > BASE_AMOUNT * 7;
  const sb2 = ratio > 9 && deltaAmount > BASE_AMOUNT * 3;
  const size = sb1 || sb2 ? "超大" : "大";
  return `${emoji} ${stock.name} ${size}单${direction}${formatAmount(deltaAmount)}`;
}

// 清除指定股票的大单缓存，不传 code 则清空全部
export function clearLargeTipCache(code?: string): void {
  if (code) {
    largeTipCache.delete(code);
  } else {
    largeTipCache.clear();
  }
}

// 检查并通知大单异动
export function checkLargeTip(stockInfos: Stock[]): void {
  for (const stock of stockInfos) {
    if (!stock || stock.priceType !== "none" || stock.amount <= 0) continue;
    const current = parseFloat(stock.current);
    if (isNaN(current) || current <= 0) continue;
    const timestamp = toTimestamp(stock.dateTime);
    if (timestamp === 0) continue;
    const history = largeTipCache.get(stock.code) ?? [];
    history.push({
      amount: stock.amount,
      current,
      timestamp,
    });
    if (history.length > HISTORY_SIZE) history.shift();
    largeTipCache.set(stock.code, history);
    if (history.length < HISTORY_SIZE) continue;
    const message = getLargeChangeMessage(history, stock);
    if (message) sendRateLimitMsg(message);
  }
}
