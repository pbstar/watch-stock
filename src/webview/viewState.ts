// 面板界面状态：只有 tab 跨面板重建保留，展开行与排行方向每次重来
import type {
  FlowRowItem,
  RankDir,
  RowItem,
  SectorItem,
  Tab,
} from "../shared/protocol";
import type { OpenRow } from "./list";

// 写进面板状态的字段，webview 重建时由 VS Code 原样送回
export interface PersistentState {
  tab: Tab;
}

// 每个列表自成一份：数据与自己的刷新时刻一同更新，互不影响
export interface ListData<T> {
  items: T[];
  time: string;
}

export interface PanelData {
  mine: ListData<RowItem>;
  index: ListData<RowItem>;
  sector: ListData<SectorItem>;
  rank: {
    up: ListData<RowItem>;
    down: ListData<RowItem>;
    inflow: ListData<FlowRowItem>;
    outflow: ListData<FlowRowItem>;
  };
}

export interface ViewState {
  tab: Tab;
  rankDir: RankDir;
  data: PanelData;
  // 展开行与它的详情块同生共死，不会出现展开行还在、块已丢的中间态
  open: OpenRow | null;
}

function emptyList<T>(): ListData<T> {
  return { items: [], time: "" };
}

export function createViewState(tab: Tab): ViewState {
  return {
    tab,
    // 排行方向不持久化，每次进「排行」都从涨幅榜开始
    rankDir: "up",
    data: {
      mine: emptyList(),
      index: emptyList(),
      sector: emptyList(),
      rank: {
        up: emptyList(),
        down: emptyList(),
        inflow: emptyList(),
        outflow: emptyList(),
      },
    },
    open: null,
  };
}
