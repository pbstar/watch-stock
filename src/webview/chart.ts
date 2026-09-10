// 分时走势的终端渲染核心
// 纯函数、零 DOM 依赖：输入分时序列与列宽，输出四段纯文本（走势 / 时间轴 / 成交量 / 汇总），
// 由 app.ts 负责塞进对应的 <pre>。
import type { MinutePoint } from "../types";
import {
  INDENT,
  fmtMoney,
  fmtNumber,
  fmtPercent,
  fmtVolume,
  padToWidth,
} from "./format";

/** 走势区行数 */
const CHART_ROWS = 8;
/** 列数下限：低于此值改为横向滚动，不把曲线挤压变形 */
const MIN_COLUMNS = 60;
/** 左轴价格标签 + ┤ 预留的列数 */
const AXIS_RESERVE = 8;
/** 成交量块字符（由低到高） */
const BLOCKS = "▁▂▃▄▅▆▇█";
/** 时间轴刻度 */
const TIME_MARKS = ["10:00", "11:00", "13:30", "14:30"];
/** 盒绘制线拐角字符，同行走平补线时需要保留 */
const CORNERS = "╭╮╰╯";

export interface ChartOptions {
  /** 走势区列数（由面板宽度与等宽字符宽度折算） */
  columns: number;
  /** 昨收价，作为纵轴中心与基准线 */
  preClose: number;
  /** 价格小数位（ETF 为 3） */
  digits: number;
}

/** 终端化的分时图：四段文本各自对应一个 <pre>，逐列对齐 */
export interface TerminalChart {
  plot: string;
  axis: string;
  volume: string;
  summary: string;
  /** 无数据时为 true，由调用方置为次要色 */
  empty: boolean;
}

interface Bucket {
  /** 桶内末点价格（收盘语义），空桶为 null */
  price: number | null;
  high: number;
  low: number;
  /** 桶内增量成交量 */
  volume: number;
  time: string | null;
}

/** 面板可用宽度（px）折算成列数；低于下限时给最小列数，交由 CSS 横向滚动 */
export function columnsFor(wrapWidthPx: number, charWidthPx: number): number {
  const charWidth = charWidthPx > 0 ? charWidthPx : 8;
  return Math.max(MIN_COLUMNS, Math.floor(wrapWidthPx / charWidth) - AXIS_RESERVE);
}

/** '10:30' → 全天连续分钟槽位（上午 9:30-11:30 为 0-120，下午 13:00-15:00 为 121-241） */
function slotIndex(hhmm: string): number {
  const minutes = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return minutes <= 690 ? minutes - 570 : 121 + minutes - 780;
}

/** 分桶降采样：每桶取末点价格 + 桶内最高/最低 + 增量成交量 */
function bucketize(
  data: readonly MinutePoint[],
  columns: number,
): Bucket[] {
  const buckets: Bucket[] = [];
  let previousCumulative = 0;
  for (let b = 0; b < columns; b++) {
    const from = Math.floor((b * data.length) / columns);
    const to = Math.floor(((b + 1) * data.length) / columns) - 1;
    let price: number | null = null;
    let high = -Infinity;
    let low = Infinity;
    let cumulative = previousCumulative;
    let time: string | null = null;
    for (let i = from; i <= to; i++) {
      const point = data[i];
      if (point.price != null) {
        price = point.price;
        time = point.time;
        if (point.price > high) high = point.price;
        if (point.price < low) low = point.price;
      }
      if (point.volume != null) cumulative = point.volume;
    }
    buckets.push({
      price,
      high,
      low,
      volume: Math.max(0, cumulative - previousCumulative),
      time,
    });
    previousCumulative = cumulative;
  }
  return buckets;
}

/** 折线绘制：拐角按上下段方向取 ╭ ╮ ╰ ╯，跨行补 │；全部覆盖写入，走势线盖住昨收基准线 */
function drawPolyline(
  buffer: string[][],
  buckets: readonly Bucket[],
  columns: number,
  rowOf: (price: number) => number,
): void {
  const put = (row: number, col: number, glyph: string): void => {
    if (row >= 0 && row < CHART_ROWS && col >= 0 && col < columns) {
      buffer[row][col] = glyph;
    }
  };
  let previousRow = -1;
  let previousCol = -1;
  for (let col = 0; col < columns; col++) {
    const price = buckets[col].price;
    if (price == null) {
      previousRow = -1;
      continue;
    }
    const row = rowOf(price);
    if (previousRow === -1) {
      put(row, col, "─");
    } else if (row === previousRow) {
      // 同行走平：补线时保留上一列已落笔的拐角，否则「台阶后平走」的弧线会断
      for (let k = previousCol; k <= col; k++) {
        if (k === previousCol && CORNERS.includes(buffer[row][k])) continue;
        put(row, k, "─");
      }
    } else if (row > previousRow) {
      // 下行：左 ╮ 右 ╯
      put(previousRow, previousCol, "╮");
      put(row, col, "╯");
      for (let k = previousCol + 1; k < col; k++) put(row, k, "─");
      for (let k = previousRow + 1; k < row; k++) put(k, col, "│");
    } else {
      // 上行：左 ╰ 右 ╭
      put(previousRow, previousCol, "╰");
      put(row, col, "╭");
      for (let k = previousCol + 1; k < col; k++) put(row, k, "─");
      for (let k = row + 1; k < previousRow; k++) put(k, col, "│");
    }
    previousRow = row;
    previousCol = col;
  }
}

/** 在全日极值所在列附近找个空格放 ▲/▼：先朝远离基准线的方向找，找不到再反向 */
function placeMarker(
  buffer: string[][],
  row: number,
  col: number,
  glyph: string,
  preferUp: boolean,
): void {
  for (const direction of preferUp ? [-1, 1] : [1, -1]) {
    for (let step = 1; step < CHART_ROWS; step++) {
      const r = row + direction * step;
      if (r < 0 || r >= CHART_ROWS) break;
      if (buffer[r][col] === " ") {
        buffer[r][col] = glyph;
        return;
      }
    }
  }
}

