// 板块网格：按涨幅排序，等宽流式排布
import type { SectorItem } from "../shared/protocol";
import { dirClass, esc, signed } from "./format";

export function renderSector(el: HTMLElement, items: SectorItem[]): void {
  if (!items.length) {
    el.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const sorted = [...items].sort(
    (a, b) => Number(b.changePercent) - Number(a.changePercent),
  );
  el.innerHTML = `<div class="grid">${sorted
    .map(
      (s) =>
        `<div class="cell"><span>${esc(s.name)}</span><span class="${dirClass(s.changePercent)}">${esc(signed(s.changePercent, "%"))}</span></div>`,
    )
    .join("")}</div>`;
}
