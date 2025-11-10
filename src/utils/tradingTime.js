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
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 周末不交易
  if (day === 0 || day === 6) {
    return false;
  }

  // 转换为分钟数便于比较
  const currentMinutes = hour * 60 + minute;

  // 上午交易时段：9:15-11:30
  const morningStart = 9 * 60 + 15;
  const morningEnd = 11 * 60 + 30;

  // 下午交易时段：13:00-15:00
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60;

  return (
    (currentMinutes >= morningStart && currentMinutes <= morningEnd) ||
    (currentMinutes >= afternoonStart && currentMinutes <= afternoonEnd)
  );
}

module.exports = {
  isTradingTime,
};
