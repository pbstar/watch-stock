// 展开行详情块：指标 + 悬停读数 + 分时图，创建、更新、落位与绘制都由本类自理
import type { DetailQuote, MinutePoint } from "../shared/protocol";
import { decOf, formatMoney, formatVolume } from "../shared/format";
import { renderChart } from "./chart";
import { fmtNum } from "./format";

export interface DetailData {
  quote: DetailQuote | null;
  minute: MinutePoint[];
}

// compact 为精简模式（指数）：指数无换手、市盈等个股指标，只保留行情与成交
function metricsHtml(q: DetailQuote, compact: boolean): string {
  const d = decOf(q.isETF);
  const items: [string, string][] = [
    ["今开", fmtNum(q.open, d)],
    ["最高", fmtNum(q.high, d)],
    ["最低", fmtNum(q.low, d)],
    ["量", formatVolume(q.volume)],
    ["额", formatMoney(q.amount)],
  ];
  if (!compact) {
    items.push(
      ["换手", q.turnoverRatio ? `${fmtNum(q.turnoverRatio)}%` : "-"],
      ["量比", fmtNum(q.volumeRatio)],
      ["市盈", q.pe ? fmtNum(q.pe) : "-"],
      ["市值", formatMoney(q.totalMarket)],
    );
  }
  return items.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join("");
}

export class DetailBlock {
  readonly element: HTMLElement;
  private data: DetailData | undefined;
  // 已画进图表的数据，与 data 比对决定是否需要重画
  private drawn: DetailData | undefined;

  constructor(private readonly compact: boolean) {
    this.element = document.createElement("div");
    this.element.className = "detail";
    this.element.innerHTML = `<div class="metrics"><span class="info">加载中</span></div>
    <div class="hover"></div>
    <div class="chart"></div>`;
  }

  // 数据到达：先更新指标文字再画图，悬停读数与鼠标事件不受影响
  update(data: DetailData | undefined): void {
    this.data = data;
    const info = this.element.querySelector<HTMLElement>(".info")!;
    if (!data) info.innerHTML = "加载中";
    else if (!data.quote) info.innerHTML = "暂无数据";
    else info.innerHTML = metricsHtml(data.quote, this.compact);
    this.draw();
  }

  // 落位到展开行之后；row 为 null（展开行已不在列表里）时移除
  attachAfter(row: HTMLElement | null): void {
    if (!row) {
      this.element.remove();
      return;
    }
    if (row.nextElementSibling !== this.element) row.after(this.element);
    this.draw();
  }

  // 已挂载且换了一份新数据才真正重画：未挂载期间到达的分时留到挂载后补画，
  // 列表重建搬动详情块时节点内容未丢，不重复绘制
  private draw(): void {
    const data = this.data;
    const quote = data?.quote;
    if (!data || !quote || data === this.drawn || !this.element.isConnected) {
      return;
    }
    const hover = this.element.querySelector<HTMLElement>(".hover")!;
    const chart = this.element.querySelector<HTMLElement>(".chart")!;
    renderChart(
      chart,
      data.minute,
      Number(quote.close),
      decOf(quote.isETF),
      (text) => {
        hover.textContent = text ?? "";
      },
    );
    this.drawn = data;
  }
}
