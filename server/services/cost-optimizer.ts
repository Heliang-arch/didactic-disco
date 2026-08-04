// 成本优化计算服务
import { predict, CoalData } from './prediction';

export type { CoalData } from './prediction';

export interface CostResult {
  coal_name: string;
  purchase_price: number;
  holding_cost: number;
  total_cost: number;
}

export interface OptimizationResult {
  best_coals: CoalData[];
  best_cost: number;
  best_prediction: any;
  current_cost: number;
  saving: number;
  saving_percent: number;
  message: string;
}

export interface SensitivityResult {
  coal_name: string;
  base_cost: number;
  change_minus20: { total_cost: number; change: number; change_percent: number };
  change_minus10: { total_cost: number; change: number; change_percent: number };
  change_plus10: { total_cost: number; change: number; change_percent: number };
  change_plus20: { total_cost: number; change: number; change_percent: number };
  impact_score: number; // 影响程度评分
}

/**
 * 计算综合成本 = 采购价 + 持有成本
 */
export function calcComprehensiveCost(
  coalName: string,
  purchasePrice: number,
  holdingDays: number,
  dailyRate: number,
): CostResult {
  const holdingCost = purchasePrice * dailyRate * holdingDays;
  return {
    coal_name: coalName,
    purchase_price: purchasePrice,
    holding_cost: Math.round(holdingCost * 100) / 100,
    total_cost: Math.round((purchasePrice + holdingCost) * 100) / 100,
  };
}

/**
 * 成本优化：最小化配煤总成本
 * 目标函数：min Σ(配比i × 综合成本i)
 * 约束：质量达标 + 配比=100% + 库存充足 + 可靠性>=阈值
 */
export function optimizeByCost(
  candidateCoals: (CoalData & { coal_name: string; comprehensive_cost: number; available_stock: number; reliability_score: number })[],
  furnaceGroup: string,
  contractConstraints: Record<string, { min?: number; max?: number }>,
  reliabilityThreshold: number = 50,
  stepPercent: number = 1,
): OptimizationResult {
  const n = candidateCoals.length;
  if (n < 2) {
    return { best_coals: [], best_cost: Infinity, best_prediction: null, current_cost: 0, saving: 0, saving_percent: 0, message: '至少需要2种煤参与优化' };
  }

  // 过滤可靠性不足的煤种
  const eligible = candidateCoals.filter(c => c.reliability_score >= reliabilityThreshold);
  if (eligible.length < 2) {
    return { best_coals: [], best_cost: Infinity, best_prediction: null, current_cost: 0, saving: 0, saving_percent: 0, message: `可靠性评分>=${reliabilityThreshold}的煤种不足2种` };
  }

  let bestCost = Infinity;
  let bestCoals: CoalData[] = [];
  let bestPrediction: any = null;

  // 计算当前成本
  const currentCost = candidateCoals.reduce((s, c) => s + c.comprehensive_cost * (c.ratio / 100), 0);

  function enumerate(idx: number, remaining: number, current: CoalData[]) {
    if (idx === eligible.length - 1) {
      if (remaining <= 0) return;
      const testCoals = current.map(c => ({ ...c }));
      testCoals[idx] = { ...eligible[idx], ratio: remaining };

      // 检查库存约束
      for (const c of testCoals) {
        const orig = eligible.find(e => (e as any).coal_name === (c as any).coal_name);
        if (orig && c.ratio > (orig as any).available_stock / 10) return; // 简化约束
      }

      const total = testCoals.reduce((s, c) => s + c.ratio, 0);
      if (Math.abs(total - 100) > 0.01) return;

      try {
        const result = predict(testCoals, furnaceGroup);

        // 检查合同约束
        let satisfied = true;
        for (const [key, constraint] of Object.entries(contractConstraints)) {
          const val = result.coke[key];
          if (val === undefined) continue;
          if (constraint.min !== undefined && val < constraint.min) { satisfied = false; break; }
          if (constraint.max !== undefined && val > constraint.max) { satisfied = false; break; }
        }

        if (satisfied) {
          const cost = testCoals.reduce((s, c) => {
            const orig = eligible.find(e => (e as any).coal_name === (c as any).coal_name);
            return s + ((orig as any)?.comprehensive_cost || 0) * (c.ratio / 100);
          }, 0);

          if (cost < bestCost) {
            bestCost = cost;
            bestCoals = testCoals;
            bestPrediction = result;
          }
        }
      } catch {
        // 跳过无效组合
      }
      return;
    }

    for (let r = stepPercent; r <= remaining - (eligible.length - idx - 1) * stepPercent; r += stepPercent) {
      current[idx] = { ...eligible[idx], ratio: r };
      enumerate(idx + 1, remaining - r, current);
    }
  }

  enumerate(0, 100, new Array(eligible.length).fill(null));

  if (!bestPrediction) {
    return { best_coals: [], best_cost: Infinity, best_prediction: null, current_cost: currentCost, saving: 0, saving_percent: 0, message: '未找到满足约束的可行方案' };
  }

  const saving = currentCost - bestCost;
  return {
    best_coals: bestCoals,
    best_cost: Math.round(bestCost * 100) / 100,
    best_prediction: bestPrediction,
    current_cost: Math.round(currentCost * 100) / 100,
    saving: Math.round(saving * 100) / 100,
    saving_percent: currentCost > 0 ? Math.round((saving / currentCost) * 10000) / 100 : 0,
    message: '成本优化成功',
  };
}

