// 自选 / 指数行渲染 + 行内展开详情
import type { DetailQuote, MinutePoint, RowItem } from "../shared/protocol";
import { dirClass, esc, fmtMoney, fmtNum, fmtVol, signed } from "./format";

export interface DetailData {
  quote: DetailQuote | null;
  minute: MinutePoint[];
}

function cellsHtml(s: RowItem, expanded: boolean, expandable: boolean): string {
  const cls = dirClass(s.changePercent);
  const marker = expandable ? (expanded ? "▾" : "▸") : "";
  return `<td class="marker">${marker}</td>
    <td class="dim">${esc(s.code)}</td>
    <td>${esc(s.name)}</td>
    <td class="num ${cls}">${esc(s.current)}</td>
    <td class="num ${cls}">${esc(signed(s.changePercent, "%"))}</td>
    <td class="num ${cls}">${esc(signed(s.changeValue))}</td>
    <td class="dim">${esc(s.lock)}</td>`;
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

// 详情行骨架：展开期间常驻复用，列表刷新时整体搬入新表格，
// 保证图表、悬停读数与鼠标事件不随每 5 秒的行情刷新重建
export function createDetailRow(): HTMLTableRowElement {
  const tbody = document.createElement("tbody");
  tbody.innerHTML = `<tr class="detail"><td colspan="7">
    <div class="metrics"><span class="info">加载中</span></div>
    <div class="hover"></div>
    <div class="chart"></div>
  </td></tr>`;
  return tbody.firstElementChild as HTMLTableRowElement;
}

// 只更新指标文字，悬停读数与图表不受影响
export function updateDetailMetrics(
  row: HTMLTableRowElement,
  detail: DetailData | undefined,
): void {
  const info = row.querySelector<HTMLElement>(".info")!;
  if (!detail) info.innerHTML = "加载中";
  else if (!detail.quote) info.innerHTML = "暂无数据";
  else info.innerHTML = metricsHtml(detail.quote);
}

// 渲染列表；expandable 为 false 时（指数）不支持展开；detailRow 放在展开行之后。
// 行顺序不变时只替换各行单元格，详情行原地保留；顺序变化（排序、增删、切 tab）才整表重建
export function renderList(
  el: HTMLElement,
  items: RowItem[],
  expanded: string | null,
  expandable: boolean,
  detailRow: HTMLTableRowElement | null = null,
): void {
  if (!items.length) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const rows = [...el.querySelectorAll<HTMLTableRowElement>("table tr.row")];
  const sameOrder =
    rows.length === items.length &&
    rows.every((r, i) => r.dataset.code === items[i].code);
  const cells = (s: RowItem) =>
    cellsHtml(s, expandable && s.code === expanded, expandable);
  if (sameOrder) {
    rows.forEach((r, i) => {
      r.innerHTML = cells(items[i]);
    });
  } else {
    el.innerHTML = `<table>${items
      .map((s) => `<tr class="row" data-code="${esc(s.code)}">${cells(s)}</tr>`)
      .join("")}</table>`;
  }
  placeDetailRow(el, expandable ? expanded : null, detailRow);
}

// 移除过期详情行，并确保当前详情行紧跟展开行（已在位时不移动，避免打断悬停）
function placeDetailRow(
  el: HTMLElement,
  expanded: string | null,
  detailRow: HTMLTableRowElement | null,
): void {
  el.querySelectorAll("tr.detail").forEach((d) => d !== detailRow && d.remove());
  if (!expanded || !detailRow) {
    detailRow?.remove();
    return;
  }
  const row = [...el.querySelectorAll<HTMLElement>("tr.row")].find(
    (r) => r.dataset.code === expanded,
  );
  if (row && row.nextElementSibling !== detailRow) row.after(detailRow);
}
