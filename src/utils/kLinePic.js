/**
 * 分时图生成工具
 * 支持分时图和成交量图的绘制
 */

/**
 * 生成分时图SVG
 * @param {Array} data - 分时数据数组
 * @param {Object} options - 配置选项
 * @returns {Object} 包含主图和Y轴标签的对象 {mainChart: string, yLabels: string}
 */
function generateKLineChart(data, options = {}) {
  const {
    height = 500,
    type = "timeline",
    showVolume = true,
    barWidth = 20,
    fixedWidth = null,
  } = options;

  // 如果指定了固定宽度则使用固定宽度,否则根据数据量自动计算
  const width = fixedWidth || Math.max(data.length * barWidth + 60, 800);

  const chartHeight = showVolume ? height * 0.7 : height;
  const volumeHeight = showVolume ? height * 0.3 : 0;
  const padding = { top: 20, right: 50, bottom: 20, left: 10 };

  // 计算价格范围
  const prices = data.map((d) => d.price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice;

  // 计算成交量范围
  const maxVolume = Math.max(...data.map((d) => d.volume || 0));

  // 计算坐标转换函数
  const chartWidth = width - padding.left - padding.right;
  const chartInnerHeight = chartHeight - padding.top - padding.bottom;
  const volumeInnerHeight = volumeHeight - 10;

  const xStep = chartWidth / Math.max(data.length - 1, 1);

  const priceToY = (price) => {
    return (
      padding.top + chartInnerHeight * (1 - (price - minPrice) / priceRange)
    );
  };

  const volumeToY = (volume) => {
    return chartHeight + 10 + volumeInnerHeight * (1 - volume / maxVolume);
  };

  // 主图表 SVG
  let mainSvg = `<svg width="${
    width - padding.right
  }" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  mainSvg += `<rect width="${
    width - padding.right
  }" height="${height}" fill="#1e1e1e"/>`;

  // Y轴标签 SVG
  let labelSvg = `<svg width="${padding.right}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  labelSvg += `<rect width="${padding.right}" height="${height}" fill="#1e1e1e"/>`;

  // 绘制价格网格线和标签
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartInnerHeight * i) / gridLines;
    const price = maxPrice - (priceRange * i) / gridLines;
    // 网格线在主图中
    mainSvg += `<line x1="${padding.left}" y1="${y}" x2="${
      width - padding.right
    }" y2="${y}" stroke="#2a2a2a" stroke-width="0.5" stroke-dasharray="2,2"/>`;
    // 标签在固定区域
    labelSvg += `<text x="5" y="${
      y + 4
    }" fill="#666" font-size="10" font-family="monospace">${price.toFixed(
      2
    )}</text>`;
  }

  // 绘制分时图
  let pathData = "";
  data.forEach((item, index) => {
    const x = padding.left + index * xStep;
    const y = priceToY(item.price);
    pathData += index === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  mainSvg += `<path d="${pathData}" stroke="#707070" stroke-width="1.5" fill="none" opacity="0.9"/>`;

  // 绘制成交量
  if (showVolume) {
    // 成交量分隔线
    mainSvg += `<line x1="${padding.left}" y1="${chartHeight}" x2="${
      width - padding.right
    }" y2="${chartHeight}" stroke="#2a2a2a" stroke-width="0.5"/>`;

    data.forEach((item, index) => {
      const x = padding.left + index * xStep;
      const volumeY = volumeToY(item.volume || 0);
      const barWidth = Math.max(xStep * 0.6, 2);
      const barHeight = chartHeight + volumeInnerHeight + 10 - volumeY;

      const color = "#4a4a4a";

      mainSvg += `<rect x="${
        x - barWidth / 2
      }" y="${volumeY}" width="${barWidth}" height="${barHeight}" fill="${color}" opacity="0.5"/>`;
    });
  }

  mainSvg += "</svg>";
  labelSvg += "</svg>";

  return {
    mainChart: mainSvg,
    yLabels: labelSvg,
  };
}

/**
 * 生成Base64编码的SVG数据URI
 * @param {Array} data - 数据数组
 * @param {Object} options - 配置选项
 * @returns {string} Base64数据URI
 */
function generateChartDataUri(data, options = {}) {
  const svg = generateKLineChart(data, options);
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

module.exports = {
  generateKLineChart,
  generateChartDataUri,
};
