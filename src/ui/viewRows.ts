// 面板列表行构造：把行情与榜单条目转成 webview 直接渲染的行
import { INDUSTRY_CODES } from "../constants";
import { formatAmount, formatMoney } from "../shared/format";
import { isLockState } from "../utils/stock";
import type { MoneyFlowItem, RankItem, Stock } from "../types";
import type { FlowRowItem, RowItem, SectorItem } from "../shared/protocol";

// 行业代码 → 名称索引：接口返回的是 ETF 全称，面板上改用行业短名
const INDUSTRY_NAME_MAP = new Map(INDUSTRY_CODES.map((c) => [c.code, c.name]));

// 行情行与榜单行字段完全一致，只差封单；榜单没有封单数据，恒为空。
// 逐字段取值而不展开源对象：Stock 还带着五档、成交额等面板用不到的字段
function quoteRow(base: Omit<RowItem, "lock">, lock = ""): RowItem {
  return {
    code: base.code,
    name: base.name,
    current: base.current,
    changePercent: base.changePercent,
    changeValue: base.changeValue,
    lock,
  };
}

// 自选/指数行情行：面板空间充足，始终显示全称，封单仅涨跌停时显示
export function toRow(stock: Stock): RowItem {
  const locked = isLockState(stock.priceType) && (stock.lockAmount ?? 0) > 0;
  return quoteRow(
    stock,
    locked ? `封 ${formatAmount(stock.lockAmount ?? 0)}` : "",
  );
}

// 涨跌榜行
export function toRankRow(item: RankItem): RowItem {
  return quoteRow(item);
}

// 资金榜行：净额按进出方向着色，末列补占成交额比，弥补榜单看不出强弱
export function toFlowRow(item: MoneyFlowItem): FlowRowItem {
  return {
    code: item.code,
    name: item.name,
    current: item.current,
    changePercent: item.changePercent,
    netAmount: (item.netAmount > 0 ? "+" : "") + formatMoney(item.netAmount),
    netDir: item.netAmount >= 0 ? "up" : "dn",
    netRatio: `占 ${item.netRatio}%`,
  };
}

// 板块网格项
export function toSectorItem(stock: Stock): SectorItem {
  return {
    name: INDUSTRY_NAME_MAP.get(stock.code) || stock.name,
    changePercent: stock.changePercent,
  };
}
