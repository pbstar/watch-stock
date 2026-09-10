// webview DOM 契约：元素 id 的唯一来源
// stockHome.html 必须定义这里列出的全部 id，
// 避免宿主模板与脚本两侧的 id 各写一份、改名后只有运行期才炸。
export const ELEMENT_IDS = {
  tabBar: "tab-bar",
  overviewPane: "overview-pane",
  detailPane: "detail-pane",
  indexTitle: "index-title",
  indexTable: "index-table",
  refreshIndex: "refresh-index",
  industryTitle: "industry-title",
  industryFlow: "industry-flow",
  refreshIndustry: "refresh-industry",
  detailText: "detail-text",
  refreshDetail: "refresh-detail",
  chartWrap: "chart-wrap",
  chartPlot: "chart-plot",
  chartAxis: "chart-axis",
  chartVolume: "chart-volume",
  chartSummary: "chart-summary",
} as const;
