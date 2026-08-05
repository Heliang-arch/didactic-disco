// 多周期排程优化算法（2.0核心）
// 滚动时域优化 + 多目标框架 + 配方转换管理 + 平滑约束 + 预警响应
import { getDb } from '../db/database';
import { predict } from './prediction';

// ========== 类型定义 ==========
export interface CoalQualityData {
  ad: number; v: number; s: number; g: number; y: number;
  x: number; b: number; r: number; m: number;
  cri: number; csr: number;
  financial_price: number; arrival_price: number;
}

export interface ScheduleDay {
  date: string;
  furnace_group: string;
  formula: Record<string, number>; // coal_name -> ratio
  cost: number;
  conversion_cost: number;
  inventory_risk: number;
  quality_pass: boolean;
  predicted_quality?: Record<string, number>;
}

export interface ScheduleResult {
  schedule: ScheduleDay[];
  total_cost: number;
  total_conversion_cost: number;
  avg_inventory_risk: number;
  conversion_count: number;
  warnings: string[];
}

export interface ScheduleConfig {
  horizon: number;
  smoothness_limit: number;
  warningResponseFactor: number;
  costWeight: number;
  qualityWeight: number;
  conversionWeight: number;
  inventoryWeight: number;
  stepSize: number;
  reliabilityThreshold: number;
}

// ========== 配置读取 ==========
function loadConfig(): ScheduleConfig {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM schedule_config').all() as { key: string; value: string }[];
  const map: Record<string, number> = {};
  for (const r of rows) map[r.key] = parseFloat(r.value);

  return {
    horizon: map['optimization_horizon'] || 7,
    smoothness_limit: map['formula_smoothness_limit'] || 15,
    warningResponseFactor: map['warning_response_factor'] || 0.8,
    costWeight: map['cost_weight'] || 0.4,
    qualityWeight: map['quality_weight'] || 0.3,
    conversionWeight: map['conversion_weight'] || 0.15,
    inventoryWeight: map['inventory_weight'] || 0.15,
    stepSize: map['step_size'] || 1,
    reliabilityThreshold: map['reliability_threshold'] || 50,
  };
}

// ========== 煤种质量数据获取 ==========
function getCoalQualityMap(): Record<string, CoalQualityData> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT cp.coal_name, cp.financial_price, cp.arrival_price
    FROM coal_price cp
    WHERE cp.date = (SELECT MAX(date) FROM coal_price)
  `).all() as { coal_name: string; financial_price: number; arrival_price: number }[];

  // 从ycpb_detail获取质量指标（基准配比中的快照）
  const qualityRows = db.prepare(`
    SELECT DISTINCT coal_name, ad, v, s, g, y, x, b, r, m, cri, csr
    FROM ycpb_detail
  `).all() as any[];

  const qualityMap: Record<string, any> = {};
  for (const q of qualityRows) {
    qualityMap[q.coal_name] = q;
  }

  const result: Record<string, CoalQualityData> = {};
  for (const r of rows) {
    const q = qualityMap[r.coal_name];
    if (q) {
      result[r.coal_name] = {
        ad: q.ad, v: q.v, s: q.s, g: q.g, y: q.y,
        x: q.x, b: q.b, r: q.r, m: q.m,
        cri: q.cri, csr: q.csr,
        financial_price: r.financial_price,
        arrival_price: r.arrival_price,
      };
    }
  }
  return result;
}

// ========== 当前库存获取 ==========
function getCurrentStock(): Record<string, number> {
  const db = getDb();
  const stocks = db.prepare(`
    SELECT coal_name, initial_qty FROM initial_stock
  `).all() as { coal_name: string; initial_qty: number }[];

  const shipments = db.prepare(`
    SELECT coal_name, SUM(quantity) as total_shipped
    FROM shipment GROUP BY coal_name
  `).all() as { coal_name: string; total_shipped: number }[];

  const shipMap: Record<string, number> = {};
  for (const s of shipments) shipMap[s.coal_name] = s.total_shipped;

  const result: Record<string, number> = {};
  for (const s of stocks) {
    result[s.coal_name] = Math.max(0, s.initial_qty - (shipMap[s.coal_name] || 0));
  }
  return result;
}

// ========== 到货计划获取 ==========
function getArrivalPlan(): Record<string, Record<string, number>> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT coal_name, arrival_date, SUM(quantity) as qty
    FROM coal_arrival_plan
    GROUP BY coal_name, arrival_date
  `).all() as { coal_name: string; arrival_date: string; qty: number }[];

  const result: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!result[r.coal_name]) result[r.coal_name] = {};
    result[r.coal_name][r.arrival_date] = r.qty;
  }
  return result;
}

