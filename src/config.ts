// 合并 vscodeConfig + staticConfig，提供单一配置访问入口
import * as vscode from "vscode";
import { isValidStockCode } from "./utils/stock";
import type { Alarm, IndustryConfig } from "./types";

const SECTION = "watch-stock";

// 大盘指数代码
export const INDEX_CODES: string[] = [
  "sh000001",
  "sz399001",
  "sz399006",
  "sh000688",
  "bj899050",
];

// 行业板块代码
export const INDUSTRY_CODES: IndustryConfig[] = [
  { code: "sh512880", name: "证券" },
  { code: "sz159326", name: "电网设备" },
  { code: "sh512400", name: "有色金属" },
  { code: "sh512480", name: "半导体" },
  { code: "sz159928", name: "消费" },
  { code: "sz159206", name: "卫星" },
  { code: "sh512690", name: "白酒" },
  { code: "sh512010", name: "医药" },
  { code: "sh515880", name: "通信" },
  { code: "sh512660", name: "军工" },
  { code: "sh515980", name: "人工智能" },
  { code: "sh515220", name: "煤炭" },
  { code: "sz159869", name: "游戏" },
  { code: "sz159995", name: "芯片" },
  { code: "sh516160", name: "新能源" },
  { code: "sh562800", name: "稀有金属" },
  { code: "sz159766", name: "旅游" },
  { code: "sh512980", name: "传媒" },
  { code: "sh515170", name: "食品饮料" },
  { code: "sh512800", name: "银行" },
  { code: "sh515230", name: "软件" },
  { code: "sh561360", name: "石油" },
  { code: "sh510230", name: "金融" },
  { code: "sh512290", name: "生物医药" },
  { code: "sz159516", name: "半导体设备" },
  { code: "sh515210", name: "钢铁" },
  { code: "sh512670", name: "国防" },
  { code: "sh159625", name: "绿色电力" },
  { code: "sh562500", name: "机器人" },
  { code: "sz159611", name: "电力" },
  { code: "sh560080", name: "中药" },
  { code: "sz159870", name: "化工" },
  { code: "sz159930", name: "能源" },
  { code: "sz159992", name: "创新药" },
  { code: "sh516970", name: "基建" },
  { code: "sz159825", name: "农业" },
  { code: "sh516150", name: "稀土" },
  { code: "sz159865", name: "养殖" },
  { code: "sz159755", name: "电池" },
  { code: "sh516510", name: "云计算" },
  { code: "sh515790", name: "光伏" },
  { code: "sh512200", name: "房地产" },
  { code: "sz159996", name: "家电" },
  { code: "sz159227", name: "航空航天" },
  { code: "sh516520", name: "智能驾驶" },
  { code: "sh516620", name: "影视" },
];

// 行业板块代码列表（由 INDUSTRY_CODES 派生的纯代码数组）
export const INDUSTRY_CODE_LIST: string[] = INDUSTRY_CODES.map((i) => i.code);

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
  showLockCount: boolean;
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
  showLockCount: false,
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
  // 已校验过格式的股票代码列表，过滤掉非法值并自动回写
  getStocks(): string[] {
    const codes = raw().get<string[]>("stocks", []);
    const valid = codes.filter((c) => isValidStockCode(c));
    if (valid.length !== codes.length) {
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
  getShowLockCount: () => read("showLockCount"),
  getAlarms: () => read("priceAlarms"),
  async saveAlarms(alarms: Alarm[]): Promise<void> {
    await raw().update(
      "priceAlarms",
      alarms,
      vscode.ConfigurationTarget.Global,
    );
  },
};

// 列表元素移动
export function moveStock(
  stocks: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  const result = [...stocks];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}
