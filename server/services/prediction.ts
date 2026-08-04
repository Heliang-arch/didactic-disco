// 质量预测引擎核心算法

export interface CoalData {
  ad: number; v: number; s: number; g: number; y: number;
  x: number; b: number; r: number; m: number;
  cri: number; csr: number;
  financial_price: number;
  arrival_price: number;
  ratio: number; // 配比百分比
}

export interface PredictionResult {
  // 配合煤加权指标
  weighted: Record<string, number>;
  // 入炉煤预测值（线性校正后）
  ovenCoal: Record<string, number>;
  // 焦炭预测值（分炉组）
  coke: Record<string, number>;
  // 化产品预测
  chemical: Record<string, number>;
  // 综合经济指标
  economics: Record<string, number>;
}

// 线性校正模型参数（RLMmodel）：w1 × 加权值 + w2
const RLM_MODEL: Record<string, { w1: number; w2: number }> = {
  ad:  { w1: 0.95, w2: 0.12 },
  v:   { w1: 0.96, w2: -0.08 },
  s:   { w1: 0.93, w2: 0.02 },
  g:   { w1: 0.97, w2: 1.5 },
  y:   { w1: 0.94, w2: 0.3 },
  x:   { w1: 0.95, w2: 0.2 },
  b:   { w1: 0.92, w2: 0.5 },
  r:   { w1: 0.96, w2: 0.1 },
  m:   { w1: 0.97, w2: 0.2 },
  cri: { w1: 0.90, w2: 1.0 },
  csr: { w1: 0.91, w2: 0.8 },
};

// 焦炭预测回归公式（分炉组）
// 格式：M40/M25/M10/Ad/S/CRI/CSR
const COKE_REGRESSION: Record<string, Record<string, { a: number; b: number }>> = {
  '一期': {
    m40: { a: 1.02, b: -2.5 },
    m25: { a: 0.98, b: 1.2 },
    m10: { a: 0.95, b: 0.5 },
    ad:  { a: 1.05, b: -0.3 },
    s:   { a: 1.01, b: -0.01 },
    cri: { a: 0.92, b: 1.5 },
    csr: { a: 1.08, b: -1.2 },
  },
  '二期': {
    m40: { a: 1.01, b: -1.8 },
    m25: { a: 0.99, b: 0.8 },
    m10: { a: 0.96, b: 0.3 },
    ad:  { a: 1.04, b: -0.2 },
    s:   { a: 1.00, b: 0.0 },
    cri: { a: 0.93, b: 1.2 },
    csr: { a: 1.07, b: -0.9 },
  },
  '小焦炉': {
    m40: { a: 1.05, b: -3.0 },
    m25: { a: 0.97, b: 1.5 },
    m10: { a: 0.94, b: 0.7 },
    ad:  { a: 1.06, b: -0.4 },
    s:   { a: 1.02, b: -0.02 },
    cri: { a: 0.90, b: 2.0 },
    csr: { a: 1.10, b: -1.5 },
  },
};

// 化产品产率公式
const CHEMICAL_YIELD = {
  cokeRate:      { base: 0.75, v_factor: -0.005 }, // 成焦率
  tar:          { base: 0.035, v_factor: 0.001 },  // 焦油产率
  crudeBenzene: { base: 0.010, v_factor: 0.0003 }, // 粗苯产率
  ammoniumSulfate: { base: 0.012, v_factor: 0.0002 }, // 硫铵产率
};

/**
 * 第一步：加权平均计算
 */
function calcWeightedAverage(coals: CoalData[]): Record<string, number> {
  const totalRatio = coals.reduce((sum, c) => sum + c.ratio, 0);
  if (Math.abs(totalRatio - 100) > 0.01) {
    throw new Error(`配比合计必须为100%，当前为${totalRatio.toFixed(2)}%`);
  }

  const keys = ['ad', 'v', 's', 'g', 'y', 'x', 'b', 'r', 'm', 'cri', 'csr'];
  const weighted: Record<string, number> = {};

  for (const key of keys) {
    weighted[key] = coals.reduce((sum, c) => {
      const val = (c as any)[key] ?? 0;
      return sum + val * (c.ratio / 100);
    }, 0);
  }

  return weighted;
}

/**
 * 第二步：线性校正（入炉煤预测）
 */
function linearCorrection(weighted: Record<string, number>): Record<string, number> {
  const corrected: Record<string, number> = {};
  for (const [key, value] of Object.entries(weighted)) {
    const model = RLM_MODEL[key];
    if (model) {
      corrected[key] = model.w1 * value + model.w2;
    } else {
      corrected[key] = value;
    }
  }
  return corrected;
}

/**
 * 第三步：焦炭预测（分炉组）
 */
function predictCoke(ovenCoal: Record<string, number>, furnaceGroup: string): Record<string, number> {
  const regression = COKE_REGRESSION[furnaceGroup];
  if (!regression) {
    throw new Error(`未知炉组: ${furnaceGroup}，支持: 一期、二期、小焦炉`);
  }

  const coke: Record<string, number> = {};
  for (const [key, params] of Object.entries(regression)) {
    const inputKey = key === 'm40' ? 'm' : key === 'm25' ? 'm' : key === 'm10' ? 'm' : key;
    // 对于M40/M25/M10，用入炉煤的m指标
    const inputVal = key === 'm40' || key === 'm25' || key === 'm10'
      ? ovenCoal['m'] ?? 0
      : ovenCoal[key] ?? 0;
    coke[key] = params.a * inputVal + params.b;
  }

  return coke;
}

