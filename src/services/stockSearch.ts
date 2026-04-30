// 股票搜索服务，名称 -> 标准代码
import { getGbk } from "../utils/http";

// 使用新浪建议接口搜索
async function searchBySina(keyword: string): Promise<string | null> {
  try {
    const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,21,22,23,24,25,31,32,33,34,35&key=${encodeURIComponent(keyword)}`;
    const data = await getGbk(url);
    const match = data.match(/var suggestvalue="([^"]+)"/);

    if (match?.[1]) {
      const items = match[1].split(";").filter((i) => i.trim());
      for (const item of items) {
        const [, , , fullCode] = item.split(",");
        if (fullCode?.match(/^(sh|sz)\d{6}$/)) return fullCode;
      }
    }
  } catch {
    return null;
  }
  return null;
}

// 主搜索入口
export async function searchStockCode(keyword: string): Promise<string | null> {
  const trimmed = keyword?.trim();
  if (!trimmed) return null;
  try {
    return await searchBySina(trimmed);
  } catch {
    return null;
  }
}
