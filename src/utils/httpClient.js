/**
 * 简单的HTTP GET请求工具
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");

/**
 * 简单的HTTP GET请求
 * @param {string} url - 请求URL
 * @param {object} options - 选项
 * @returns {Promise} 响应对象
 */
async function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      timeout: options.timeout || 5000,
      headers: options.headers || {},
    };

    const req = client.request(requestOptions, (res) => {
      let data = [];

      res.on("data", (chunk) => {
        data.push(chunk);
      });

      res.on("end", () => {
        const buffer = Buffer.concat(data);
        const result = {
          data:
            options.responseType === "arraybuffer" ? buffer : buffer.toString(),
          status: res.statusCode,
          headers: res.headers,
        };
        resolve(result);
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}

module.exports = {
  httpGet,
};
