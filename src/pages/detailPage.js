const { generateKLineChart } = require("../utils/kLinePic");
const { getStockMinuteData } = require("../services/stockService");

/**
 * 生成股票详情页 HTML 内容
 * @param {Object} stock - 股票信息对象
 * @returns {Promise<string>} HTML 字符串
 */
async function getDetailPageHtml(stock) {
  let timelineChart = { mainChart: "", yLabels: "" };

  try {
    // 获取真实分时数据(240条)
    const rawMinuteData = await getStockMinuteData(stock.code, 240);

    // 转换分时数据格式
    const minuteData = Array.isArray(rawMinuteData)
      ? rawMinuteData.map((item) => ({
          price: parseFloat(item.price || item.close),
          volume: parseFloat(item.volume || 0),
        }))
      : [];

    // 生成分时图 SVG
    if (minuteData.length > 0) {
      timelineChart = generateKLineChart(minuteData, {
        height: 500,
        type: "timeline",
        showVolume: true,
        fixedWidth: 1100, // 分时图使用固定宽度
      });
    }
  } catch (error) {
    console.error("获取股票数据失败:", error);
    // 接口失败时保持空图表
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>股票详情 - ${stock.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 24px;
      line-height: 1.6;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      margin-bottom: 24px;
    }

    .stock-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-font-family);
    }

    .price-info {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-family: var(--vscode-editor-font-family);
    }

    .current-price {
      font-size: 14px;
      font-weight: 400;
      color: var(--vscode-editor-foreground);
    }

    .change {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .rise {
      color: var(--vscode-charts-red);
    }

    .fall {
      color: var(--vscode-charts-green);
    }



    .chart-container {
      margin-bottom: 16px;
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 0;
      padding: 8px;
      background-color: var(--vscode-editor-background);
      position: relative;
    }

    .chart-wrapper {
      display: flex;
      overflow-y: hidden;
      width: 100%;
    }

    .chart-scroll {
      flex: 1;
      overflow-y: hidden;
      min-width: 0;
    }

    .chart-scroll svg {
      display: block;
      height: auto;
    }

    .ylabel-fixed {
      width: 50px;
      background-color: var(--vscode-editor-background);
      flex-shrink: 0;
      z-index: 10;
    }

    #timeline-chart .chart-scroll {
      overflow-x: hidden;
    }

    #timeline-chart .chart-scroll svg {
      max-width: 100%;
    }

    .info-section {
      margin-top: 24px;
    }

    .info-section h2 {
      font-size: 11px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--vscode-editorGroup-border);
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-family: var(--vscode-font-family);
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 8px;
      background-color: transparent;
      border-radius: 0;
      border-bottom: 1px solid var(--vscode-widget-border);
      font-size: 11px;
      font-family: var(--vscode-editor-font-family);
    }

    .info-item .label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }

    .info-item .value {
      font-weight: 400;
      color: var(--vscode-editor-foreground);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- 头部信息 -->
    <div class="header">
      <h1 class="stock-name">${stock.name} (${stock.code})</h1>
      <div class="price-info">
        <span class="current-price">${stock.price}</span>
        <span class="change ${
          parseFloat(stock.percent) >= 0 ? "rise" : "fall"
        }">
          ${stock.updown} (${stock.percent})
        </span>
      </div>
    </div>

    <!-- 分时图容器 -->
    <div class="chart-container" id="timeline-chart">
      <div class="chart-wrapper">
        <div class="chart-scroll">
          ${timelineChart.mainChart}
        </div>
        <div class="ylabel-fixed">
          ${timelineChart.yLabels}
        </div>
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="info-section">
      <h2>基本信息</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">今开:</span>
          <span class="value">${stock.open || "--"}</span>
        </div>
        <div class="info-item">
          <span class="label">昨收:</span>
          <span class="value">${stock.yestclose || "--"}</span>
        </div>
        <div class="info-item">
          <span class="label">最高:</span>
          <span class="value">${stock.high || "--"}</span>
        </div>
        <div class="info-item">
          <span class="label">最低:</span>
          <span class="value">${stock.low || "--"}</span>
        </div>
        <div class="info-item">
          <span class="label">成交量:</span>
          <span class="value">${stock.volume || "--"}</span>
        </div>
        <div class="info-item">
          <span class="label">成交额:</span>
          <span class="value">${stock.amount || "--"}</span>
        </div>
      </div>
    </div>
  </div>


</body>
</html>`;
}

module.exports = {
  getDetailPageHtml,
};
