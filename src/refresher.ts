// 行情数据刷新与定时器调度
import { config } from "./config";
import { getStockList } from "./services/stockService";
import { calculateLockInfo, checkLockTip } from "./managers/lockManager";
import { checkAlarms } from "./managers/alarmManager";
import {
  isTradingTime,
  isMorningAuctionTime,
  isAfternoonAuctionTime,
} from "./utils/time";
import type { AppState } from "./appState";

// 刷新间隔 5 秒
const REFRESH_INTERVAL = 5000;

// 状态栏是否应该显示
export function getIsVisible(state: AppState): boolean {
  if (state.userForced !== null) return state.userForced;
  return config.getAutoHideByMarket() ? isTradingTime() : true;
}

// 拉取数据 -> 计算封单 -> 触发闹钟 -> 渲染状态栏
export async function refreshData(state: AppState): Promise<void> {
  const stocks = config.getStocks();
  const isMorningAuction = isMorningAuctionTime();
  const isAfternoonAuction = isAfternoonAuctionTime();
  const stockInfos =
    stocks.length > 0 ? await getStockList(stocks, !isMorningAuction) : [];

  for (const stock of stockInfos) {
    const lockInfo = calculateLockInfo(stock);
    Object.assign(stock, lockInfo);
  }

  if (stockInfos.length > 0) {
    await checkAlarms(stockInfos);
  }

  if (!isMorningAuction && !isAfternoonAuction && config.getEnableLockTip()) {
    checkLockTip(stockInfos);
  }

  if (getIsVisible(state)) {
    state.statusBar.render(stocks, stockInfos);
  } else {
    state.statusBar.setHidden();
  }
}

// 立即刷新一次并启动定时器
export function startRefreshTimer(state: AppState): void {
  void refreshData(state);
  state.refreshTimer = setInterval(() => {
    if (isTradingTime()) {
      void refreshData(state);
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
