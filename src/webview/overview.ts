// A 股全览（大盘指数 + 行业板块）的终端文本渲染
// 纯函数：输出可直接塞进 <pre> 的文本
import type { IndustryItem, Stock } from "../types";
import { INDENT, displayWidth, fmtPercent, padToWidth } from "./format";

/** 指数表每行放几组「名称 价格 涨跌幅」 */
const INDEX_COLUMNS = 2;
/** 组内左侧名称列、价格列的最小宽度（中文占 2 列，按显示宽度补） */
const NAME_WIDTH = 10;
const VALUE_WIDTH = 9;
/** 同组内名称与价格之间的留白 */
const CELL_GAP = 2;

function percentValue(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

/** 指数：定宽列对齐的文本表，每行 INDEX_COLUMNS 组 */
export function renderIndexTable(list: readonly Stock[]): string {
  if (!list.length) return INDENT + "暂无数据";

  const cells = list.map(
    (item) =>
      padToWidth(item.name || "-", NAME_WIDTH) +
      " ".repeat(CELL_GAP) +
      padToWidth(item.current || "-", VALUE_WIDTH) +
      fmtPercent(item.changePercent),
  );
  // 列宽取实际最大值，个别超长名称不会顶掉右侧的组
  const cellWidth = Math.max(...cells.map(displayWidth));

  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += INDEX_COLUMNS) {
    const row: string[] = [];
    for (let k = 0; k < INDEX_COLUMNS; k++) {
      const cell = cells[i + k];
      if (cell === undefined) break;
      row.push(
        k === INDEX_COLUMNS - 1 ? cell : padToWidth(cell, cellWidth + CELL_GAP),
      );
    }
    rows.push(INDENT + row.join(""));
  }
  return rows.join("\n");
}

/** 行业：按涨幅降序的空格分隔流，靠 CSS 的 pre-wrap 自动折行 */
export function renderIndustryFlow(list: readonly IndustryItem[]): string {
  if (!list.length) return INDENT + "暂无数据";
  const sorted = [...list].sort(
    (a, b) => percentValue(b.changePercent) - percentValue(a.changePercent),
  );
  return (
    INDENT +
    sorted
      .map((item) => (item.name || "-") + " " + fmtPercent(item.changePercent))
      .join(" ".repeat(2))
  );
}