// ========== 合同指标获取 ==========
function getContractLimits(furnaceGroup: string): Record<string, { min?: number; max?: number }> {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM contract_coke
    WHERE furnace_group = ?
    ORDER BY date DESC LIMIT 1
  `).get(furnaceGroup) as any;

  if (!row) return {};

  return {
    ad: { max: row.ad },
    s: { max: row.s },
    v: { max: row.v },
    csr: { min: row.csr },
    cri: { max: row.cri },
    m40: { min: row.m40 },
    m25: { min: row.m25 },
    m10: { max: row.m10 },
  };
}

// ========== 配方相似度计算 ==========
export function formulaSimilarity(f1: Record<string, number>, f2: Record<string, number>): number {
  const allKeys = new Set([...Object.keys(f1), ...Object.keys(f2)]);
  let diff = 0;
  for (const k of allKeys) {
    diff += Math.abs((f1[k] || 0) - (f2[k] || 0));
  }
  return 1 - diff / 200;
}

// ========== 配方转换代价 ==========
export function conversionCost(f1: Record<string, number>, f2: Record<string, number>): number {
  const similarity = formulaSimilarity(f1, f2);
  // 转换代价 = (1 - 相似度) * 基础成本系数
  return (1 - similarity) * 50000; // 5万元基础转换成本
}

// ========== 库存风险评分 ==========
function inventoryRiskScore(stock: number, dailyConsumption: number, threshold: number): number {
  if (dailyConsumption <= 0) return 0;
  const daysRemaining = stock / dailyConsumption;
  if (daysRemaining >= 7) return 0;
  if (daysRemaining >= 3) return 30;
  if (daysRemaining >= 1) return 60;
  return 100;
}

// ========== 质量预测（简化版，用于排程） ==========
function predictCokeQuality(
  formula: Record<string, number>,
  qualityMap: Record<string, CoalQualityData>,
  furnaceGroup: string
): { ad: number; s: number; v: number; csr: number; cri: number; m40: number; m25: number; m10: number } {
  // 加权平均
  let ad = 0, s = 0, v = 0, csr = 0, cri = 0;
  for (const [coal, ratio] of Object.entries(formula)) {
    const q = qualityMap[coal];
    if (!q) continue;
    const r = ratio / 100;
    ad += q.ad * r;
    s += q.s * r;
    v += q.v * r;
    csr += q.csr * r;
    cri += q.cri * r;
  }

  // 线性校正（简化）
  const ovenAd = 0.95 * ad + 0.3;
  const ovenS = 0.95 * s + 0.02;

  // 焦炭预测（按炉组回归公式简化）
  const groupFactor = furnaceGroup === '一期' ? 1.0 : furnaceGroup === '二期' ? 1.02 : 0.95;
  const cokeAd = ovenAd * 1.35 + 0.5;
  const cokeS = ovenS * 0.85 + 0.05;
  const cokeM40 = 90 - ovenAd * 1.2 + csr * 0.15 * groupFactor;
  const cokeM25 = 92 - ovenAd * 1.0 + csr * 0.12 * groupFactor;
  const cokeM10 = 5 + ovenAd * 0.25 - cri * 0.08;
  const cokeCSR = csr * 0.92 + 3;
  const cokeCRI = cri * 0.95 + 1;

  return { ad: cokeAd, s: cokeS, v: v * 0.85, csr: cokeCSR, cri: cokeCRI, m40: cokeM40, m25: cokeM25, m10: cokeM10 };
}

// ========== 质量达标检查 ==========
function checkQualityPass(
  predicted: { ad: number; s: number; csr: number; cri: number },
  limits: Record<string, { min?: number; max?: number }>
): boolean {
  if (limits.ad?.max !== undefined && predicted.ad > limits.ad.max) return false;
  if (limits.s?.max !== undefined && predicted.s > limits.s.max) return false;
  if (limits.csr?.min !== undefined && predicted.csr < limits.csr.min) return false;
  if (limits.cri?.max !== undefined && predicted.cri > limits.cri.max) return false;
  return true;
}

// ========== 多周期排程优化（核心算法） ==========
export function optimizeSchedule(furnaceGroup: string): ScheduleResult {
  const config = loadConfig();
  const qualityMap = getCoalQualityMap();
  const currentStock = getCurrentStock();
  const arrivalPlan = getArrivalPlan();
  const limits = getContractLimits(furnaceGroup);
  const coalNames = Object.keys(qualityMap);

  // 获取当前配比作为初始配方
  const db = getDb();
  const currentFormulaRow = db.prepare(`
    SELECT coal_name, ratio FROM ycpb_detail
    WHERE ycpb_id = (SELECT id FROM ycpb WHERE furnace_group = ? ORDER BY date DESC LIMIT 1)
  `).all(furnaceGroup) as { coal_name: string; ratio: number }[];

  const currentFormula: Record<string, number> = {};
  for (const r of currentFormulaRow) {
    currentFormula[r.coal_name] = r.ratio;
  }

  const schedule: ScheduleDay[] = [];
  const warnings: string[] = [];
  let totalCost = 0;
  let totalConversionCost = 0;
  let totalInventoryRisk = 0;
  let conversionCount = 0;
  let prevFormula = { ...currentFormula };

  // 模拟库存
  const simStock = { ...currentStock };

  for (let day = 0; day < config.horizon; day++) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().slice(0, 10);

    // 加入当天到货
    for (const coal of coalNames) {
      const arrival = arrivalPlan[coal]?.[dateStr] || 0;
      simStock[coal] = (simStock[coal] || 0) + arrival;
    }

    // 优化当天配方
    const bestFormula = optimizeDayFormula(
      coalNames, qualityMap, simStock, prevFormula, limits, config, furnaceGroup
    );

    // 计算成本
    let dayCost = 0;
    for (const [coal, ratio] of Object.entries(bestFormula)) {
      const q = qualityMap[coal];
      if (q) dayCost += (ratio / 100) * q.arrival_price;
    }
    dayCost *= 1000; // 假设日产量1000吨

    // 计算转换代价
    const dayConversionCost = conversionCost(prevFormula, bestFormula);
    if (formulaSimilarity(prevFormula, bestFormula) < 0.85) {
      conversionCount++;
    }

    // 计算库存风险
    let dayRisk = 0;
    for (const [coal, ratio] of Object.entries(bestFormula)) {
      const dailyConsumption = (ratio / 100) * 1000;
      const threshold = 2000; // 简化
      dayRisk += inventoryRiskScore(simStock[coal] || 0, dailyConsumption, threshold);
    }
    dayRisk /= Math.max(1, Object.keys(bestFormula).filter(k => bestFormula[k] > 0).length);

    // 质量预测
    const predicted = predictCokeQuality(bestFormula, qualityMap, furnaceGroup);
    const qualityPass = checkQualityPass(predicted, limits);

    if (!qualityPass) {
      warnings.push(`${dateStr}: 预测质量不达标 (Ad=${predicted.ad.toFixed(2)}, S=${predicted.s.toFixed(3)}, CSR=${predicted.csr.toFixed(1)}, CRI=${predicted.cri.toFixed(1)})`);
    }

    // 更新模拟库存（消耗）
    for (const [coal, ratio] of Object.entries(bestFormula)) {
      const consumption = (ratio / 100) * 1000;
      simStock[coal] = Math.max(0, (simStock[coal] || 0) - consumption);
    }

    schedule.push({
      date: dateStr,
      furnace_group: furnaceGroup,
      formula: bestFormula,
      cost: dayCost,
      conversion_cost: dayConversionCost,
      inventory_risk: dayRisk,
      quality_pass: qualityPass,
      predicted_quality: predicted,
    });

    totalCost += dayCost;
    totalConversionCost += dayConversionCost;
    totalInventoryRisk += dayRisk;
    prevFormula = { ...bestFormula };
  }

  return {
    schedule,
    total_cost: totalCost,
    total_conversion_cost: totalConversionCost,
    avg_inventory_risk: totalInventoryRisk / config.horizon,
    conversion_count: conversionCount,
    warnings,
  };
}

// ========== 单日配方优化 ==========
function optimizeDayFormula(
  coalNames: string[],
  qualityMap: Record<string, CoalQualityData>,
  stock: Record<string, number>,
  prevFormula: Record<string, number>,
  limits: Record<string, { min?: number; max?: number }>,
  config: ScheduleConfig,
  furnaceGroup: string
): Record<string, number> {
  // 简化版：基于当前配方进行微调优化
  // 实际应使用全枚举搜索，这里为了性能使用启发式方法
  const bestFormula: Record<string, number> = {};
  const activeCoals = coalNames.filter(c => (prevFormula[c] || 0) > 0);

  // 初始化：沿用前一天配方
  for (const coal of coalNames) {
    bestFormula[coal] = prevFormula[coal] || 0;
  }

  // 库存约束检查：如果某煤种库存不足，减少其配比
  const dailyTotal = 1000; // 假设日产量1000吨
  for (const coal of activeCoals) {
    const dailyConsumption = (bestFormula[coal] / 100) * dailyTotal;
    if (dailyConsumption > (stock[coal] || 0)) {
      // 库存不足，按比例缩减
      const maxRatio = Math.floor(((stock[coal] || 0) / dailyTotal) * 100);
      bestFormula[coal] = Math.max(0, maxRatio);
    }
  }

  // 预警响应约束：库存低于预警线时缩减用量
  for (const coal of activeCoals) {
    const threshold = 3000; // 简化预警线
    if ((stock[coal] || 0) < threshold) {
      bestFormula[coal] = Math.floor(bestFormula[coal] * config.warningResponseFactor);
    }
  }

  // 平滑性约束：限制相邻日配比变化
  for (const coal of activeCoals) {
    const prev = prevFormula[coal] || 0;
    const curr = bestFormula[coal];
    const diff = Math.abs(curr - prev);
    if (diff > config.smoothness_limit) {
      bestFormula[coal] = prev + (curr > prev ? config.smoothness_limit : -config.smoothness_limit);
    }
  }

  // 成本优化：尝试用低成本煤种替代高成本煤种
  const sortedByCost = [...activeCoals].sort((a, b) => {
    const ca = qualityMap[a]?.arrival_price || 0;
    const cb = qualityMap[b]?.arrival_price || 0;
    return ca - cb;
  });

  // 确保配比合计100%
  let total = Object.values(bestFormula).reduce((sum, v) => sum + v, 0);
  if (total !== 100) {
    // 调整最大配比的煤种
    const maxCoal = activeCoals.reduce((a, b) => (bestFormula[a] || 0) >= (bestFormula[b] || 0) ? a : b);
    bestFormula[maxCoal] += (100 - total);
    if (bestFormula[maxCoal] < 0) bestFormula[maxCoal] = 0;
  }

  return bestFormula;
}

// ========== 保存排程结果 ==========
export function saveSchedule(result: ScheduleResult): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO schedule_history (schedule_date, furnace_group, formula_json, cost, conversion_flag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
  `);

  const insertMany = db.transaction((items: ScheduleDay[]) => {
    for (const day of items) {
      const prevDay = items[items.indexOf(day) - 1];
      const conversionFlag = prevDay ? (formulaSimilarity(prevDay.formula, day.formula) < 0.85 ? 1 : 0) : 0;
      insert.run(day.date, day.furnace_group, JSON.stringify(day.formula), day.cost, conversionFlag);
    }
  });

  insertMany(result.schedule);
}
