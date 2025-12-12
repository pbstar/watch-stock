/**
 * 轻量级字符编码转换工具
 * 替代iconv-lite，减少打包体积
 * 使用Node.js内置的TextDecoder
 */

/**
 * GBK解码器
 * 使用Node.js内置的TextDecoder，支持GBK编码
 */
class GBKDecoder {
  constructor() {
    try {
      // Node.js v12+ 支持TextDecoder('gbk')
      this.decoder = new TextDecoder("gbk");
      this.hasGBKSupport = true;
    } catch (error) {
      console.warn("TextDecoder不支持GBK编码，使用备用方案");
      this.hasGBKSupport = false;
      this.decoder = null;
    }
  }

  /**
   * 解码GBK编码的Buffer
   * @param {Buffer} buffer - GBK编码的缓冲区
   * @returns {string} UTF-8字符串
   */
  decode(buffer) {
    if (this.hasGBKSupport && this.decoder) {
      try {
        return this.decoder.decode(buffer);
      } catch (error) {
        console.warn("TextDecoder GBK解码失败，使用备用方案");
      }
    }

    // 备用方案：尝试使用binary编码
    return this.decodeBinary(buffer);
  }

  /**
   * 二进制解码备用方案
   * @param {Buffer} buffer - 缓冲区
   * @returns {string} 字符串
   */
  decodeBinary(buffer) {
    try {
      // 先尝试直接转字符串
      const str = buffer.toString();
      // 检查是否包含我们期望的JavaScript变量声明
      if (str.includes("var suggestvalue=") || str.includes("var hq_str_")) {
        return str;
      }

      // 如果直接转换不行，尝试binary编码
      return buffer.toString("binary");
    } catch (error) {
      console.error("二进制解码失败:", error);
      return buffer.toString("utf-8"); // 最后fallback
    }
  }
}

// 创建单例实例
const decoder = new GBKDecoder();

/**
 * 简单的GBK解码函数
 * @param {Buffer} buffer - GBK编码的缓冲区
 * @returns {string} UTF-8字符串
 */
function simpleDecode(buffer) {
  return decoder.decode(buffer);
}

module.exports = {
  simpleDecode,
};
