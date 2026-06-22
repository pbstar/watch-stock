// 大单异动监控：基于最近多次刷新的成交额变化
import { sendRateLimitMsg } from "../utils/msg";
import { formatAmount } from "../utils/stock";
import type { Stock, PriceType } from "../types";

// 单次行情快照，仅保留大单分析所需字段
interface LargeSnapshot {
  amount: number; // 累计成交额
  current: number; // 当前价
  timestamp: number; // 行情时间戳（秒）
  priceType: PriceType; // 价格类型
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
const MIN_LARGE_AMOUNT = 1000000; // 区间成交额绝对阈值：100万

// 根据快照历史生成大单异动通知文案
function getLargeChangeMessage(history: LargeSnapshot[], stock: Stock): string {
  if (history.length < HISTORY_SIZE) return "";
  // 处理时间异常
  if (
    history[6].timestamp - history[0].timestamp > 35 ||
    history[6].timestamp - history[0].timestamp < 25
  )
    return "";
  const lastAmount = history[6].amount - history[5].amount;

  // 未达到绝对金额门槛则不视为大单
  if (lastAmount < MIN_LARGE_AMOUNT * 2) return "";

  // 计算前5次成交额之和
  const sumAmount = history[5].amount - history[0].amount;
  // 计算前5次成交额平均值
  const avgAmount = sumAmount / 5;
  // 均量差值
  const deltaAmount = lastAmount - avgAmount;
  // 放量倍率
  const ratio = Number((deltaAmount / avgAmount).toFixed(2));
  // 价格变化方向：最近一次间隔内的涨跌判断买卖意图
  const priceDiff = Number(
    (history[6].current - history[5].current).toFixed(3),
  );

  // 排除缩量/放量<2倍/价格无变化
  if (deltaAmount < MIN_LARGE_AMOUNT || ratio < 2 || priceDiff === 0) return "";

  const emoji = priceDiff > 0 ? "💰" : "💸";
  const direction = priceDiff > 0 ? "买入" : "卖出";
  const size = ratio > 5 && deltaAmount > MIN_LARGE_AMOUNT * 5 ? "超大" : "大";
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
      priceType: stock.priceType,
    });
    if (history.length > HISTORY_SIZE) history.shift();
    largeTipCache.set(stock.code, history);
    if (history.length < HISTORY_SIZE) continue;
    const message = getLargeChangeMessage(history, stock);
    if (message) sendRateLimitMsg(message);
  }
}
