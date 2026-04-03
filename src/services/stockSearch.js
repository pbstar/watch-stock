/**
 * 股票搜索服务
 * 根据股票名称搜索股票代码
 */

const { getGbk } = require("../utils/httpClient");

/**
 * 根据股票名称搜索股票代码
 * @param {string} keyword - 股票名称或关键词
 * @returns {Promise<string|null>} 标准化的股票代码，如 sh600519，失败返回null
 */
async function searchStockCode(keyword) {
  const trimmed = keyword?.trim();
  if (!trimmed) return null;

  try {
    return await searchBySina(trimmed);
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
    const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,21,22,23,24,25,31,32,33,34,35&key=${encodeURIComponent(
      keyword,
    )}`;
    const data = await getGbk(url);
    const match = data.match(/var suggestvalue="([^"]+)"/);

    if (match?.[1]) {
      const items = match[1].split(";").filter((item) => item.trim());
      for (const item of items) {
        const [, , , fullCode] = item.split(",");
        // 验证A股代码:sh/sz开头且6位数字
        if (fullCode?.match(/^(sh|sz)\d{6}$/)) {
          return fullCode;
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
