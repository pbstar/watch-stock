// 扩展宿主 ↔ webview 的消息契约（两侧共用，编译期保证字段对齐）
import type {
  IndustryItem,
  MinutePoint,
  Stock,
  StockOverview,
  StockQuote,
} from "../types";

/** 全览页固定 tab 的伪代码（不是真实股票代码） */
export const OVERVIEW_TAB = "__overview__";

/** webview → 扩展宿主 */
export type WebviewRequest =
  | { type: "ready" }
  | { type: "switchStock"; code: string }
  | { type: "refresh" }
  | { type: "refreshIndex" }
  | { type: "refreshIndustry" };

/** 扩展宿主 → webview */
export type HostMessage =
  | {
      type: "init";
      stocks: StockOverview[];
      indexStocks: Stock[];
      industryStocks: IndustryItem[];
      quoteData: Record<string, StockQuote>;
    }
  | { type: "loading"; code: string }
  | {
      type: "minuteData";
      code: string;
      data: MinutePoint[];
      stockInfo: StockOverview | null;
      quoteInfo: StockQuote | null;
      cached?: boolean;
    }
  | { type: "indexData"; indexStocks: Stock[] }
  | { type: "industryData"; industryStocks: IndustryItem[] };
