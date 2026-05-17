// 行情数据刷新与定时器调度
import { config, getIsVisible } from "./config";
import { getStockList } from "./services/stockService";
import { calculateLockInfo, checkLockTip } from "./managers/lockManager";
import { checkLargeTip } from "./managers/largeManager";
import { checkAlarms } from "./managers/alarmManager";
import {
  isTradingTime,
  isMorningAuctionTime,
  isAfternoonAuctionTime,
  isStableTradeTime,
} from "./utils/time";
import type { AppState } from "./types";

// 刷新间隔 5 秒
const REFRESH_INTERVAL = 5000;

// 拉取数据 -> 计算封单 -> 触发闹钟 -> 渲染状态栏
export async function refreshData(
  state: AppState,
  now?: Date,
  isAuto?: boolean,
): Promise<void> {
  if (!now) now = new Date();
  const stocks = config.getStocks();
  const isMorningAuction = isMorningAuctionTime(now);
  const isAfternoonAuction = isAfternoonAuctionTime(now);
  const stockInfos =
    stocks.length > 0 ? await getStockList(stocks, !isMorningAuction) : [];

  for (const stock of stockInfos) {
    const lockInfo = calculateLockInfo(stock);
    Object.assign(stock, lockInfo);
  }

  if (stockInfos.length > 0) {
    await checkAlarms(stockInfos);
  }

  if (isAuto && !isMorningAuction && !isAfternoonAuction) {
    if (config.getEnableLockTip()) checkLockTip(stockInfos);
    if (config.getEnableLargeTip() && isStableTradeTime(now))
      checkLargeTip(stockInfos);
  }

  if (getIsVisible(state, now)) {
    state.statusBar.render(stocks, stockInfos);
  } else {
    state.statusBar.setHidden();
  }
}

// 立即刷新一次并启动定时器
export function startRefreshTimer(state: AppState): void {
  void refreshData(state);
  state.refreshTimer = setInterval(() => {
    const now = new Date();
    if (isTradingTime(now)) {
      void refreshData(state, now, true);
    } else if (config.getAutoHideByMarket() && state.userForced === null) {
      state.statusBar.setHidden();
    }
  }, REFRESH_INTERVAL);
}

// 停止定时器
export function stopRefreshTimer(state: AppState): void {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}
