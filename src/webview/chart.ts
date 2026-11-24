// 迷你分时图 + 成交量柱（SVG）：细线无面积、无坐标框，仅昨收与均价两条虚线
import type { MinutePoint } from "../shared/protocol";
import { formatMoney, formatVolume, signed } from "../shared/format";

const PRICE_H = 100;
const VOL_H = 24;
const GAP = 4;
const HEIGHT = PRICE_H + GAP + VOL_H;

// 各图表容器当前的鼠标横坐标（未悬停为 undefined），用于重画后恢复游标与读数
const hoverX = new WeakMap<HTMLElement, number>();

interface ChartCtx {
  data: MinutePoint[];
  preClose: number;
  dec: number;
  width: number;
}

// 累计值 → 每分钟增量：成交量（手）与成交额（元）共用
function minuteDeltas(
  data: MinutePoint[],
  pick: (d: MinutePoint) => number | null,
): number[] {
  let prev = 0;
  return data.map((d) => {
    const cur = pick(d);
    if (cur == null) return 0;
    const v = Math.max(0, cur - prev);
    prev = cur;
    return v;
  });
}

function xOf(ctx: ChartCtx, i: number): number {
  return (i / Math.max(ctx.data.length - 1, 1)) * ctx.width;
}

// 分钟点上的分时均价（当日累计成交额 ÷ 累计成交量，手折股）；无量时为空
function avgOf(d: MinutePoint): number | null {
  if (d.volume == null || d.amount == null || d.volume <= 0) return null;
  const v = d.amount / (d.volume * 100);
  return v > 0 ? v : null;
}

// 折线路径（遇 null 断开），价格与均价共用
function linePath(
  ctx: ChartCtx,
  values: (number | null)[],
  yOf: (v: number) => number,
): string {
  let path = "";
  let pen = "M";
  values.forEach((v, i) => {
    if (v == null) {
      pen = "M";
      return;
    }
    path += `${pen}${xOf(ctx, i).toFixed(1)},${yOf(v).toFixed(1)}`;
    pen = "L";
  });
  return path;
}

// 价格 → y 坐标：以昨收为中心，半幅取当日最大偏离（最小正负 0.5%）并留 10% 余量
function makeYOf(preClose: number, prices: number[]): (p: number) => number {
  const dev =
    Math.max(...prices.map((p) => Math.abs(p - preClose)), preClose * 0.005) * 1.1;
  return (p) => ((preClose + dev - p) / (dev * 2)) * PRICE_H;
}

// 成交量柱：按分钟涨跌区分，颜色/透明度由样式类控制（CSP 禁止内联 style）
function volumeBars(ctx: ChartCtx, vols: number[]): string {
  const max = Math.max(...vols, 1);
  const barW = Math.max(1, (ctx.width / ctx.data.length) * 0.7);
  return ctx.data
    .map((d, i) => {
      if (!vols[i]) return "";
      const prev = ctx.data[i - 1]?.price ?? d.price ?? 0;
      const up = (d.price ?? 0) >= prev;
      const h = Math.max(1, (vols[i] / max) * VOL_H);
      const y = HEIGHT - h;
      return `<rect class="${up ? "vol-up" : "vol-dn"}" x="${(xOf(ctx, i) - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"/>`;
    })
    .join("");
}

// 悬停时刻的说明文本
function hoverText(
  ctx: ChartCtx,
  i: number,
  vols: number[],
  amounts: number[],
  withAvg: boolean,
): string {
  const d = ctx.data[i];
  const t = d.time.slice(-5);
  if (d.price == null) return `${t} -`;
  const pct = ((d.price - ctx.preClose) / ctx.preClose) * 100;
  const avg = withAvg ? avgOf(d) : null;
  const avgText = avg == null ? "" : ` 均${avg.toFixed(ctx.dec)}`;
  return `${t} ${d.price.toFixed(ctx.dec)} ${signed(pct.toFixed(2), "%")}${avgText} 量${formatVolume(vols[i])} 额${formatMoney(amounts[i])}`;
}

// 渲染到容器；withAvg 控制均价虚线（指数均价与点位不同量纲，不画）；onHover 传 null 表示离开
export function renderChart(
  el: HTMLElement,
  data: MinutePoint[],
  preClose: number,
  dec: number,
  withAvg: boolean,
  onHover: (text: string | null) => void,
): void {
  // 宽度取自容器（style.css 中 .chart 的固定宽度）
  const width = el.clientWidth;
  // 停牌或非交易时段的点没有价格，单独取有效价格点供折线与判定复用
  const prices = data.flatMap((d) => (d.price == null ? [] : [d.price]));
  if (!prices.length || !preClose || width < 10) {
    el.innerHTML = '<div class="dim">暂无分时</div>';
    el.onmousemove = el.onmouseleave = null;
    hoverX.delete(el);
    onHover(null);
    return;
  }
  const ctx: ChartCtx = { data, preClose, dec, width };
  const vols = minuteDeltas(data, (d) => d.volume);
  const amounts = minuteDeltas(data, (d) => d.amount);
  const yOf = makeYOf(preClose, prices);
  const avgPath = withAvg ? linePath(ctx, data.map(avgOf), yOf) : "";
  const pcY = PRICE_H / 2;
  const last = prices[prices.length - 1];
  el.innerHTML = `<svg width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">
    <line class="pre-close" x1="0" y1="${pcY}" x2="${width}" y2="${pcY}"/>
    <path class="${last >= preClose ? "line-up" : "line-dn"}" d="${linePath(ctx, data.map((d) => d.price), yOf)}"/>
    ${avgPath ? `<path class="avg-line" d="${avgPath}"/>` : ""}
    ${volumeBars(ctx, vols)}
  </svg><div class="cursor"></div>`;
  bindHover(el, ctx, vols, amounts, withAvg, onHover);
}

function bindHover(
  el: HTMLElement,
  ctx: ChartCtx,
  vols: number[],
  amounts: number[],
  withAvg: boolean,
  onHover: (text: string | null) => void,
): void {
  const cursor = el.querySelector<HTMLElement>(".cursor")!;
  const show = (x: number) => {
    const n = ctx.data.length;
    const i = Math.max(0, Math.min(n - 1, Math.round((x / ctx.width) * (n - 1))));
    cursor.style.left = `${xOf(ctx, i)}px`;
    cursor.style.display = "block";
    onHover(hoverText(ctx, i, vols, amounts, withAvg));
  };
  el.onmousemove = (e) => {
    const x = e.clientX - el.getBoundingClientRect().left;
    hoverX.set(el, x);
    show(x);
  };
  el.onmouseleave = () => {
    hoverX.delete(el);
    cursor.style.display = "none";
    onHover(null);
  };
  // 数据刷新重画时鼠标仍停在图上：按原位置恢复，读数随新数据更新
  const x = hoverX.get(el);
  if (x !== undefined) show(x);
}
