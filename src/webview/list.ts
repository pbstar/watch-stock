// 自选 / 指数行渲染 + 行内展开详情
import type { DetailQuote, MinutePoint, RowItem } from "../shared/protocol";
import { dirClass, esc, fmtMoney, fmtNum, fmtVol, signed } from "./format";

export interface DetailData {
  quote: DetailQuote | null;
  minute: MinutePoint[];
}

function cellsHtml(s: RowItem, marker: string): string {
  const cls = dirClass(s.changePercent);
  return `<span class="marker">${marker}</span>
    <span class="dim">${esc(s.code)}</span>
    <span class="name">${esc(s.name)}</span>
    <span class="num ${cls}">${esc(s.current)}</span>
    <span class="num ${cls}">${esc(signed(s.changePercent, "%"))}</span>
    <span class="num ${cls}">${esc(signed(s.changeValue))}</span>
    <span class="dim">${esc(s.lock)}</span>`;
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

// 详情块骨架：展开期间常驻复用，列表刷新时整体搬入新列表，
// 保证图表、悬停读数与鼠标事件不随每 5 秒的行情刷新重建
export function createDetail(): HTMLElement {
  const el = document.createElement("div");
  el.className = "detail";
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
  else info.innerHTML = metricsHtml(data.quote);
}

// 渲染列表；expandable 为 false 时（指数）不支持展开；detailEl 放在展开行之后。
// 行顺序不变时只替换各行单元格，详情块原地保留；顺序变化（排序、增删、切 tab）才整体重建
export function renderList(
  el: HTMLElement,
  items: RowItem[],
  expanded: string | null,
  expandable: boolean,
  detailEl: HTMLElement | null = null,
): void {
  if (!items.length) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const rows = [...el.querySelectorAll<HTMLElement>(".row")];
  const sameOrder =
    rows.length === items.length &&
    rows.every((r, i) => r.dataset.code === items[i].code);
  const cells = (s: RowItem) =>
    cellsHtml(s, expandable ? (s.code === expanded ? "▾" : "▸") : "");
  if (sameOrder) {
    rows.forEach((r, i) => {
      r.innerHTML = cells(items[i]);
    });
  } else {
    el.innerHTML = items
      .map((s) => `<div class="row" data-code="${esc(s.code)}">${cells(s)}</div>`)
      .join("");
  }
  placeDetail(el, expandable ? expanded : null, detailEl);
}

// 移除过期详情块，并确保当前详情块紧跟展开行（已在位时不移动，避免打断悬停）
function placeDetail(
  el: HTMLElement,
  expanded: string | null,
  detailEl: HTMLElement | null,
): void {
  el.querySelectorAll(".detail").forEach((d) => d !== detailEl && d.remove());
  if (!expanded || !detailEl) {
    detailEl?.remove();
    return;
  }
  const row = [...el.querySelectorAll<HTMLElement>(".row")].find(
    (r) => r.dataset.code === expanded,
  );
  if (row && row.nextElementSibling !== detailEl) row.after(detailEl);
}
