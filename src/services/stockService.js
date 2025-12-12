/**
 * 股票数据服务
 * 获取股票实时数据，支持批量查询
 */

const { httpGet } = require("../utils/httpClient");
const { simpleDecode } = require("../utils/encoding");
const vscode = require("vscode");

/**
 * 批量获取股票信息
 * @param {string[]} codes - 股票代码数组，如 ['sh600519', 'sz000001']
 * @returns {Promise<Array>} 股票信息数组
 */
async function getStockList(codes) {
  if (!codes || codes.length === 0) {
    return [];
  }
  console.log(`获取股票数据: ${codes}`);
  try {
    // 新浪API支持逗号分隔多个股票代码
    // 格式：https://hq.sinajs.cn/list=sh600519,sz000001
    const codeList = codes.join(",");
    const response = await httpGet(`https://hq.sinajs.cn/list=${codeList}`, {
      timeout: 5000,
      responseType: "arraybuffer",
      headers: {
        Referer: "https://finance.sina.com.cn",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    // 解析返回数据
    const data = simpleDecode(response.data);
    const lines = data.split("\n");

    // 创建代码映射，用于匹配返回的数据
    const codeMap = new Map(codes.map((code) => [code.toLowerCase(), code]));

    const results = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 匹配格式：var hq_str_sh600519="..."
      const match = trimmed.match(/var hq_str_([^=]+)="([^"]+)"/);
      if (match && match[1] && match[2]) {
        const returnedCode = match[1].toLowerCase();
        // 查找对应的请求代码
        const requestedCode = codeMap.get(returnedCode);
        if (requestedCode) {
          const stockInfo = parseStockData(requestedCode, match[2]);
          if (stockInfo) {
            results.push(stockInfo);
          }
        }
      }
    }
    console.log(`获取股票数据成功: ${results.length} 条`);
    return results;
  } catch (error) {
    const errorMsg = `获取股票数据失败: ${error.message}`;
    console.error(errorMsg);
    vscode.window.showErrorMessage(errorMsg);
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
  if (parts.length < 4) {
    return null;
  }

  // 数据格式：名称,今日开盘价,昨日收盘价,当前价,今日最高价,今日最低价,...
  const name = parts[0].trim();
  const current = parseFloat(parts[3]);
  const close = parseFloat(parts[2]);

  // 数据验证
  if (!name || isNaN(current) || isNaN(close) || close <= 0) {
    return null;
  }

  // 计算涨跌信息
  const change = current - close;
  const changePercent = ((change / close) * 100).toFixed(2);

  // 判断是否为ETF - ETF通常价格较低且名称包含ETF字样
  const isETF =
    name.includes("ETF") ||
    (current < 5 && (name.includes("基金") || name.includes("指数")));
  const priceDecimalPlaces = isETF ? 3 : 2;

  return {
    name,
    code: code.substring(2), // 去掉市场前缀，只保留6位代码
    fullCode: code, // 保留完整代码
    current: current.toFixed(priceDecimalPlaces),
    change: change.toFixed(priceDecimalPlaces),
    changePercent,
    isUp: change >= 0,
    market: code.substring(0, 2),
    isETF,
  };
}

module.exports = {
  getStockList,
};
