// 应用状态定义与初始化
import { StatusBarManager } from "./ui/statusBar";

export interface AppState {
  statusBar: StatusBarManager;
  userForced: boolean | null; // null=跟随市场 true=强制显示 false=强制隐藏
  refreshTimer: NodeJS.Timeout | null;
}

// 创建并初始化应用状态
export function createAppState(): AppState {
  const state: AppState = {
    statusBar: new StatusBarManager(),
    userForced: null,
    refreshTimer: null,
  };
  state.statusBar.initialize();
  return state;
}
