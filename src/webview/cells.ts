// 列表单元格：行情行与资金行共用前 5 列，各自只写尾列
import type { BaseRow, FlowRowItem, RowItem } from "../shared/protocol";
import { dirClass, esc, signed } from "../shared/format";

// 标记、代码、名称、现价、涨跌幅
function baseCells(row: BaseRow, marker: string): string {
  const cls = dirClass(row.changePercent);
  return `<span class="marker">${marker}</span>
    <span class="dim">${esc(row.code)}</span>
    <span class="name">${esc(row.name)}</span>
    <span class="num ${cls}">${esc(row.current)}</span>
    <span class="num ${cls}">${esc(signed(row.changePercent, "%"))}</span>`;
}

// 行情行尾列：涨跌额（同行情着色）与封单
export function quoteCells(s: RowItem, marker: string): string {
  const cls = dirClass(s.changePercent);
  return `${baseCells(s, marker)}
    <span class="num ${cls}">${esc(signed(s.changeValue))}</span>
    <span class="dim">${esc(s.lock)}</span>`;
}

// 资金行尾列：净额按进出方向着色，末列补净额占成交额比
export function flowCells(s: FlowRowItem, marker: string): string {
  return `${baseCells(s, marker)}
    <span class="num ${s.netDir}">${esc(s.netAmount)}</span>
    <span class="dim">${esc(s.netRatio)}</span>`;
}
