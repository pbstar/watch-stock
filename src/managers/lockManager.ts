// 涨跌停封单计算与异动通知
import { sendMsg } from "../utils/msg";
import { getLimitPercent, formatAmount } from "../utils/stock";
import type { Stock, LockInfo, PriceType } from "../types";

interface LockSnapshot {
  priceType: PriceType;
  lockAmount: number;
}

const lockTipCache = new Map<string, LockSnapshot>();
const MIN_LOCK = 7000000; // 七百万

// 根据五档计算封单价/封单量/类型
export function calculateLockInfo(stock: Stock): LockInfo {
  const buy1Price = stock.buy1Price ?? 0;
  const sell1Price = stock.sell1Price ?? 0;
  const buy1Volume = stock.buy1Volume ?? 0;
  const sell1Volume = stock.sell1Volume ?? 0;

  if (
    (buy1Price === 0 && sell1Price === 0) ||
    (buy1Volume === 0 && sell1Volume === 0)
  ) {
    return { priceType: "err", lockAmount: 0 };
  }
  const limit = getLimitPercent(stock.code, stock.name);
  const changePercent = parseFloat(stock.changePercent);
  const isLimitUp = changePercent >= limit - 0.1 && sell1Volume === 0;
  const isLimitDown = changePercent <= -(limit - 0.1) && buy1Volume === 0;
  const volume = isLimitUp ? buy1Volume : sell1Volume;
  const price = isLimitUp ? buy1Price : sell1Price;
  const lockAmount = volume * 100 * price;
  const priceType: PriceType = isLimitUp ? "up" : isLimitDown ? "down" : "none";
  return { priceType, lockAmount };
}

// 根据封单变化生成通知文案
function getLockChangeMessage(prev: LockSnapshot, stock: Stock): string {
  // 上次未涨/跌停，当前已涨/跌停
  if (
    prev.priceType === "none" &&
    (stock.priceType === "up" || stock.priceType === "down")
  ) {
    return `🔒 ${stock.name} ${stock.priceType === "up" ? "涨停" : "跌停"} 封单${formatAmount(stock.lockAmount ?? 0)}`;
  }
  // 上次涨停当前未涨停
  if (
    prev.priceType === "up" &&
    (stock.priceType === "none" || stock.priceType === "down")
  ) {
    return `🔓 ${stock.name} 涨停已开板`;
  }
  // 上次跌停当前未跌停
  if (
    prev.priceType === "down" &&
    (stock.priceType === "none" || stock.priceType === "up")
  ) {
    return `🔓 ${stock.name} 跌停已开板`;
  }
  // 同向延续，封单变化超阈值
  if (
    (prev.priceType === "up" && stock.priceType === "up") ||
    (prev.priceType === "down" && stock.priceType === "down")
  ) {
    const cur = stock.lockAmount ?? 0;
    const delta = cur - prev.lockAmount;
    const deltaChange = Math.round((Math.abs(delta) / prev.lockAmount) * 100);
    if (Math.abs(delta) > MIN_LOCK && Math.abs(deltaChange) > 7) {
      if (delta > 0)
        return `🔒 ${stock.name} 封单增加${formatAmount(Math.abs(delta))}`;
      return `⚠️ ${stock.name} 封单减少${formatAmount(Math.abs(delta))} ${stock.priceType === "up" ? "注意开板风险" : "抛压有所缓解"}`;
    }
  }
  return "";
}

// 检查并通知异动
export function checkLockTip(stockInfos: Stock[]): void {
  for (const stock of stockInfos) {
    if (!stock || stock.priceType === "err") continue;
    const prev = lockTipCache.get(stock.code);
    if (prev) {
      const message = getLockChangeMessage(prev, stock);
      if (message) sendMsg(message, { rateLimit: true });
    }
    lockTipCache.set(stock.code, {
      priceType: stock.priceType ?? "none",
      lockAmount: stock.lockAmount ?? 0,
    });
  }
}
