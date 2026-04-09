/**
 * 交易时间工具函数
 * 判断当前是否为A股交易时间
 */

/**
 * 判断当前是否为A股交易时间
 * 交易时间：工作日 9:15-11:30 和 13:00-15:00
 * @returns {boolean} 是否在交易时间内
 */
function isTradingTime() {
  const now = new Date();
  const day = now.getDay();

  // 周末不交易
  if (day === 0 || day === 6) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    (currentMinutes >= 555 && currentMinutes <= 690) || // 9:15-11:30
    (currentMinutes >= 780 && currentMinutes <= 900) // 13:00-15:00
  );
}

/**
 * 检查是否为早盘集合竞价时间（9:15-9:25）
 * @returns {boolean}
 */
function isMorningAuctionTime() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= 555 && currentMinutes <= 565; // 9:15-9:25
}

/**
 * 生成 A 股交易时间槽（09:30-11:30 和 13:00-15:00，共 242 个）
 * @param {string} date - 日期字符串 YYYY-MM-DD
 * @returns {string[]} 完整时间槽数组
 */
function buildTimeSlots(date) {
  const slots = [];
  // 上午 09:30-11:30
  for (let t = 570; t <= 690; t++) {
    slots.push(
      `${date} ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
    );
  }
  // 下午 13:00-15:00
  for (let t = 780; t <= 900; t++) {
    slots.push(
      `${date} ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
    );
  }
  return slots;
}

module.exports = {
  isTradingTime,
  isMorningAuctionTime,
  buildTimeSlots,
};
