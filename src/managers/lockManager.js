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
    const data = {
      priceType: stock.priceType,
      lockAmount: stock.lockAmount,
    };
    if (prev) {
      const message = getLockChangeMessage(prev, stock);
      if (!message) continue;
      sendMsg(message, { rateLimit: true });
    }
    lockTipCache.set(stock.code, data);
  }
}

function getLockChangeMessage(prev, curr) {
  // 上次未涨停未跌停，当前涨停或跌停
  if (prev.priceType === "none" && curr.priceType !== "none") {
    return `🔒 ${curr.name} ${curr.priceType === "up" ? "涨停" : "跌停"} 封单${formatAmount(curr.lockAmount)}`;
  }
  // 上次涨停当前未涨停或上次跌停当前未跌停
  if (
    (prev.priceType === "up" && curr.priceType !== "up") ||
    (prev.priceType === "down" && curr.priceType !== "down")
  ) {
    return `🔓 ${curr.name} ${prev.priceType === "up" ? "涨停" : "跌停"}已开板`;
  }
  //上次涨停当前涨停或上次跌停当前跌停
  if (
    (prev.priceType === "up" && curr.priceType === "up") ||
    (prev.priceType === "down" && curr.priceType === "down")
  ) {
    const delta = curr.lockAmount - prev.lockAmount;
    const deltaChange = Math.round((Math.abs(delta) / prev.lockAmount) * 100);
    if (Math.abs(delta) < MIN_LOCK || Math.abs(deltaChange) < 7) {
      return "";
    }
    // 封单增加
    if (delta > 0)
      return `🔒 ${curr.name} 封单增加${formatAmount(Math.abs(delta))}`;
    // 封单减少
    return `⚠️ ${curr.name} 封单减少${formatAmount(Math.abs(delta))} ${curr.priceType === "up" ? "注意开板风险" : "抛压有所缓解"}`;
  }
  return "";
}

module.exports = { calculateLockInfo, checkLockTip };
