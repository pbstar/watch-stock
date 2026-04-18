/**
 * 封单监控模块
 * 处理涨跌停封单计算、异动检测和通知
 */

const vscode = require("vscode");
const { getEnableLockTip } = require("../configs/vscodeConfig");
const { getLimitPercent, formatAmount } = require("../utils/stockUtils");

const lockTipCache = new Map();

function calculateLockInfo(stock) {
  const limit = getLimitPercent(stock.code, stock.name);
  const changePercent = parseFloat(stock.changePercent);
  const isLimitUp = changePercent >= limit - 0.1 && stock.sell1Volume === 0;
  const isLimitDown = changePercent <= -(limit - 0.1) && stock.buy1Volume === 0;

  let lockCount = 0;
  let lockAmount = 0;
  if (isLimitUp) {
    lockCount = stock.buy1Volume || 0;
    lockAmount = (stock.buy1Volume || 0) * 100 * (stock.buy1Price || 0);
  } else if (isLimitDown) {
    lockCount = stock.sell1Volume || 0;
    lockAmount = (stock.sell1Volume || 0) * 100 * (stock.sell1Price || 0);
  }

  return { isLimitUp, isLimitDown, lockCount, lockAmount };
}

function checkLockTip(stockInfos) {
  if (!getEnableLockTip()) return;

  const now = Date.now();
  const COOLDOWN = 60000;

  for (const stock of stockInfos) {
    const prev = lockTipCache.get(stock.code);
    const curr = {
      isLimitUp: stock.isLimitUp,
      isLimitDown: stock.isLimitDown,
      lockAmount: stock.lockAmount,
    };

    const message = getLockChangeMessage(stock, prev, curr);

    if (message && canNotify(prev, now, COOLDOWN)) {
      vscode.window.showInformationMessage(message);
      curr.lastNotifyTime = now;
    } else if (prev) {
      curr.lastNotifyTime = prev.lastNotifyTime;
    }

    lockTipCache.set(stock.code, curr);
  }
}

function getLockChangeMessage(stock, prev, curr) {
  if (!prev) {
    if (curr.isLimitUp) {
      return `🔒 ${stock.name} 涨停，封单${formatAmount(curr.lockAmount)}`;
    }
    if (curr.isLimitDown) {
      return `🔒 ${stock.name} 跌停，封单${formatAmount(curr.lockAmount)}`;
    }
    return "";
  }

  if (!curr.isLimitUp && !curr.isLimitDown) {
    if (prev.isLimitUp || prev.isLimitDown) {
      return `🔓 ${stock.name} 已开板`;
    }
    return "";
  }

  const MIN_LOCK = 5000000;
  const delta = curr.lockAmount - prev.lockAmount;

  if (curr.isLimitUp && Math.abs(delta) >= MIN_LOCK) {
    if (delta < 0 && prev.lockAmount > 0 && -delta / prev.lockAmount >= 0.1) {
      return `⚠️ ${stock.name} 封单减少${Math.round((-delta / prev.lockAmount) * 100)}%，注意开板风险`;
    }
    if (delta > 0 && delta / prev.lockAmount >= 0.2) {
      return `🔒 ${stock.name} 封单增加${Math.round((delta / prev.lockAmount) * 100)}%`;
    }
  }

  if (curr.isLimitDown && Math.abs(delta) >= MIN_LOCK) {
    if (delta > 0 && delta / prev.lockAmount >= 0.2) {
      return `🔒 ${stock.name} 封单增加${Math.round((delta / prev.lockAmount) * 100)}%，跌停封单持续堆积`;
    }
    if (delta < 0 && prev.lockAmount > 0 && -delta / prev.lockAmount >= 0.1) {
      return `⚠️ ${stock.name} 封单减少${Math.round((-delta / prev.lockAmount) * 100)}%，抛压有所缓解`;
    }
  }

  return "";
}

function canNotify(prev, now, cooldown) {
  if (!prev?.lastNotifyTime) return true;
  return now - prev.lastNotifyTime >= cooldown;
}

module.exports = { calculateLockInfo, checkLockTip };