/**
 * 第四步：化产品预测
 */
function predictChemical(ovenCoal: Record<string, number>): Record<string, number> {
  const v = ovenCoal['v'] ?? 28;
  return {
    cokeRate: CHEMICAL_YIELD.cokeRate.base + CHEMICAL_YIELD.cokeRate.v_factor * v,
    tar: CHEMICAL_YIELD.tar.base + CHEMICAL_YIELD.tar.v_factor * v,
    crudeBenzene: CHEMICAL_YIELD.crudeBenzene.base + CHEMICAL_YIELD.crudeBenzene.v_factor * v,
    ammoniumSulfate: CHEMICAL_YIELD.ammoniumSulfate.base + CHEMICAL_YIELD.ammoniumSulfate.v_factor * v,
  };
}

/**
 * 综合经济指标计算
 */
function calcEconomics(
  coals: CoalData[],
  chemical: Record<string, number>,
  chemPrices: Record<string, number> = {},
): Record<string, number> {
  // 吨煤成本
  const totalRatio = coals.reduce((sum, c) => sum + c.ratio, 0);
  const costPerTon = coals.reduce((sum, c) => {
    return sum + (c.arrival_price || c.financial_price || 0) * (c.ratio / totalRatio);
  }, 0);

  // 化产品产值
  const chemRevenue =
    (chemical.tar || 0) * (chemPrices.tar || 3000) +
    (chemical.crudeBenzene || 0) * (chemPrices.crude_benzene || 6000) +
    (chemical.ammoniumSulfate || 0) * (chemPrices.ammonium_sulfate || 1200);

  // 焦炭产值（按成焦率折算）
  const cokeRevenue = (chemical.cokeRate || 0.75) * (chemPrices.coke || 2000);

  return {
    costPerTon,
    chemRevenue,
    cokeRevenue,
    totalRevenue: chemRevenue + cokeRevenue,
    profit: chemRevenue + cokeRevenue - costPerTon,
  };
}

/**
 * 主预测函数
 */
export function predict(
  coals: CoalData[],
  furnaceGroup: string,
  chemPrices?: Record<string, number>,
): PredictionResult {
  // 第一步：加权平均
  const weighted = calcWeightedAverage(coals);

  // 第二步：线性校正
  const ovenCoal = linearCorrection(weighted);

  // 第三步：焦炭预测
  const coke = predictCoke(ovenCoal, furnaceGroup);

  // 第四步：化产品预测
  const chemical = predictChemical(ovenCoal);

  // 经济指标
  const economics = calcEconomics(coals, chemical, chemPrices);

  return {
    weighted,
    ovenCoal,
    coke,
    chemical,
    economics,
  };
}

/**
 * 配比规划优化：全枚举搜索
 * 以合同指标为约束，最大化化产品产值
 */
export function optimizeBlending(
  candidateCoals: CoalData[],
  furnaceGroup: string,
  contractConstraints: Record<string, { min?: number; max?: number }>,
  chemPrices?: Record<string, number>,
  stepPercent: number = 1,
): { best: PredictionResult | null; coals: CoalData[]; message: string } {
  const n = candidateCoals.length;
  if (n < 2) {
    return { best: null, coals: candidateCoals, message: '至少需要2种煤参与优化' };
  }

  // 生成所有可能的配比组合（步长stepPercent）
  const steps = Math.floor(100 / stepPercent);
  let bestResult: PredictionResult | null = null;
  let bestCoals: CoalData[] = [];
  let bestProfit = -Infinity;

  // 递归枚举
  function enumerate(idx: number, remaining: number, current: CoalData[]) {
    if (idx === n - 1) {
      if (remaining <= 0) return;
      const testCoals = current.map(c => ({ ...c }));
      testCoals[idx] = { ...candidateCoals[idx], ratio: remaining };

      // 验证配比合计
      const total = testCoals.reduce((s, c) => s + c.ratio, 0);
      if (Math.abs(total - 100) > 0.01) return;

      try {
        const result = predict(testCoals, furnaceGroup, chemPrices);

        // 检查合同约束
        let satisfied = true;
        for (const [key, constraint] of Object.entries(contractConstraints)) {
          const val = result.coke[key];
          if (val === undefined) continue;
          if (constraint.min !== undefined && val < constraint.min) { satisfied = false; break; }
          if (constraint.max !== undefined && val > constraint.max) { satisfied = false; break; }
        }

        if (satisfied && result.economics.profit > bestProfit) {
          bestProfit = result.economics.profit;
          bestResult = result;
          bestCoals = testCoals;
        }
      } catch {
        // 跳过无效组合
      }
      return;
    }

    for (let r = stepPercent; r <= remaining - (n - idx - 1) * stepPercent; r += stepPercent) {
      current[idx] = { ...candidateCoals[idx], ratio: r };
      enumerate(idx + 1, remaining - r, current);
    }
  }

  enumerate(0, 100, new Array(n).fill(null));

  if (!bestResult) {
    return { best: null, coals: candidateCoals, message: '未找到满足合同约束的可行配比方案，请放宽约束条件' };
  }

  return { best: bestResult, coals: bestCoals, message: '优化成功' };
}