// 需求预测服务 - 基于历史发运数据的时间序列预测

export interface ForecastResult {
  coal_name: string;
  predictions: { date: string; predicted: number; lower: number; upper: number }[];
  mape: number; // 平均绝对百分比误差
}

/**
 * 简单移动平均预测
 */
function simpleMovingAverage(values: number[], windowSize: number): number {
  if (values.length === 0) return 0;
  const window = values.slice(-windowSize);
  return window.reduce((s, v) => s + v, 0) / window.length;
}

/**
 * 指数平滑预测 (Holt-Winters 简化版)
 */
function exponentialSmoothing(values: number[], alpha: number = 0.3): number[] {
  if (values.length === 0) return [];
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

/**
 * 计算标准差
 */
function calcStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * 计算MAPE
 */
function calcMAPE(actual: number[], predicted: number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] > 0) {
      sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
      count++;
    }
  }
  return count > 0 ? Math.round((sum / count) * 10000) / 100 : 0;
}

/**
 * 预测未来N天发运量
 * 使用指数平滑 + 移动平均组合方法
 */
export function forecastDemand(
  coalName: string,
  historicalData: { date: string; quantity: number }[],
  forecastDays: number = 7,
): ForecastResult {
  // 按日期排序
  const sorted = [...historicalData].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 3) {
    // 数据不足，返回零预测
    const predictions = [];
    const today = new Date();
    for (let i = 1; i <= forecastDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      predictions.push({
        date: d.toISOString().split('T')[0],
        predicted: 0,
        lower: 0,
        upper: 0,
      });
    }
    return { coal_name: coalName, predictions, mape: 0 };
  }

  const values = sorted.map(d => d.quantity);

  // 指数平滑
  const smoothed = exponentialSmoothing(values, 0.3);
  const lastSmoothed = smoothed[smoothed.length - 1];

  // 7天移动平均
  const ma7 = simpleMovingAverage(values, 7);

  // 组合预测值
  const basePredicted = (lastSmoothed + ma7) / 2;

  // 计算残差标准差用于置信区间
  const residuals = values.map((v, i) => v - smoothed[i]);
  const residualStd = calcStd(residuals);

  // 生成预测
  const predictions = [];
  const today = new Date(sorted[sorted.length - 1].date);
  for (let i = 1; i <= forecastDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    // 随预测步长增加，置信区间扩大
    const stepFactor = 1 + (i - 1) * 0.15;
    predictions.push({
      date: d.toISOString().split('T')[0],
      predicted: Math.max(0, Math.round(basePredicted)),
      lower: Math.max(0, Math.round(basePredicted - 1.96 * residualStd * stepFactor)),
      upper: Math.round(basePredicted + 1.96 * residualStd * stepFactor),
    });
  }

  // 计算MAPE（回测）
  const backtestPredicted = smoothed.slice(1);
  const backtestActual = values.slice(1);
  const mape = calcMAPE(backtestActual, backtestPredicted);

  return { coal_name: coalName, predictions, mape };
}
