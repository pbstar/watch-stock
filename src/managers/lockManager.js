/**
 * 封单监控模块
 * 处理涨跌停封单计算、异动检测和通知
 */

const { sendMsg } = require("../utils/sendMsg");
const { getLimitPercent, formatAmount } = require("../utils/stockUtils");

const lockTipCache = new Map();
const MIN_LOCK = 7000000; // 七百万

function calculateLockInfo(stock) {
  if (
    (stock.buy1Price === 0 && stock.sell1Price === 0) ||
    (stock.buy1Volume === 0 && stock.sell1Volume === 0)
  ) {
    return { priceType: "err", lockAmount: 0 };
  }
  const limit = getLimitPercent(stock.code, stock.name);
  const changePercent = parseFloat(stock.changePercent);
  const isLimitUp = changePercent >= limit - 0.1 && stock.sell1Volume === 0;
  const isLimitDown = changePercent <= -(limit - 0.1) && stock.buy1Volume === 0;
  const volume = isLimitUp ? stock.buy1Volume || 0 : stock.sell1Volume || 0;
  const price = isLimitUp ? stock.buy1Price || 0 : stock.sell1Price || 0;
  const lockAmount = volume * 100 * price;
  const priceType = isLimitUp ? "up" : isLimitDown ? "down" : "none";
  return { priceType, lockAmount };
}

function checkLockTip(stockInfos) {
  for (const stock of stockInfos) {
    if (!stock || stock.priceType === "err") continue;
    const prev = lockTipCache.get(stock.code);
    if (prev) {
      const message = getLockChangeMessage(prev, stock);
      if (!message) continue;
      sendMsg(message, { rateLimit: true });
    }
    lockTipCache.set(stock.code, {
      priceType: stock.priceType,
      lockAmount: stock.lockAmount,
    });
  }
}

function getLockChangeMessage(prev, stock) {
  // 上次未涨停未跌停，当前涨停或跌停
  if (
    prev.priceType === "none" &&
    (stock.priceType === "up" || stock.priceType === "down")
  ) {
    return `🔒 ${stock.name} ${stock.priceType === "up" ? "涨停" : "跌停"} 封单${formatAmount(stock.lockAmount)}`;
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
  //上次涨停当前涨停或上次跌停当前跌停
  if (
    (prev.priceType === "up" && stock.priceType === "up") ||
    (prev.priceType === "down" && stock.priceType === "down")
  ) {
    const delta = stock.lockAmount - prev.lockAmount;
    const deltaChange = Math.round((Math.abs(delta) / prev.lockAmount) * 100);
    if (Math.abs(delta) > MIN_LOCK && Math.abs(deltaChange) > 7) {
      // 封单增加
      if (delta > 0)
        return `🔒 ${stock.name} 封单增加${formatAmount(Math.abs(delta))}`;
      // 封单减少
      return `⚠️ ${stock.name} 封单减少${formatAmount(Math.abs(delta))} ${stock.priceType === "up" ? "注意开板风险" : "抛压有所缓解"}`;
    }
  }
  return "";
}

module.exports = { calculateLockInfo, checkLockTip };
