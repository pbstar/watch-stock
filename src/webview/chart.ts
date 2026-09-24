// 迷你分时图 + 成交量柱（SVG）：细线无面积、无坐标框，仅昨收虚线
import type { MinutePoint } from "../shared/protocol";
import { fmtVol } from "./format";

const PRICE_H = 64;
const VOL_H = 24;
const GAP = 4;
const HEIGHT = PRICE_H + GAP + VOL_H;

interface ChartCtx {
  data: MinutePoint[];
  preClose: number;
  dec: number;
  width: number;
}

// 累计成交量 → 分钟成交量
function minuteVolumes(data: MinutePoint[]): number[] {
  let prev = 0;
  return data.map((d) => {
    if (d.volume == null) return 0;
    const v = Math.max(0, d.volume - prev);
    prev = d.volume;
    return v;
  });
}

function xOf(ctx: ChartCtx, i: number): number {
  return (i / Math.max(ctx.data.length - 1, 1)) * ctx.width;
}

// 价格折线（遇 null 断开）
function pricePath(ctx: ChartCtx): string {
  const prices = ctx.data.flatMap((d) => (d.price == null ? [] : [d.price]));
  const dev =
    Math.max(...prices.map((p) => Math.abs(p - ctx.preClose)), ctx.preClose * 0.005) * 1.1;
  const yOf = (p: number) => ((ctx.preClose + dev - p) / (dev * 2)) * PRICE_H;
  let path = "";
  let pen = "M";
  ctx.data.forEach((d, i) => {
    if (d.price == null) {
      pen = "M";
      return;
    }
    path += `${pen}${xOf(ctx, i).toFixed(1)},${yOf(d.price).toFixed(1)}`;
    pen = "L";
  });
  return path;
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
function hoverText(ctx: ChartCtx, i: number, vols: number[]): string {
  const d = ctx.data[i];
  const t = d.time.slice(-5);
  if (d.price == null) return `${t} -`;
  const pct = ((d.price - ctx.preClose) / ctx.preClose) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${t} ${d.price.toFixed(ctx.dec)} ${sign}${pct.toFixed(2)}% 量${fmtVol(vols[i])}`;
}

// 渲染到容器；onHover 传 null 表示离开
export function renderChart(
  el: HTMLElement,
  data: MinutePoint[],
  preClose: number,
  dec: number,
  onHover: (text: string | null) => void,
): void {
  const width = el.clientWidth;
  if (!data.some((d) => d.price != null) || !preClose || width < 10) {
    el.innerHTML = '<div class="dim">暂无分时</div>';
    return;
  }
  const ctx: ChartCtx = { data, preClose, dec, width };
  const vols = minuteVolumes(data);
  const pcY = PRICE_H / 2;
  const last = [...data].reverse().find((d) => d.price != null)!.price!;
  el.innerHTML = `<svg height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" preserveAspectRatio="none">
    <line class="pre-close" x1="0" y1="${pcY}" x2="${width}" y2="${pcY}"/>
    <path class="${last >= preClose ? "line-up" : "line-dn"}" d="${pricePath(ctx)}"/>
    ${volumeBars(ctx, vols)}
  </svg><div class="cursor"></div>`;
  bindHover(el, ctx, vols, onHover);
}

function bindHover(
  el: HTMLElement,
  ctx: ChartCtx,
  vols: number[],
  onHover: (text: string | null) => void,
): void {
  const cursor = el.querySelector<HTMLElement>(".cursor")!;
  el.onmousemove = (e) => {
    const x = e.clientX - el.getBoundingClientRect().left;
    const n = ctx.data.length;
    const i = Math.max(0, Math.min(n - 1, Math.round((x / ctx.width) * (n - 1))));
    cursor.style.left = `${xOf(ctx, i)}px`;
    cursor.style.display = "block";
    onHover(hoverText(ctx, i, vols));
  };
  el.onmouseleave = () => {
    cursor.style.display = "none";
    onHover(null);
  };
}
