/**
 * 股票数据服务
 * 获取股票实时数据，支持批量查询
 */

const { httpGet } = require("../utils/httpClient");
const { simpleDecode } = require("../utils/encoding");

/**
 * 批量获取股票信息
 * @param {string[]} codes - 股票代码数组，如 ['sh600519', 'sz000001']
 * @returns {Promise<Array>} 股票信息数组
 */
async function getStockList(codes) {
  if (!codes?.length) return [];

  try {
    const url = `https://hq.sinajs.cn/list=${codes.join(",")}`;
    const response = await httpGet(url, {
      timeout: 5000,
      responseType: "arraybuffer",
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const data = simpleDecode(response.data);
    const results = data
      .split("\n")
      .map((line) => {
        const match = line.match(/var hq_str_([^=]+)="([^"]+)"/);
        if (match?.[1] && match[2] && codes.includes(match[1].toLowerCase())) {
          return parseStockData(match[1].toLowerCase(), match[2]);
        }
        return null;
      })
      .filter(Boolean);

    return results;
  } catch (error) {
    const errorMsg = `获取股票数据失败: ${error.message}`;
    console.error(errorMsg);
    return [];
  }
}

/**
 * 解析股票数据
 * @param {string} code - 股票代码
 * @param {string} data - 原始数据字符串
 * @returns {Object|null} 解析后的股票信息
 */
function parseStockData(code, data) {
  const parts = data.split(",");
  if (parts.length < 32) return null;
  const name = parts[0]?.trim() || "";
  const close = parseFloat(parts[2]) || 0;
  const current = parseFloat(parts[3]) || 0;
  const amount = parseFloat(parts[9]) || 0;

  // 数据验证
  if (
    !name ||
    close <= 0 ||
    current <= 0 ||
    amount <= 0 ||
    !parts[30] ||
    !parts[31]
  ) {
    return null;
  }

  // 计算涨跌和百分比
  const change = current - close;
  const changePercent = ((change / close) * 100).toFixed(2);

  // 判断是否为ETF
  const isETF =
    name.includes("ETF") ||
    (current < 3 && (name.includes("基金") || name.includes("指数")));
  const decimals = isETF ? 3 : 2;
  const dateTime = `${parts[30]} ${parts[31]}`;

  return {
    name,
    code,
    current: current.toFixed(decimals),
    change: change.toFixed(decimals),
    changePercent,
    amount,
    isUp: change >= 0,
    market: code.substring(0, 2),
    isETF,
    dateTime,
  };
}

module.exports = {
  getStockList,
};
