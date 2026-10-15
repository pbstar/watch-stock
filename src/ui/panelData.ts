// 面板取数编排：按标签拉数据并转成待下发的消息，缓存与数据源细节都在 marketApi 之下
import { config } from "../config";
import {
  FLOW_FETCH_SIZE,
  FLOW_SIZE,
  INDEX_CODES,
  INDUSTRY_CODE_LIST,
  RANK_SIZE,
} from "../constants";
import {
  getMoneyFlowList,
  getRankList,
  getStockList,
  getStockMinute,
  getStockQuoteList,
} from "../services/marketApi";
import { toFlowRow, toRankRow, toRow, toSectorItem } from "./viewRows";
import type { Tab, ToView } from "../shared/protocol";

export interface TabPayload {
  // 待下发的消息；自选标签的行情由主循环推送，没有自己的列表消息
  msg: ToView | null;
  // 本次列表实际包含的代码，供展开行判断是否还需要拉详情
  codes: string[];
}

// 按标签取数；板块不支持展开，其 codes 恒为空
export async function loadTab(tab: Tab): Promise<TabPayload> {
  if (tab === "index") {
    const items = (await getStockList(INDEX_CODES)).map(toRow);
    return { msg: { type: "index", items }, codes: items.map((r) => r.code) };
  }

  if (tab === "sector") {
    const list = await getStockList(INDUSTRY_CODE_LIST);
    return { msg: { type: "sector", items: list.map(toSectorItem) }, codes: [] };
  }

  if (tab === "rank") {
    // 四份榜单一起下发，面板内切换涨跌榜与资金榜都不再回扩展端
    const [up, down, inflowAll, outflowAll] = await Promise.all([
      getRankList(false, RANK_SIZE),
      getRankList(true, RANK_SIZE),
      getMoneyFlowList(false, FLOW_FETCH_SIZE),
      getMoneyFlowList(true, FLOW_FETCH_SIZE),
    ]);
    const ranks = {
      up: up.map(toRankRow),
      down: down.map(toRankRow),
      inflow: inflowAll.slice(0, FLOW_SIZE).map(toFlowRow),
      outflow: outflowAll.slice(0, FLOW_SIZE).map(toFlowRow),
    };
    return {
      msg: { type: "rank", ...ranks },
      codes: [
        ...ranks.up,
        ...ranks.down,
        ...ranks.inflow,
        ...ranks.outflow,
      ].map((r) => r.code),
    };
  }

  return { msg: null, codes: config.getStocks() };
}

// 展开行详情：完整行情与分时各自走接口缓存
export async function loadDetail(code: string): Promise<ToView> {
  const [quotes, minute] = await Promise.all([
    getStockQuoteList([code]),
    getStockMinute(code),
  ]);
  return { type: "detail", code, quote: quotes[0] ?? null, minute };
}
