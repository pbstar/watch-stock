// 行情接口统一入口：路由数据源 + 接口级缓存 + 主动刷新与失效
import {
  FLOW_CACHE_TTL,
  MINUTE_CACHE_TTL,
  QUOTE_CACHE_TTL,
  RANK_CACHE_TTL,
  SUGGEST_CACHE_TTL,
} from "../constants";
import {
  bumpEpoch,
  cachedFetch,
  clearCache,
  invalidateWhere,
} from "../utils/cache";
import * as sina from "../sources/sina";
import * as tencent from "../sources/tencent";
import type {
  MinutePoint,
  MoneyFlowItem,
  RankItem,
  Stock,
  StockQuote,
} from "../types";

// 批量行情源：sina 含五档封单，tencent 简版在集合竞价等新浪缺数据时段兜底
export type QuoteSource = "sina" | "tencent";

// 股票维度的缓存 key 形如 <源>:<类型>:<代码...>，构造与解析共用同一套约定：
// invalidateQuote 靠解析反解出代码做按股票失效，改这里的格式必须两边一起改
function stockKey(
  source: QuoteSource,
  kind: "quote" | "full" | "minute",
  codes: string[],
): string {
  return `${source}:${kind}:${codes.join(",")}`;
}

const STOCK_KEY_RE = /^(sina|tencent):(quote|full|minute):(.+)$/;

// 代码归一化：小写、去重、排序，保证调用顺序不同也能命中同一份缓存
function normalizeCodes(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.toLowerCase()))].sort();
}

// 调用方顺序的代码列表（小写去重，保持先后）：请求时可乱序，
// 但返回结果必须按展示顺序对齐（板块与指数字典序不等于展示序）
function requestOrder(codes: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const code of codes) {
    const lower = code.toLowerCase();
    if (!lower || seen.has(lower)) continue;
    seen.add(lower);
    list.push(lower);
  }
  return list;
}

// 按请求顺序对齐结果，源未返回的代码（如无效代码）直接丢弃
function orderBy<T extends { code: string }>(rows: T[], codes: string[]): T[] {
  const map = new Map(rows.map((r) => [r.code, r]));
  return codes
    .map((c) => map.get(c))
    .filter((r): r is T => r !== undefined);
}

// 批量取股票维度的行情：缓存 key 用归一化后的代码，调用顺序不同也命中同一份缓存；
// 返回前再按调用方顺序还原。行情与详情同属行情类，共用 QUOTE_CACHE_TTL
async function fetchQuoteRows<T extends { code: string }>(
  source: QuoteSource,
  kind: "quote" | "full",
  codes: string[],
  load: (list: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (!codes?.length) return [];
  const list = normalizeCodes(codes);
  const rows = await cachedFetch<T[]>({
    key: stockKey(source, kind, list),
    ttl: QUOTE_CACHE_TTL,
    fallback: [],
    load: () => load(list),
  });
  return orderBy(rows, requestOrder(codes));
}

// 批量行情（自选/指数/板块）
export async function getStockList(
  codes: string[],
  source: QuoteSource = "sina",
): Promise<Stock[]> {
  return fetchQuoteRows(source, "quote", codes, (list) =>
    source === "sina" ? sina.fetchQuote(list) : tencent.fetchSimpleQuotes(list),
  );
}

// 详细行情列表（面板展开行）
export async function getStockQuoteList(
  codes: string[],
): Promise<StockQuote[]> {
  return fetchQuoteRows("tencent", "full", codes, (list) =>
    tencent.fetchFullQuotes(list),
  );
}

// 涨跌排行：沪深京 A 股全市场按涨跌幅取头部
export async function getRankList(
  asc: boolean,
  num: number,
): Promise<RankItem[]> {
  return cachedFetch<RankItem[]>({
    key: `sina:rank:${asc ? "asc" : "desc"}:${num}`,
    ttl: RANK_CACHE_TTL,
    cacheEmpty: false,
    fallback: [],
    load: () => sina.fetchRank(asc, num),
  });
}

// 资金榜：全市场按净流入额取头部
export async function getMoneyFlowList(
  asc: boolean,
  num: number,
): Promise<MoneyFlowItem[]> {
  return cachedFetch<MoneyFlowItem[]>({
    key: `sina:flow:${asc ? "asc" : "desc"}:${num}`,
    ttl: FLOW_CACHE_TTL,
    cacheEmpty: false,
    fallback: [],
    load: () => sina.fetchMoneyFlow(asc, num),
  });
}

// 分时数据
export async function getStockMinute(code: string): Promise<MinutePoint[]> {
  const key = code.toLowerCase();
  return cachedFetch<MinutePoint[]>({
    key: stockKey("tencent", "minute", [key]),
    ttl: MINUTE_CACHE_TTL,
    fallback: [],
    load: () => tencent.fetchMinute(key),
  });
}

// 名称 -> 标准代码
export async function searchStockCode(
  keyword: string,
): Promise<string | null> {
  const trimmed = keyword?.trim();
  if (!trimmed) return null;

  return cachedFetch<string | null>({
    key: `sina:suggest:${trimmed}`,
    ttl: SUGGEST_CACHE_TTL,
    fallback: null,
    // 无匹配说明名称有误，不写缓存，用户改名后能立即重查
    cacheEmpty: false,
    isEmpty: (v) => v === null,
    load: () => sina.searchCode(trimmed),
  });
}

// 主动刷新：全部缓存立即失效，下一次读取重新取数
export function refreshAll(): void {
  bumpEpoch();
}

// 失效指定股票的行情/详情/分时缓存（移除股票后不再保留其数据）
export function invalidateQuote(codes: string[]): void {
  const targets = new Set(codes.map((c) => c.toLowerCase()));
  invalidateWhere((key) => {
    const m = key.match(STOCK_KEY_RE);
    return !!m && m[3].split(",").some((c) => targets.has(c));
  });
}

// 清空全部接口缓存（跨交易日、扩展释放）
export function clearMarketCache(): void {
  clearCache();
}