/** 渲染分时图；无可用数据时 plot 为终端化占位文案 */
export function renderChart(
  data: readonly MinutePoint[],
  options: ChartOptions,
): TerminalChart {
  const { preClose, digits } = options;
  const columns = Math.max(1, Math.floor(options.columns));
  const prices = data
    .map((point) => point.price)
    .filter((price): price is number => price != null);

  if (!data.length || !prices.length || !Number.isFinite(preClose) || preClose <= 0) {
    return {
      plot: INDENT + (data.length ? "今日暂无分时数据" : "等待分时数据…"),
      axis: "",
      volume: "",
      summary: "",
      empty: true,
    };
  }

  const format = (price: number): string => fmtNumber(price, digits);
  const buckets = bucketize(data, columns);

  const highest = Math.max(...prices);
  const lowest = Math.min(...prices);
  // 纵轴关于昨收对称，保证昨收基准线永远落在图中间偏合理的位置
  const deviation = Math.max(
    highest - preClose,
    preClose - lowest,
    preClose * 0.005,
  );
  const axisMax = preClose + deviation;
  const axisMin = preClose - deviation;
  const rowOf = (price: number): number =>
    Math.max(
      0,
      Math.min(
        CHART_ROWS - 1,
        Math.round(((axisMax - price) / (axisMax - axisMin)) * (CHART_ROWS - 1)),
      ),
    );

  // 昨收基准线先铺底，走势线经过处自然覆盖
  const buffer: string[][] = Array.from({ length: CHART_ROWS }, () =>
    new Array<string>(columns).fill(" "),
  );
  const preCloseRow = rowOf(preClose);
  for (let col = 0; col < columns; col++) buffer[preCloseRow][col] = "─";
  drawPolyline(buffer, buckets, columns, rowOf);

  const validColumns = buckets
    .map((bucket, col) => (bucket.price != null ? col : -1))
    .filter((col) => col >= 0);
  const extremeColumn = (wantHigh: boolean): number => {
    let best = validColumns[0];
    for (const col of validColumns) {
      const bucket = buckets[col];
      if (wantHigh ? bucket.high > buckets[best].high : bucket.low < buckets[best].low) {
        best = col;
      }
    }
    return best;
  };
  const highColumn = extremeColumn(true);
  const lowColumn = extremeColumn(false);
  placeMarker(buffer, rowOf(highest), highColumn, "▲", true);
  placeMarker(buffer, rowOf(lowest), lowColumn, "▼", false);

  const labelWidth = Math.max(format(highest).length, format(lowest).length);
  const highestRow = rowOf(highest);
  const lowestRow = rowOf(lowest);
  const plotLines: string[] = [];
  for (let row = 0; row < CHART_ROWS; row++) {
    // 窄幅横盘时最高/最低可能落在同一行，此时只标最高价避免串行
    const label =
      row === highestRow
        ? format(highest)
        : row === lowestRow && lowestRow !== highestRow
          ? format(lowest)
          : "";
    let line = INDENT + padToWidth(label, labelWidth) + "┤" + buffer[row].join("");
    if (row === preCloseRow) {
      line += " ".repeat(3) + "昨收 " + format(preClose);
    }
    plotLines.push(line);
  }

  // 时间轴：只标已走到时段的刻度，未到的时段不预留
  const lastIndex = data.reduce(
    (acc, point, index) => (point.price != null ? index : acc),
    0,
  );
  const axisCells = new Array<string>(columns + 2).fill("─");
  axisCells[0] = "└";
  axisCells[columns + 1] = "┘";
  let occupied = 0;
  for (const mark of TIME_MARKS) {
    if (slotIndex(mark) > lastIndex) break;
    const col = Math.round((slotIndex(mark) / lastIndex) * (columns - 1));
    const at = Math.max(1, Math.min(columns - 5, col - 2));
    if (at <= occupied) continue;
    for (let i = 0; i < mark.length; i++) axisCells[at + i] = mark[i];
    occupied = at + mark.length;
  }

  const maxVolume = Math.max(1, ...buckets.map((bucket) => bucket.volume));
  const histogram = buckets
    .map((bucket) =>
      bucket.volume > 0
        ? BLOCKS[Math.min(BLOCKS.length - 1, Math.floor((bucket.volume / maxVolume) * BLOCKS.length))]
        : " ",
    )
    .join("");

  // 腾讯字段为累计值：回扫最后一个有值槽，避免尾部落 empty 槽把累计量读成 null
  const lastPoint = [...data].reverse().find((point) => point.volume != null);
  const lastBucket = [...buckets].reverse().find((bucket) => bucket.price != null);
  const lastPrice = lastBucket?.price ?? highest;
  const percent = fmtPercent(((lastPrice - preClose) / preClose) * 100);

  return {
    plot: plotLines.join("\n"),
    // 底轴 └ 与走势区左轴 ┤ 同列（缩进 labelWidth 而非 labelWidth+1）
    axis: INDENT + " ".repeat(labelWidth) + axisCells.join(""),
    volume:
      INDENT +
      padToWidth("成交", labelWidth + 1) +
      histogram +
      " ".repeat(3) +
      "计 " +
      fmtVolume(lastPoint?.volume) +
      " ".repeat(3) +
      "额 " +
      fmtMoney(lastPoint?.amount),
    summary:
      INDENT +
      (lastBucket?.time ? lastBucket.time.slice(-5) + " " : "") +
      format(lastPrice) +
      " " +
      percent,
    empty: false,
  };
}
