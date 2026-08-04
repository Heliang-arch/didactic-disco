// 供应可靠性计算服务

export interface ShipmentRecord {
  coal_name: string;
  ship_date: string;
  quantity: number;
  batch_no: string;
}

export interface ReliabilityResult {
  coal_name: string;
  frequency: number;       // 发运频率 (0-1)
  avgInterval: number;     // 平均发运间隔（天）
  cv: number;              // 波动系数
  movingAvg: number[];     // 7天移动平均
  trendSlope: number;      // 趋势斜率
  weekdayAvg: number;      // 工作日均量
  weekendAvg: number;      // 周末均量
  score: number;           // 可靠性评分 (0-100)
  level: string;           // 可靠/一般/不稳定
  isUnstable: boolean;     // 是否供应不稳定
}

/**
 * 计算发运频率 = 发运天数 / 总天数
 */
export function calcFrequency(records: ShipmentRecord[], totalDays: number): number {
  if (totalDays === 0) return 0;
  const shipDays = new Set(records.map(r => r.ship_date)).size;
  return shipDays / totalDays;
}

/**
 * 计算发运间隔
 */
export function calcIntervals(records: ShipmentRecord[]): number[] {
  const dates = [...new Set(records.map(r => r.ship_date))].sort();
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const d1 = new Date(dates[i - 1]);
    const d2 = new Date(dates[i]);
    intervals.push((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  }
  return intervals;
}

/**
 * 计算波动系数 CV = 标准差 / 平均值
 */
export function calcCV(records: ShipmentRecord[]): number {
  const quantities = records.map(r => r.quantity);
  if (quantities.length < 2) return 0;
  const mean = quantities.reduce((s, q) => s + q, 0) / quantities.length;
  if (mean === 0) return 0;
  const variance = quantities.reduce((s, q) => s + (q - mean) ** 2, 0) / (quantities.length - 1);
  const std = Math.sqrt(variance);
  return std / mean;
}

/**
 * 计算7天移动平均
 */
export function calcMovingAverage(records: ShipmentRecord[], windowSize: number = 7): number[] {
  // 按日期聚合
  const dailyMap = new Map<string, number>();
  for (const r of records) {
    dailyMap.set(r.ship_date, (dailyMap.get(r.ship_date) || 0) + r.quantity);
  }
  const sortedDates = [...dailyMap.keys()].sort();
  const values = sortedDates.map(d => dailyMap.get(d) || 0);

  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    result.push(window.reduce((s, v) => s + v, 0) / window.length);
  }
  return result;
}

/**
 * 拟合趋势线（简单线性回归）
 */
export function calcTrend(records: ShipmentRecord[]): number {
  const dailyMap = new Map<string, number>();
  for (const r of records) {
    dailyMap.set(r.ship_date, (dailyMap.get(r.ship_date) || 0) + r.quantity);
  }
  const sortedDates = [...dailyMap.keys()].sort();
  if (sortedDates.length < 2) return 0;

  const n = sortedDates.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += dailyMap.get(sortedDates[i]) || 0;
    sumXY += i * (dailyMap.get(sortedDates[i]) || 0);
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

/**
 * 工作日 vs 周末分析
 */
export function calcWeekdayWeekend(records: ShipmentRecord[]): { weekdayAvg: number; weekendAvg: number } {
  let weekdaySum = 0, weekdayCount = 0;
  let weekendSum = 0, weekendCount = 0;

  for (const r of records) {
    const day = new Date(r.ship_date).getDay();
    if (day === 0 || day === 6) {
      weekendSum += r.quantity;
      weekendCount++;
    } else {
      weekdaySum += r.quantity;
      weekdayCount++;
    }
  }

  return {
    weekdayAvg: weekdayCount > 0 ? weekdaySum / weekdayCount : 0,
    weekendAvg: weekendCount > 0 ? weekendSum / weekendCount : 0,
  };
}

/**
 * 综合可靠性评分 (0-100)
 */
export function calcScore(frequency: number, cv: number, avgInterval: number): number {
  // 频率得分 (40分)
  const freqScore = Math.min(frequency * 40, 40);
  // 波动得分 (35分) - CV越小越好
  const cvScore = cv <= 0.3 ? 35 : cv <= 0.5 ? 35 * (1 - (cv - 0.3) / 0.7) : Math.max(0, 35 * (1 - cv));
  // 连续性得分 (25分) - 间隔越小越好
  const intervalScore = avgInterval <= 1 ? 25 : avgInterval <= 3 ? 25 * (3 - avgInterval) / 2 : Math.max(0, 25 * (5 - avgInterval) / 4);

  return Math.round(Math.max(0, Math.min(100, freqScore + cvScore + intervalScore)));
}

/**
 * 分析单个煤种的供应可靠性
 */
export function analyzeReliability(records: ShipmentRecord[], totalDays: number): ReliabilityResult {
  const frequency = calcFrequency(records, totalDays);
  const intervals = calcIntervals(records);
  const avgInterval = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : totalDays;
  const cv = calcCV(records);
  const movingAvg = calcMovingAverage(records);
  const trendSlope = calcTrend(records);
  const { weekdayAvg, weekendAvg } = calcWeekdayWeekend(records);
  const score = calcScore(frequency, cv, avgInterval);

  const level = score >= 80 ? '可靠' : score >= 60 ? '一般' : '不稳定';
  const isUnstable = cv > 0.5 || frequency < 0.5;

  return {
    coal_name: records[0]?.coal_name || '',
    frequency: Math.round(frequency * 100) / 100,
    avgInterval: Math.round(avgInterval * 100) / 100,
    cv: Math.round(cv * 100) / 100,
    movingAvg,
    trendSlope: Math.round(trendSlope * 100) / 100,
    weekdayAvg: Math.round(weekdayAvg),
    weekendAvg: Math.round(weekendAvg),
    score,
    level,
    isUnstable,
  };
}
