// 列表渲染：行复用、整体重建与详情块落位
import type { BaseRow } from "../shared/protocol";
import type { DetailBlock } from "./detail";
import { esc } from "../shared/format";

// 展开行：code 为展开的那一行，block 为常驻的详情块，两者同生共死
export interface OpenRow {
  code: string;
  block: DetailBlock;
}

// 渲染列表；列的含义由 cells 决定，这里只管行复用、整体重建与详情块落位：
// 行顺序不变时只替换各行单元格，详情块原地保留；顺序变化（排序、增删、切 tab）才整体重建
export function renderList<T extends BaseRow>(
  el: HTMLElement,
  items: T[],
  open: OpenRow | null,
  cells: (item: T, marker: string) => string,
): void {
  if (!items.length) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const openCode = open?.code ?? null;
  const cellHtml = (s: T) => cells(s, s.code === openCode ? "▾" : "▸");
  let rows = [...el.querySelectorAll<HTMLElement>(".row")];
  const sameOrder =
    rows.length === items.length &&
    rows.every((r, i) => r.dataset.code === items[i].code);
  if (sameOrder) {
    rows.forEach((r, i) => {
      r.innerHTML = cellHtml(items[i]);
    });
  } else {
    // 整体重建会连同详情块一起销毁，落位放到重建之后
    el.innerHTML = items
      .map(
        (s) =>
          `<div class="row" data-code="${esc(s.code)}">${cellHtml(s)}</div>`,
      )
      .join("");
    rows = [...el.querySelectorAll<HTMLElement>(".row")];
  }
  // 收起展开行与整体重建都会留下多余的详情块，先清掉再把当前详情块落位
  for (const d of el.querySelectorAll(".detail")) {
    if (d !== open?.block.element) d.remove();
  }
  const row = rows.find((r) => r.dataset.code === openCode) ?? null;
  open?.block.attachAfter(row);
}
