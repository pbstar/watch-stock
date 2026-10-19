// 面板取数编排：按列表拉数据并转成待下发的消息，缓存与数据源细节都在 marketApi 之下
// 自选行情由主循环统一取数并推送，这里只处理需要面板单独取数的列表
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
import { formatClock } from "../utils/time";
import { toFlowRow, toRankRow, toRow, toSectorItem } from "./viewRows";
import type { ListKey, RankDir, ToView } from "../shared/protocol";

type FetchKey = Exclude<ListKey, "mine">;

export interface ListPayload {
  // 待下发的列表消息，带本次取数时刻
  msg: ToView;
  // 本次列表实际包含的代码，供展开行判断是否还需要拉详情
  codes: string[];
}

// 取数完成的时刻即该列表的刷新时间
function stamp(): string {
  return formatClock(new Date());
}

async function loadIndex(): Promise<ListPayload> {
  const items = (await getStockList(INDEX_CODES)).map(toRow);
  return {
    msg: { type: "index", items, time: stamp() },
    codes: items.map((r) => r.code),
  };
}

// 板块只有名称与涨跌幅，不支持展开，codes 恒为空
async function loadSector(): Promise<ListPayload> {
  const items = (await getStockList(INDUSTRY_CODE_LIST)).map(toSectorItem);
  return { msg: { type: "sector", items, time: stamp() }, codes: [] };
}

// 单份榜单：涨跌榜按涨跌幅取头部，资金榜按净流入额取头部
async function loadRank(dir: RankDir): Promise<ListPayload> {
  const asc = dir === "down" || dir === "outflow";
  if (dir === "up" || dir === "down") {
    const items = (await getRankList(asc, RANK_SIZE)).map(toRankRow);
    return {
      msg: { type: "rank", dir, items, time: stamp() },
      codes: items.map((r) => r.code),
    };
  }
  const items = (await getMoneyFlowList(asc, FLOW_FETCH_SIZE))
    .slice(0, FLOW_SIZE)
    .map(toFlowRow);
  return {
    msg: { type: "rank", dir, items, time: stamp() },
    codes: items.map((r) => r.code),
  };
}

// 按列表取数：一次只取一个列表，各列表互不并发
export async function loadList(key: FetchKey): Promise<ListPayload> {
  if (key === "index") return loadIndex();
  if (key === "sector") return loadSector();
  return loadRank(key);
}

// 展开行详情：完整行情与分时各自走接口缓存
export async function loadDetail(code: string): Promise<ToView> {
  const [quotes, minute] = await Promise.all([
    getStockQuoteList([code]),
    getStockMinute(code),
  ]);
  return { type: "detail", code, quote: quotes[0] ?? null, minute };
}
