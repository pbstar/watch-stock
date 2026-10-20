// 按当前标签渲染面板：内容区交给列表或网格，展开行的详情块由列表负责落位
import type { ViewState } from "./viewState";
import { flowCells, quoteCells } from "./cells";
import { content, time } from "./dom";
import { renderList } from "./list";
import { renderSector } from "./sector";

// 顶栏时间只取当前列表自己的刷新时刻，与状态栏及其他列表无关
function currentTime(state: ViewState): string {
  if (state.tab === "mine") return state.data.mine.time;
  if (state.tab === "index") return state.data.index.time;
  if (state.tab === "sector") return state.data.sector.time;
  return state.data.rank[state.rankDir].time;
}

export function render(state: ViewState): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === state.tab);
  });
  document.querySelectorAll<HTMLElement>(".subtab").forEach((el) => {
    el.classList.toggle("active", el.dataset.dir === state.rankDir);
  });
  // 榜单切换只在排行标签下露出
  document.body.classList.toggle("ranking", state.tab === "rank");
  time.textContent = currentTime(state);
  if (state.tab === "sector") {
    renderSector(content, state.data.sector.items);
    return;
  }
  if (state.tab === "rank") {
    renderRank(state);
    return;
  }
  const list = state.tab === "index" ? state.data.index : state.data.mine;
  renderList(content, list.items, state.open, quoteCells);
}

// 排行子榜两套列：涨跌榜是行情行，资金榜是资金行，行内都可展开
function renderRank(state: ViewState): void {
  if (state.rankDir === "up" || state.rankDir === "down") {
    renderList(
      content,
      state.data.rank[state.rankDir].items,
      state.open,
      quoteCells,
    );
  } else {
    renderList(
      content,
      state.data.rank[state.rankDir].items,
      state.open,
      flowCells,
    );
  }
}
