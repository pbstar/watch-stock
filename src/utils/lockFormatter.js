function calcLockAmount(stock) {
  if (stock.isLimitUp) {
    return (stock.buy1Volume || 0) * 100 * (stock.buy1Price || 0);
  }
  return (stock.sell1Volume || 0) * 100 * (stock.sell1Price || 0);
}

function formatLockAmount(amount) {
  if (amount >= 100000000) {
    return (amount / 100000000).toFixed(1) + "亿";
  }
  if (amount >= 10000) {
    return (amount / 10000).toFixed(0) + "万";
  }
  return Math.round(amount) + "元";
}

module.exports = { calcLockAmount, formatLockAmount };
