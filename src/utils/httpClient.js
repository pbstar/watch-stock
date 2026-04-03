// HTTP 请求工具，基于全局 fetch（Node 18+）
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// 特殊域名 Referer 映射
const REFERER_MAP = {
  "sinajs.cn": "https://finance.sina.com.cn",
  "sina.com.cn": "https://finance.sina.com.cn",
};

// 构造 fetch 配置，自动注入 Referer
function buildOptions(url, extraHeaders = {}) {
  try {
    const { protocol, hostname } = new URL(url);
    const matched = Object.keys(REFERER_MAP).find((key) =>
      hostname.endsWith(key),
    );
    const origin = matched
      ? REFERER_MAP[matched]
      : `${protocol}//www.${hostname}`;
    return {
      headers: { "User-Agent": UA, Referer: origin, ...extraHeaders },
      signal: AbortSignal.timeout(10000),
    };
  } catch {
    return { headers: { "User-Agent": UA, ...extraHeaders } };
  }
}

// GET 请求，返回文本
async function get(url, extraHeaders = {}) {
  const res = await fetch(url, buildOptions(url, extraHeaders));
  return res.text();
}

// GET 请求，返回 GBK 解码后的字符串
async function getGbk(url, extraHeaders = {}) {
  const res = await fetch(url, buildOptions(url, extraHeaders));
  const buf = await res.arrayBuffer();
  return new TextDecoder("gbk").decode(buf);
}

module.exports = { get, getGbk };
