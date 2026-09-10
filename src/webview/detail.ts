// 个股详情头部的终端文本渲染
// 采用终端的 kv 文本块；列宽按实际显示宽度动态取值，长数值（成交 842.00万）不会挤掉右侧列
import type { StockOverview, StockQuote } from "../types";
import {
  INDENT,
  displayWidth,
  fmtMoney,
  fmtNumber,
  fmtPercent,
  fmtRatio,
  fmtSigned,
  fmtVolume,
  padToWidth,
} from "./format";

/** 相邻两列之间的留白 */
const COLUMN_GAP = 2;

function buildCells(quote: StockQuote, digits: number): string[][] {
  const kv = (label: string, value: string): string => label + " " + value;
  return [
    [
      kv("今开", fmtNumber(quote.open, digits)),
      kv("最高", fmtNumber(quote.high, digits)),
      kv("最低", fmtNumber(quote.low, digits)),
      kv("昨收", fmtNumber(quote.close, digits)),
    ],
    [
      kv("成交", fmtVolume(quote.volume)),
      kv("额", fmtMoney(quote.amount)),
      kv("换手", fmtRatio(quote.turnoverRatio)),
      kv("量比", fmtRatio(quote.volumeRatio, "")),
    ],
    [
      kv("市盈", fmtNumber(quote.pe)),
      kv("市净", fmtNumber(quote.pb)),
      kv("总市值", fmtMoney(quote.totalMarket)),
      kv("流值", fmtMoney(quote.circulationMarket)),
    ],
  ];
}

/** 三行 kv 指标块，列宽取各列最大显示宽度 */
function renderQuoteTable(quote: StockQuote, digits: number): string {
  const rows = buildCells(quote, digits);
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, displayWidth(cell));
    });
  }
  return rows
    .map(
      (row) =>
        INDENT +
        row
          .map((cell, index) =>
            index === row.length - 1 ? cell : padToWidth(cell, widths[index] + COLUMN_GAP),
          )
          .join(""),
    )
    .join("\n");
}

/** 终端提示符风格的头部摘要：❯ 代码 名称 现价 涨跌幅 (涨跌值) 时间 */
function renderQuoteHead(
  info: StockOverview,
  quote: StockQuote | null,
): string {
  const digits = info.isETF ? 3 : 2;
  const price = fmtNumber(quote ? quote.current : info.current, digits);
  const summary =
    "❯ " +
    info.code.toLowerCase() +
    " " +
    (info.displayName || info.name) +
    " " +
    price +
    " " +
    fmtPercent(info.changePercent) +
    " (" +
    fmtSigned(info.changeValue, digits) +
    ")" +
    (info.dateTime ? " " + info.dateTime : "");
  return summary;
}

/** 详情页完整头部文本：摘要行 + 空行 + kv 指标块 */
export function renderDetailHeader(
  info: StockOverview | null,
  quote: StockQuote | null,
): string {
  if (!info) return "加载中…";
  const head = renderQuoteHead(info, quote);
  if (!quote) return head;
  return head + "\n\n" + renderQuoteTable(quote, info.isETF ? 3 : 2);
}
