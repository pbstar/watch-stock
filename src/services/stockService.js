/**
 * 股票数据服务
 * 获取股票实时数据，支持批量查询
 */

const { get, getGbk } = require("../utils/httpClient");

/**
 * 批量获取股票信息
 * @param {string[]} codes - 股票代码数组，如 ['sh600519', 'sz000001']
 * @returns {Promise<Array>} 股票信息数组
 */
async function getStockList(codes) {
  if (!codes?.length) return [];

  try {
    const url = `https://hq.sinajs.cn/list=${codes.join(",")}`;
    const data = await getGbk(url);
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
  const changeValue = current - close;
  const changePercent = ((changeValue / close) * 100).toFixed(2);

  // 判断是否为基金/ETF
  const codeNum = code.substring(2);
  const isFundByCode =
    (code.startsWith("sh") && codeNum.startsWith("5")) ||
    (code.startsWith("sz") && codeNum.startsWith("1"));
  const isETF =
    isFundByCode ||
    name.includes("ETF") ||
    name.includes("LOF") ||
    (current < 3 && (name.includes("基金") || name.includes("指数")));
  const decimals = isETF ? 3 : 2;
  const dateTime = `${parts[30]} ${parts[31]}`;

  return {
    name,
    code,
    current: current.toFixed(decimals),
    changeValue: changeValue.toFixed(decimals),
    changePercent,
    amount,
    market: code.substring(0, 2),
    isETF,
    dateTime,
  };
}

/**
 * 获取股票分时数据
 * @param {string} code - 股票代码，如 sh600519
 * @returns {Promise<Array>} 分时数据数组
 */
async function getStockMinute(code) {
  try {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
    const text = await get(url);
    const res = JSON.parse(text);
    const stockData = res?.data?.[code];
    if (!stockData?.data?.data?.length) return [];

    const d = stockData.data.date;
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

    return stockData.data.data
      .map((itemStr) => {
        const item = itemStr.split(" ");
        if (item.length !== 4 || !item[0]) return null;
        const time = `${date} ${item[0].slice(0, 2)}:${item[0].slice(2, 4)}`;
        return {
          time,
          price: parseFloat(item[1]) || 0,
          volume: parseFloat(item[2]) || 0,
          amount: parseFloat(item[3]) || 0,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error(`获取分时数据失败: ${error.message}`);
    return [];
  }
}

module.exports = {
  getStockList,
  getStockMinute,
};
