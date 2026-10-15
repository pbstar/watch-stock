// 扩展 ⇄ webview 消息协议，两端共用；保持环境无关，不依赖 vscode / DOM / node 类型

export type Tab = "mine" | "index" | "sector" | "rank";

// 排行方向：涨幅榜 / 跌幅榜 / 资金流入榜 / 资金流出榜
export type RankDir = "up" | "down" | "inflow" | "outflow";

// 分时数据点（无数据时各字段为 null）
export interface MinutePoint {
  time: string;
  price: number | null;
  volume: number | null;
}

// 列表行（自选 / 指数 / 涨跌榜），名称与封单文案由扩展端处理好
export interface RowItem {
  code: string;
  name: string;
  current: string;
  changePercent: string;
  changeValue: string;
  lock: string;
}

// 资金榜行：净额与净额占比只有资金榜有，单独一套列，不与行情行混用
export interface FlowRowItem {
  code: string;
  name: string;
  current: string;
  changePercent: string;
  netAmount: string; // 净额文案，带符号与量级单位
  netDir: "up" | "dn"; // 净额按流入/流出着色
  netRatio: string; // 净额占成交额比文案
}

// 板块网格项
export interface SectorItem {
  name: string;
  changePercent: string;
}

// 展开详情所需指标（StockQuote 的子集，扩展端直接传 StockQuote）
export interface DetailQuote {
  close: string;
  open: string;
  high: string;
  low: string;
  volume: number;
  amount: number;
  turnoverRatio: string;
  volumeRatio: string;
  pe: number;
  totalMarket: number;
  isETF: boolean;
}

// 扩展 → webview
export type ToView =
  | { type: "stocks"; items: RowItem[]; time: string; colorful: boolean }
  | { type: "index"; items: RowItem[] }
  | { type: "sector"; items: SectorItem[] }
  | {
      type: "rank";
      up: RowItem[];
      down: RowItem[];
      inflow: FlowRowItem[];
      outflow: FlowRowItem[];
    }
  | {
      type: "detail";
      code: string;
      quote: DetailQuote | null;
      minute: MinutePoint[];
    };

// webview → 扩展（ready 携带 webview 恢复的 tab）
export type ToHost =
  | { type: "ready"; tab: Tab }
  | { type: "tab"; tab: Tab }
  | { type: "expand"; code: string | null }
  | { type: "refresh" };
