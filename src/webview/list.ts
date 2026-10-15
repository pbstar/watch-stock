// 列表行渲染（行情行 / 资金行）+ 行内展开详情
import type {
  DetailQuote,
  FlowRowItem,
  MinutePoint,
  RowItem,
} from "../shared/protocol";
import { decOf, formatMoney, formatVolume } from "../shared/format";
import { dirClass, esc, fmtNum, signed } from "./format";

export interface DetailData {
  quote: DetailQuote | null;
  minute: MinutePoint[];
}

// 行情行（自选 / 指数 / 涨跌榜）：现价、涨跌幅、涨跌额
export function quoteCellsHtml(s: RowItem, marker: string): string {
  const cls = dirClass(s.changePercent);
  return `<span class="marker">${marker}</span>
    <span class="dim">${esc(s.code)}</span>
    <span class="name">${esc(s.name)}</span>
    <span class="num ${cls}">${esc(s.current)}</span>
    <span class="num ${cls}">${esc(signed(s.changePercent, "%"))}</span>
    <span class="num ${cls}">${esc(signed(s.changeValue))}</span>
    <span class="dim">${esc(s.lock)}</span>`;
}

// 资金榜行：第 6 列换成净额并按进出方向着色，末列补净额占比，与行情行共用同一套列宽
export function flowCellsHtml(s: FlowRowItem, marker: string): string {
  const cls = dirClass(s.changePercent);
  return `<span class="marker">${marker}</span>
    <span class="dim">${esc(s.code)}</span>
    <span class="name">${esc(s.name)}</span>
    <span class="num ${cls}">${esc(s.current)}</span>
    <span class="num ${cls}">${esc(signed(s.changePercent, "%"))}</span>
    <span class="num ${s.netDir}">${esc(s.netAmount)}</span>
    <span class="dim">${esc(s.netRatio)}</span>`;
}

// compact 为精简模式（指数）：指数无换手、市盈等个股指标，只保留行情与成交
function metricsHtml(q: DetailQuote, compact: boolean): string {
  const d = decOf(q.isETF);
  const items: [string, string][] = [
    ["今开", fmtNum(q.open, d)],
    ["最高", fmtNum(q.high, d)],
    ["最低", fmtNum(q.low, d)],
    ["量", formatVolume(q.volume)],
    ["额", formatMoney(q.amount)],
  ];
  if (!compact) {
    items.push(
      ["换手", q.turnoverRatio ? `${fmtNum(q.turnoverRatio)}%` : "-"],
      ["量比", fmtNum(q.volumeRatio)],
      ["市盈", q.pe ? fmtNum(q.pe) : "-"],
      ["市值", formatMoney(q.totalMarket)],
    );
  }
  return items.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join("");
}

// 详情块骨架：展开期间常驻复用，列表刷新时整体搬入新列表，
// 保证图表、悬停读数与鼠标事件不随每 5 秒的行情刷新重建
export function createDetail(compact = false): HTMLElement {
  const el = document.createElement("div");
  el.className = "detail";
  el.dataset.compact = compact ? "1" : "0";
  el.innerHTML = `<div class="metrics"><span class="info">加载中</span></div>
    <div class="hover"></div>
    <div class="chart"></div>`;
  return el;
}

// 只更新指标文字，悬停读数与图表不受影响
export function updateDetailMetrics(
  detail: HTMLElement,
  data: DetailData | undefined,
): void {
  const info = detail.querySelector<HTMLElement>(".info")!;
  if (!data) info.innerHTML = "加载中";
  else if (!data.quote) info.innerHTML = "暂无数据";
  else info.innerHTML = metricsHtml(data.quote, detail.dataset.compact === "1");
}

// 渲染列表；expandable 为 false 时（板块）不支持展开；detailEl 放在展开行之后。
// 列的含义由各列表自己的 cells 决定，这里只管行复用、整体重建与详情块落位：
// 行顺序不变时只替换各行单元格，详情块原地保留；顺序变化（排序、增删、切 tab）才整体重建
export function renderList<T extends { code: string }>(
  el: HTMLElement,
  items: T[],
  expanded: string | null,
  expandable: boolean,
  detailEl: HTMLElement | null,
  cells: (item: T, marker: string) => string,
): void {
  if (!items.length) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  let rows = [...el.querySelectorAll<HTMLElement>(".row")];
  const sameOrder =
    rows.length === items.length &&
    rows.every((r, i) => r.dataset.code === items[i].code);
  const cellHtml = (s: T) =>
    cells(s, expandable ? (s.code === expanded ? "▾" : "▸") : "");
  if (sameOrder) {
    rows.forEach((r, i) => {
      r.innerHTML = cellHtml(items[i]);
    });
  } else {
    // 整体重建会连同详情块一起销毁，需重新取引用
    el.innerHTML = items
      .map((s) => `<div class="row" data-code="${esc(s.code)}">${cellHtml(s)}</div>`)
      .join("");
    rows = [...el.querySelectorAll<HTMLElement>(".row")];
  }
  placeDetail(el, rows, expandable ? expanded : null, detailEl);
}

// 移除过期详情块，并确保当前详情块紧跟展开行（已在位时不移动，避免打断悬停）
function placeDetail(
  el: HTMLElement,
  rows: HTMLElement[],
  expanded: string | null,
  detailEl: HTMLElement | null,
): void {
  el.querySelectorAll(".detail").forEach((d) => d !== detailEl && d.remove());
  if (!expanded || !detailEl) {
    detailEl?.remove();
    return;
  }
  const row = rows.find((r) => r.dataset.code === expanded);
  if (row && row.nextElementSibling !== detailEl) row.after(detailEl);
}
