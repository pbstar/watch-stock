// 涨跌停封单计算与异动通知
import { sendMsg } from "../utils/msg";
import { getLimitPercent, formatAmount } from "../utils/stock";
import type { Stock, LockInfo, PriceType } from "../types";

interface LockSnapshot {
  priceType: PriceType;
  lockAmount: number;
}

const lockTipCache = new Map<string, LockSnapshot>();
const MIN_LOCK_CHANGE = 7000000; // 封单变化通知阈值：700万
const LOCK_CHANGE_PERCENT = 7; // 封单变化百分比通知阈值：7%

// 根据五档计算封单价/封单量/类型
export function calculateLockInfo(stock: Stock): LockInfo {
  const buy1Price = stock.buy1Price ?? 0;
  const sell1Price = stock.sell1Price ?? 0;
  const buy1Volume = stock.buy1Volume ?? 0;
  const sell1Volume = stock.sell1Volume ?? 0;

  if (buy1Price === sell1Price || (buy1Volume === 0 && sell1Volume === 0)) {
    return { priceType: "err", lockAmount: 0 };
  }

  const limit = getLimitPercent(stock.code, stock.name);
  const changePercent = parseFloat(stock.changePercent);
  const isLimitUp =
    changePercent >= limit - 0.1 && sell1Volume === 0 && sell1Price === 0;
  const isLimitDown =
    changePercent <= -(limit - 0.1) && buy1Volume === 0 && buy1Price === 0;
  // 非涨跌停
  if (!isLimitUp && !isLimitDown) {
    return { priceType: "none", lockAmount: 0 };
  }
  const volume = isLimitUp ? buy1Volume : sell1Volume;
  const price = isLimitUp ? buy1Price : sell1Price;
  const lockAmount = volume * 100 * price;
  const priceType: PriceType = isLimitUp ? "up" : "down";
  return { priceType, lockAmount };
}

// 根据封单变化生成通知文案
function getLockChangeMessage(prev: LockSnapshot, stock: Stock): string {
  const curType = stock.priceType ?? "none";
  const curAmount = stock.lockAmount ?? 0;
  const prevType = prev.priceType ?? "none";
  const prevAmount = prev.lockAmount ?? 0;

  // 新涨停/跌停
  if (prevType === "none" && (curType === "up" || curType === "down")) {
    return `🔒 ${stock.name} ${curType === "up" ? "涨停" : "跌停"} 封单${formatAmount(curAmount)}`;
  }

  // 涨停开板
  if (prevType === "up" && curType !== "up") {
    return `🔓 ${stock.name} 涨停已开板`;
  }

  // 跌停开板
  if (prevType === "down" && curType !== "down") {
    return `🔓 ${stock.name} 跌停已开板`;
  }

  // 同向延续，封单变化超阈值
  if (prevType === curType && (curType === "up" || curType === "down")) {
    const delta = curAmount - prevAmount;
    const absDelta = Math.abs(delta);
    const deltaChange = Math.round((absDelta / prevAmount) * 100);
    if (absDelta > MIN_LOCK_CHANGE && deltaChange > LOCK_CHANGE_PERCENT) {
      if (delta > 0) {
        return `🔒 ${stock.name} 封单增加${formatAmount(absDelta)}`;
      }
      return `⚠️ ${stock.name} 封单减少${formatAmount(absDelta)} ${curType === "up" ? "注意开板风险" : "抛压有所缓解"}`;
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
