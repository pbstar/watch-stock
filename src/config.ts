// VS Code 配置统一访问入口
import * as vscode from "vscode";
import { isValidStockCode } from "./utils/stock";
import { isTradingTime } from "./utils/time";
import type { Alarm, AppState } from "./types";

const SECTION = "watch-stock";

// 排序方式类型
export type SortType = "custom" | "changeAsc" | "changeDesc";

// 配置项类型
export interface ConfigShape {
  stocks: string[];
  maxDisplayCount: number;
  showMiniName: boolean;
  stockMiniNames: Record<string, string>;
  showChangeValue: boolean;
  autoHideByMarket: boolean;
  priceAlarms: Alarm[];
  enableLockTip: boolean;
  enableLargeTip: boolean;
  showLockCount: boolean;
  enableColorful: boolean;
  stockSortType: SortType;
}

const DEFAULTS: ConfigShape = {
  stocks: ["sh000001"],
  maxDisplayCount: 5,
  showMiniName: false,
  stockMiniNames: {},
  showChangeValue: false,
  autoHideByMarket: false,
  priceAlarms: [],
  enableLockTip: false,
  enableLargeTip: false,
  showLockCount: false,
  enableColorful: false,
  stockSortType: "custom",
};

function raw(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SECTION);
}

function read<K extends keyof ConfigShape>(key: K): ConfigShape[K] {
  try {
    return raw().get<ConfigShape[K]>(key, DEFAULTS[key]);
  } catch {
    // 配置读取异常时回退到默认值
    return DEFAULTS[key];
  }
}

// 统一配置访问入口
export const config = {
  // 已校验过格式的股票代码列表，过滤非法值并统一转为小写（与行情源返回代码、闹钟存储代码保持一致），自动回写
  getStocks(): string[] {
    const codes = raw().get<string[]>("stocks", []);
    const valid = codes
      .filter((c) => isValidStockCode(c))
      .map((c) => c.toLowerCase());
    if (valid.length !== codes.length || valid.some((c, i) => c !== codes[i])) {
      raw().update("stocks", valid, vscode.ConfigurationTarget.Global);
    }
    return valid;
  },
  async saveStocks(stocks: string[]): Promise<void> {
    await raw().update("stocks", stocks, vscode.ConfigurationTarget.Global);
  },
  getMaxDisplayCount: () => read("maxDisplayCount"),
  getShowMiniName: () => read("showMiniName"),
  getStockMiniNames: () => read("stockMiniNames"),
  getShowChangeValue: () => read("showChangeValue"),
  getAutoHideByMarket: () => read("autoHideByMarket"),
  getEnableLockTip: () => read("enableLockTip"),
  getEnableLargeTip: () => read("enableLargeTip"),
  getShowLockCount: () => read("showLockCount"),
  getEnableColorful: () => read("enableColorful"),
  getStockSortType: () => read("stockSortType"),
  getAlarms: () => read("priceAlarms"),
  async saveAlarms(alarms: Alarm[]): Promise<void> {
    await raw().update(
      "priceAlarms",
      alarms,
      vscode.ConfigurationTarget.Global,
    );
  },
};

// 配置变更是否需要触发刷新：仅闹钟列表变化时不刷新（闹钟增删不影响显示，
// 下个轮询周期自然检查；也避免 checkAlarms 在刷新中写配置引起连锁刷新）
export function affectsRefresh(e: vscode.ConfigurationChangeEvent): boolean {
  return (Object.keys(DEFAULTS) as (keyof ConfigShape)[])
    .filter((key) => key !== "priceAlarms")
    .some((key) => e.affectsConfiguration(`${SECTION}.${key}`));
}

// 状态栏是否应该显示
export function getIsVisible(state: AppState, now?: Date): boolean {
  if (state.userForced !== null) return state.userForced;
  return config.getAutoHideByMarket() ? isTradingTime(now || new Date()) : true;
}
