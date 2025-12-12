/**
 * 股票搜索服务
 * 根据股票名称搜索股票代码
 */

const { httpGet } = require("../utils/httpClient");
const { simpleDecode } = require("../utils/encoding");

/**
 * 根据股票名称搜索股票代码
 * @param {string} keyword - 股票名称或关键词
 * @returns {Promise<string|null>} 标准化的股票代码，如 sh600519，失败返回null
 */
async function searchStockCode(keyword) {
  if (!keyword || typeof keyword !== "string") {
    return null;
  }

  const trimmed = keyword.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const code = await searchBySina(trimmed);
    if (code) {
      return code;
    }
    return null;
  } catch (error) {
    console.error("股票搜索失败:", error.message);
    return null;
  }
}

/**
 * 使用新浪API搜索股票
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<string|null>} 股票代码
 */
async function searchBySina(keyword) {
  try {
    const searchResponse = await httpGet(
      `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,21,22,23,24,25,31,32,33,34,35&key=${encodeURIComponent(
        keyword
      )}`,
      {
        timeout: 5000,
        responseType: "arraybuffer",
        headers: {
          Referer: "https://finance.sina.com.cn",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    const searchData = simpleDecode(searchResponse.data);

    // 解析搜索结果
    const match = searchData.match(/var suggestvalue="([^"]+)"/);
    if (match && match[1]) {
      const items = match[1].split(";");
      const validItems = items.filter((item) => item && item.trim());

      for (const item of validItems) {
        const stockInfo = item.split(",");
        if (stockInfo.length >= 4) {
          const stockCode = stockInfo[2];
          const fullCode = stockInfo[3];

          // 确保是A股股票（过滤掉港股、美股等）
          if (
            fullCode &&
            (fullCode.startsWith("sh") || fullCode.startsWith("sz")) &&
            stockCode &&
            stockCode.match(/^[0-9]{6}$/)
          ) {
            const market = fullCode.startsWith("sh") ? "sh" : "sz";
            return `${market}${stockCode}`;
          }
        }
      }
    }
  } catch (error) {
    console.error("新浪搜索失败:", error.message);
  }

  return null;
}

module.exports = {
  searchStockCode,
};
