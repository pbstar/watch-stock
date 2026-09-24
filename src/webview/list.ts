// 自选 / 指数行渲染 + 行内展开详情
import type { DetailQuote, MinutePoint, RowItem } from "../shared/protocol";
import { dirClass, esc, fmtMoney, fmtNum, fmtVol, signed } from "./format";

export interface DetailData {
  quote: DetailQuote | null;
  minute: MinutePoint[];
}

function rowHtml(s: RowItem, expanded: boolean, expandable: boolean): string {
  const cls = dirClass(s.changePercent);
  const marker = expandable ? (expanded ? "▾" : "▸") : "";
  return `<tr class="row" data-code="${esc(s.code)}">
    <td class="marker">${marker}</td>
    <td class="dim">${esc(s.code)}</td>
    <td>${esc(s.name)}</td>
    <td class="num ${cls}">${esc(s.current)}</td>
    <td class="num ${cls}">${esc(signed(s.changePercent, "%"))}</td>
    <td class="num ${cls}">${esc(signed(s.changeValue))}</td>
    <td class="dim">${esc(s.lock)}</td>
  </tr>`;
}

function metricsHtml(q: DetailQuote): string {
  const items: [string, string][] = [
    ["今开", fmtNum(q.open, q.isETF ? 3 : 2)],
    ["最高", fmtNum(q.high, q.isETF ? 3 : 2)],
    ["最低", fmtNum(q.low, q.isETF ? 3 : 2)],
    ["量", fmtVol(q.volume)],
    ["额", fmtMoney(q.amount)],
    ["换手", q.turnoverRatio ? `${fmtNum(q.turnoverRatio)}%` : "-"],
    ["量比", fmtNum(q.volumeRatio)],
    ["市盈", q.pe ? fmtNum(q.pe) : "-"],
    ["市值", fmtMoney(q.totalMarket)],
  ];
  return items.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join("");
}

function detailHtml(detail: DetailData | undefined): string {
  const metrics = detail?.quote
    ? metricsHtml(detail.quote)
    : `<span>${detail ? "暂无数据" : "加载中"}</span>`;
  return `<tr class="detail"><td colspan="7">
    <div class="metrics">${metrics}<span class="hover"></span></div>
    <div class="chart"></div>
  </td></tr>`;
}

// 渲染列表；expandable 为 false 时（指数）不支持展开
export function renderList(
  el: HTMLElement,
  items: RowItem[],
  expanded: string | null,
  detail: DetailData | undefined,
  expandable: boolean,
): void {
  if (!items.length) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const rows = items.map((s) => {
    const open = expandable && s.code === expanded;
    return rowHtml(s, open, expandable) + (open ? detailHtml(detail) : "");
  });
  el.innerHTML = `<table>${rows.join("")}</table>`;
}
