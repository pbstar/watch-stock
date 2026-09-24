// 扩展 ⇄ webview 消息协议，两端共用；保持环境无关，不依赖 vscode / DOM / node 类型

export type Tab = "mine" | "index" | "sector";

// 分时数据点（无数据时各字段为 null）
export interface MinutePoint {
  time: string;
  price: number | null;
  volume: number | null;
  amount: number | null;
}

// 列表行（自选 / 指数），名称与封单文案由扩展端处理好
export interface RowItem {
  code: string;
  name: string;
  current: string;
  changePercent: string;
  changeValue: string;
  lock: string;
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
      type: "detail";
      code: string;
      quote: DetailQuote | null;
      minute: MinutePoint[];
    };

// webview → 扩展（ready 携带 webview 恢复的界面状态）
export type ToHost =
  | { type: "ready"; tab: Tab; expanded: string | null }
  | { type: "tab"; tab: Tab }
  | { type: "expand"; code: string | null }
  | { type: "refresh" };
