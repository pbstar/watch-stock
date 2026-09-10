// 终端文本工具：数字格式化 + 按显示宽度对齐
// 纯函数，无 DOM 依赖，可直接被 node --test 单测

/** 终端文本统一左缩进（走势区、kv 块、列表共用） */
export const INDENT = "  ";

/** 全角/宽字符占 2 显示列（中日韩文字、全角标点） */
function isWide(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

/** 文本在等宽终端里占用的显示列数（中文算 2，ASCII 算 1） */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
  return width;
}

/** 按显示宽度右侧补空格；超宽时原样返回（调用方应保证列宽取自最大值） */
export function padToWidth(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** 定点小数；非法值回退 "-" */
export function fmtNumber(value: unknown, digits = 2): string {
  const n = toNumber(value);
  return n === null ? "-" : n.toFixed(digits);
}

/** 带正负号的数值（涨跌值用 +/- 表达方向，不着色） */
export function fmtSigned(value: unknown, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return "-";
  return (n > 0 ? "+" : "") + n.toFixed(digits);
}

/** 涨跌幅百分比；统一按定点小数输出，避免 "0%"、"0.666666%" 破坏列对齐 */
export function fmtPercent(value: unknown, digits = 2): string {
  const n = toNumber(value);
  return n === null ? "-" : fmtSigned(n, digits) + "%";
}

/** 成交量：亿 / 万 / 整数 */
export function fmtVolume(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return "-";
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return String(Math.round(n));
}

/** 金额：万亿 / 亿 / 万 / 两位小数 */
export function fmtMoney(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return "-";
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "万亿";
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return n.toFixed(2);
}

/** 百分比字段（接口已带 % 语义的字符串）安全拼接 */
export function fmtRatio(value: unknown, suffix = "%"): string {
  const n = toNumber(value);
  return n === null ? "-" : fmtNumber(n) + suffix;
}