/**
 * 成本敏感性分析
 */
export function calcSensitivity(
  baseCoals: CoalData[],
  coalCosts: { coal_name: string; total_cost: number }[],
  furnaceGroup: string,
): SensitivityResult[] {
  const results: SensitivityResult[] = [];

  // 计算基准总成本
  const baseTotalCost = baseCoals.reduce((s, c) => {
    const cost = coalCosts.find(cc => cc.coal_name === (c as any).coal_name);
    return s + (cost?.total_cost || 0) * (c.ratio / 100);
  }, 0);

  for (const coal of baseCoals) {
    const costItem = coalCosts.find(cc => cc.coal_name === (coal as any).coal_name);
    if (!costItem) continue;
    const baseCost = costItem.total_cost;

    const changes = [-0.2, -0.1, 0.1, 0.2];
    const changeResults: Record<string, any> = {};

    for (const pct of changes) {
      const newCost = baseCost * (1 + pct);
      const modifiedCoals = baseCoals.map(c => {
        if ((c as any).coal_name === costItem.coal_name) {
          return { ...c, arrival_price: c.arrival_price * (1 + pct) };
        }
        return c;
      });

      try {
        const result = predict(modifiedCoals, furnaceGroup);
        const newTotalCost = modifiedCoals.reduce((s, c) => {
          const ci = coalCosts.find(cc => cc.coal_name === (c as any).coal_name);
          const cCost = ci ? ci.total_cost * (1 + ((c as any).coal_name === costItem.coal_name ? pct : 0)) : 0;
          return s + cCost * (c.ratio / 100);
        }, 0);

        const key = pct < 0 ? `change_minus${Math.abs(pct * 100)}` : `change_plus${pct * 100}`;
        changeResults[key] = {
          total_cost: Math.round(newTotalCost * 100) / 100,
          change: Math.round((newTotalCost - baseTotalCost) * 100) / 100,
          change_percent: baseTotalCost > 0 ? Math.round(((newTotalCost - baseTotalCost) / baseTotalCost) * 10000) / 100 : 0,
        };
      } catch {
        const key = pct < 0 ? `change_minus${Math.abs(pct * 100)}` : `change_plus${pct * 100}`;
        changeResults[key] = { total_cost: 0, change: 0, change_percent: 0 };
      }
    }

    // 影响评分：基于±20%变化幅度
    const impactScore = Math.abs((changeResults.change_plus20?.change || 0) - (changeResults.change_minus20?.change || 0));

    results.push({
      coal_name: costItem.coal_name,
      base_cost: baseCost,
      change_minus20: changeResults.change_minus20 || { total_cost: 0, change: 0, change_percent: 0 },
      change_minus10: changeResults.change_minus10 || { total_cost: 0, change: 0, change_percent: 0 },
      change_plus10: changeResults.change_plus10 || { total_cost: 0, change: 0, change_percent: 0 },
      change_plus20: changeResults.change_plus20 || { total_cost: 0, change: 0, change_percent: 0 },
      impact_score: Math.round(impactScore * 100) / 100,
    });
  }

  // 按影响评分排序
  results.sort((a, b) => b.impact_score - a.impact_score);
  return results;
}
