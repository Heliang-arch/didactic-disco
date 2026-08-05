// 种子数据 - 基于真实煤种数据
import { getDb } from './database';

export function seedData(): void {
  const db = getDb();

  // 检查是否已有数据
  const count = db.prepare('SELECT COUNT(*) as cnt FROM coal_kind').get() as { cnt: number };
  if (count.cnt > 0) return;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // ========== 煤种分类字典 ==========
  const coalKinds = [
    // 一级分类
    { code: 'QM', name: '气煤', parent_code: null, safety_threshold: 3000, warning_threshold: 5000, critical_threshold: 2000 },
    { code: 'FM', name: '肥煤', parent_code: null, safety_threshold: 2000, warning_threshold: 4000, critical_threshold: 1500 },
    { code: '1/3JM', name: '1/3焦煤', parent_code: null, safety_threshold: 3000, warning_threshold: 5000, critical_threshold: 2000 },
    { code: 'JM', name: '主焦煤', parent_code: null, safety_threshold: 2000, warning_threshold: 4000, critical_threshold: 1500 },
    { code: 'PSM', name: '贫瘦煤', parent_code: null, safety_threshold: 1500, warning_threshold: 3000, critical_threshold: 1000 },
    { code: 'SJM', name: '瘦焦煤', parent_code: null, safety_threshold: 1500, warning_threshold: 3000, critical_threshold: 1000 },
    // 二级分类（煤种编码）
    { code: 'QM1', name: '气煤1(埃尔加)', parent_code: 'QM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: 'QM2', name: '气煤2(山焦)', parent_code: 'QM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: 'FM1', name: '肥煤1(盘江)', parent_code: 'FM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'FM2', name: '肥煤2(平顶山西)', parent_code: 'FM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'FM3', name: '肥煤3(美国)', parent_code: 'FM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: '1/3JM1', name: '1/3焦煤1(潘集西)', parent_code: '1/3JM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: '1/3JM2', name: '1/3焦煤2(芦岭)', parent_code: '1/3JM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: '1/3JM3', name: '1/3焦煤3(Shoal Creek)', parent_code: '1/3JM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: '1/3JM4', name: '1/3焦煤4(国内混煤)', parent_code: '1/3JM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: '1/3JM5', name: '1/3焦煤5(黑水)', parent_code: '1/3JM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: '1/3JM6', name: '1/3焦煤6(Dawson)', parent_code: '1/3JM', safety_threshold: 1500, warning_threshold: 2500, critical_threshold: 1000 },
    { code: 'JM1', name: '主焦煤1(瑞峰/瑞文/斯坦达)', parent_code: 'JM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'JM2', name: '主焦煤2(山西煤)', parent_code: 'JM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'JM3', name: '主焦煤3(国内混煤)', parent_code: 'JM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'JM4', name: '主焦煤4(多尼亚)', parent_code: 'JM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'JM5', name: '主焦煤5(蒙5)', parent_code: 'JM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'JM6', name: '主焦煤6(CUNUMA)', parent_code: 'JM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'JM7', name: '主焦煤7(广安)', parent_code: 'JM', safety_threshold: 1000, warning_threshold: 2000, critical_threshold: 800 },
    { code: 'PSM1', name: '贫瘦煤1(小宋/巴关河)', parent_code: 'PSM', safety_threshold: 800, warning_threshold: 1500, critical_threshold: 500 },
    { code: 'PSM2', name: '贫瘦煤2(海豚103)', parent_code: 'PSM', safety_threshold: 800, warning_threshold: 1500, critical_threshold: 500 },
    { code: 'SJM1', name: '瘦焦煤1(格里坪)', parent_code: 'SJM', safety_threshold: 800, warning_threshold: 1500, critical_threshold: 500 },
    { code: 'SJM2', name: '瘦焦煤2(AAML)', parent_code: 'SJM', safety_threshold: 800, warning_threshold: 1500, critical_threshold: 500 },
    { code: 'SJM3', name: '瘦焦煤3(离石)', parent_code: 'SJM', safety_threshold: 800, warning_threshold: 1500, critical_threshold: 500 },
  ];

  const insertKind = db.prepare('INSERT INTO coal_kind (code, name, parent_code, safety_threshold, warning_threshold, critical_threshold, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const k of coalKinds) {
    insertKind.run(k.code, k.name, k.parent_code, k.safety_threshold, k.warning_threshold, k.critical_threshold, now, now);
  }

  // ========== 煤名→煤种映射 ==========
  const coalToKinds = [
    { coal_name: 'QM1', kind_code: 'QM1' },
    { coal_name: 'QM2', kind_code: 'QM2' },
    { coal_name: 'FM1', kind_code: 'FM1' },
    { coal_name: 'FM2', kind_code: 'FM2' },
    { coal_name: 'FM3', kind_code: 'FM3' },
    { coal_name: '1/3JM1', kind_code: '1/3JM1' },
    { coal_name: '1/3JM2', kind_code: '1/3JM2' },
    { coal_name: '1/3JM3', kind_code: '1/3JM3' },
    { coal_name: '1/3JM4', kind_code: '1/3JM4' },
    { coal_name: '1/3JM5', kind_code: '1/3JM5' },
    { coal_name: '1/3JM6', kind_code: '1/3JM6' },
    { coal_name: 'JM1', kind_code: 'JM1' },
    { coal_name: 'JM2', kind_code: 'JM2' },
    { coal_name: 'JM3', kind_code: 'JM3' },
    { coal_name: 'JM4', kind_code: 'JM4' },
    { coal_name: 'JM5', kind_code: 'JM5' },
    { coal_name: 'JM6', kind_code: 'JM6' },
    { coal_name: 'JM7', kind_code: 'JM7' },
    { coal_name: 'PSM1', kind_code: 'PSM1' },
    { coal_name: 'PSM2', kind_code: 'PSM2' },
    { coal_name: 'SJM1', kind_code: 'SJM1' },
    { coal_name: 'SJM2', kind_code: 'SJM2' },
    { coal_name: 'SJM3', kind_code: 'SJM3' },
  ];

  const insertCoalToKind = db.prepare('INSERT INTO coal_to_kind (coal_name, kind_code, created_at, updated_at) VALUES (?, ?, ?, ?)');
  for (const c of coalToKinds) {
    insertCoalToKind.run(c.coal_name, c.kind_code, now, now);
  }

  // ========== 煤价格（按当前市价统一进价） ==========
  const coalPrices = [
    { coal_name: 'QM1', financial_price: 1150, arrival_price: 1200 },
    { coal_name: 'QM2', financial_price: 1200, arrival_price: 1250 },
    { coal_name: 'FM1', financial_price: 1650, arrival_price: 1720 },
    { coal_name: 'FM2', financial_price: 1580, arrival_price: 1650 },
    { coal_name: 'FM3', financial_price: 1750, arrival_price: 1820 },
    { coal_name: '1/3JM1', financial_price: 1350, arrival_price: 1420 },
    { coal_name: '1/3JM2', financial_price: 1380, arrival_price: 1450 },
    { coal_name: '1/3JM3', financial_price: 1800, arrival_price: 1870 },
    { coal_name: '1/3JM4', financial_price: 1400, arrival_price: 1470 },
    { coal_name: '1/3JM5', financial_price: 1420, arrival_price: 1490 },
    { coal_name: '1/3JM6', financial_price: 1780, arrival_price: 1850 },
    { coal_name: 'JM1', financial_price: 1900, arrival_price: 1970 },
    { coal_name: 'JM2', financial_price: 1850, arrival_price: 1920 },
    { coal_name: 'JM3', financial_price: 1880, arrival_price: 1950 },
    { coal_name: 'JM4', financial_price: 1820, arrival_price: 1890 },
    { coal_name: 'JM5', financial_price: 1950, arrival_price: 2020 },
    { coal_name: 'JM6', financial_price: 1800, arrival_price: 1870 },
    { coal_name: 'JM7', financial_price: 1750, arrival_price: 1820 },
    { coal_name: 'PSM1', financial_price: 1250, arrival_price: 1320 },
    { coal_name: 'PSM2', financial_price: 1280, arrival_price: 1350 },
    { coal_name: 'SJM1', financial_price: 1450, arrival_price: 1520 },
    { coal_name: 'SJM2', financial_price: 1600, arrival_price: 1670 },
    { coal_name: 'SJM3', financial_price: 1350, arrival_price: 1420 },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const insertPrice = db.prepare('INSERT INTO coal_price (date, coal_name, financial_price, arrival_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const p of coalPrices) {
    insertPrice.run(today, p.coal_name, p.financial_price, p.arrival_price, now, now);
  }

  // ========== 初始库存（基于Excel到厂表数据） ==========
  const initialStocks = [
    { coal_name: 'QM1', initial_qty: 8500 },
    { coal_name: 'QM2', initial_qty: 6200 },
    { coal_name: 'FM1', initial_qty: 4300 },
    { coal_name: 'FM2', initial_qty: 3800 },
    { coal_name: 'FM3', initial_qty: 2500 },
    { coal_name: '1/3JM1', initial_qty: 5100 },
    { coal_name: '1/3JM2', initial_qty: 4800 },
    { coal_name: '1/3JM3', initial_qty: 3200 },
    { coal_name: '1/3JM4', initial_qty: 4500 },
    { coal_name: '1/3JM5', initial_qty: 3800 },
    { coal_name: '1/3JM6', initial_qty: 2800 },
    { coal_name: 'JM1', initial_qty: 5500 },
    { coal_name: 'JM2', initial_qty: 4200 },
    { coal_name: 'JM3', initial_qty: 3800 },
    { coal_name: 'JM4', initial_qty: 3500 },
    { coal_name: 'JM5', initial_qty: 2800 },
    { coal_name: 'JM6', initial_qty: 2200 },
    { coal_name: 'JM7', initial_qty: 1800 },
    { coal_name: 'PSM1', initial_qty: 2500 },
    { coal_name: 'PSM2', initial_qty: 1800 },
    { coal_name: 'SJM1', initial_qty: 2200 },
    { coal_name: 'SJM2', initial_qty: 1500 },
    { coal_name: 'SJM3', initial_qty: 1200 },
  ];

  const insertStock = db.prepare('INSERT INTO initial_stock (coal_name, initial_qty, created_at, updated_at) VALUES (?, ?, ?, ?)');
  for (const s of initialStocks) {
    insertStock.run(s.coal_name, s.initial_qty, now, now);
  }

  // ========== 焦炭合同指标（2.0要求：Ad≤13.0%, St≤0.80%, CSR≥65%, CRI≤26%） ==========
  const contracts = [
    { date: today, furnace_group: '一期', m40: 82, m25: 88, m10: 7.0, csr: 65, cri: 26, ad: 13.0, v: 1.2, s: 0.80 },
    { date: today, furnace_group: '二期', m40: 83, m25: 89, m10: 6.5, csr: 66, cri: 25, ad: 12.5, v: 1.1, s: 0.75 },
    { date: today, furnace_group: '小焦炉', m40: 80, m25: 86, m10: 7.5, csr: 63, cri: 27, ad: 13.5, v: 1.3, s: 0.85 },
  ];

  const insertContract = db.prepare('INSERT INTO contract_coke (date, furnace_group, m40, m25, m10, csr, cri, ad, v, s, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const c of contracts) {
    insertContract.run(c.date, c.furnace_group, c.m40, c.m25, c.m10, c.csr, c.cri, c.ad, c.v, c.s, now, now);
  }

  // ========== 化产品价格 ==========
  const insertChemPrice = db.prepare('INSERT INTO chem_price (date, electricity, tar, crude_benzene, ammonium_sulfate, gas, coke_powder, coke_nut, coke, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertChemPrice.run(today, 0.65, 3200, 5800, 1250, 1.8, 850, 1200, 2100, now, now);

  // ========== 持有成本参数 ==========
  db.prepare('INSERT INTO holding_cost_params (daily_rate, created_at, updated_at) VALUES (?, ?, ?)').run(0.001, now, now);

  // ========== 排程配置 ==========
  const scheduleConfigs = [
    { key: 'optimization_horizon', value: '7', description: '排程优化时域（天）' },
    { key: 'formula_smoothness_limit', value: '15', description: '配方平滑性约束：相邻日配比最大变化(%)' },
    { key: 'warning_response_factor', value: '0.8', description: '预警响应系数：库存低于预警线时用量缩减比例' },
    { key: 'cost_weight', value: '0.4', description: '多目标优化权重：成本' },
    { key: 'quality_weight', value: '0.3', description: '多目标优化权重：质量' },
    { key: 'conversion_weight', value: '0.15', description: '多目标优化权重：转换代价' },
    { key: 'inventory_weight', value: '0.15', description: '多目标优化权重：库存风险' },
    { key: 'step_size', value: '1', description: '优化步长(%)' },
    { key: 'reliability_threshold', value: '50', description: '供应可靠性评分阈值' },
  ];

  const insertConfig = db.prepare('INSERT INTO schedule_config (key, value, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  for (const c of scheduleConfigs) {
    insertConfig.run(c.key, c.value, c.description, now, now);
  }

  // ========== 基准配比数据（来自Excel 11.28数据） ==========
  // 一期基准配比
  const baseRatioPeriod1 = [
    { coal_name: 'QM1', ratio: 11.0 },
    { coal_name: 'QM2', ratio: 5.0 },
    { coal_name: 'FM1', ratio: 10.0 },
    { coal_name: 'FM2', ratio: 8.0 },
    { coal_name: 'FM3', ratio: 5.0 },
    { coal_name: '1/3JM1', ratio: 10.0 },
    { coal_name: '1/3JM2', ratio: 8.0 },
    { coal_name: '1/3JM3', ratio: 5.0 },
    { coal_name: '1/3JM4', ratio: 8.0 },
    { coal_name: '1/3JM5', ratio: 5.0 },
    { coal_name: '1/3JM6', ratio: 3.0 },
    { coal_name: 'JM1', ratio: 5.0 },
    { coal_name: 'JM2', ratio: 3.0 },
    { coal_name: 'JM3', ratio: 2.0 },
    { coal_name: 'JM4', ratio: 2.0 },
    { coal_name: 'JM5', ratio: 2.0 },
    { coal_name: 'JM6', ratio: 2.0 },
    { coal_name: 'JM7', ratio: 2.0 },
    { coal_name: 'PSM1', ratio: 2.0 },
    { coal_name: 'PSM2', ratio: 1.0 },
    { coal_name: 'SJM1', ratio: 1.0 },
    { coal_name: 'SJM2', ratio: 0.0 },
    { coal_name: 'SJM3', ratio: 1.0 },
  ];

  // 创建基准配比方案
  const insertYcpb = db.prepare('INSERT INTO ycpb (date, furnace_group, plan_name, status, total_ratio, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertDetail = db.prepare('INSERT INTO ycpb_detail (ycpb_id, bin_no, coal_name, kind_code, ratio, ad, v, s, g, y, x, b, r, m, cri, csr, financial_price, arrival_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  // 煤种质量指标（基于Excel数据）
  const coalQuality: Record<string, { ad: number; v: number; s: number; g: number; y: number; x: number; b: number; r: number; m: number; cri: number; csr: number }> = {
    'QM1': { ad: 8.5, v: 30.5, s: 0.45, g: 45, y: 8, x: 25, b: 10, r: 48, m: 72, cri: 32, csr: 55 },
    'QM2': { ad: 9.0, v: 29.0, s: 0.50, g: 50, y: 9, x: 27, b: 11, r: 50, m: 74, cri: 30, csr: 58 },
    'FM1': { ad: 10.0, v: 28.0, s: 0.65, g: 85, y: 18, x: 35, b: 16, r: 58, m: 80, cri: 25, csr: 65 },
    'FM2': { ad: 10.5, v: 27.5, s: 0.70, g: 82, y: 17, x: 33, b: 15, r: 56, m: 78, cri: 26, csr: 63 },
    'FM3': { ad: 9.5, v: 29.0, s: 0.55, g: 88, y: 19, x: 36, b: 17, r: 60, m: 82, cri: 24, csr: 67 },
    '1/3JM1': { ad: 9.5, v: 28.0, s: 0.60, g: 65, y: 13, x: 30, b: 13, r: 52, m: 76, cri: 28, csr: 60 },
    '1/3JM2': { ad: 9.8, v: 27.5, s: 0.62, g: 68, y: 14, x: 31, b: 13.5, r: 54, m: 77, cri: 27, csr: 61 },
    '1/3JM3': { ad: 9.0, v: 29.5, s: 0.50, g: 72, y: 15, x: 32, b: 14, r: 56, m: 79, cri: 26, csr: 63 },
    '1/3JM4': { ad: 10.0, v: 27.0, s: 0.65, g: 62, y: 12, x: 28, b: 12, r: 50, m: 75, cri: 29, csr: 59 },
    '1/3JM5': { ad: 9.5, v: 28.5, s: 0.58, g: 66, y: 13.5, x: 30, b: 13, r: 53, m: 76, cri: 28, csr: 60 },
    '1/3JM6': { ad: 9.2, v: 29.0, s: 0.52, g: 70, y: 15, x: 32, b: 14, r: 55, m: 78, cri: 27, csr: 62 },
    'JM1': { ad: 10.5, v: 24.0, s: 0.75, g: 78, y: 16, x: 34, b: 15, r: 60, m: 82, cri: 24, csr: 68 },
    'JM2': { ad: 10.0, v: 25.0, s: 0.70, g: 75, y: 15, x: 32, b: 14, r: 58, m: 80, cri: 25, csr: 66 },
    'JM3': { ad: 10.2, v: 24.5, s: 0.72, g: 76, y: 15.5, x: 33, b: 14.5, r: 59, m: 81, cri: 24.5, csr: 67 },
    'JM4': { ad: 9.8, v: 25.5, s: 0.68, g: 74, y: 15, x: 32, b: 14, r: 57, m: 79, cri: 25.5, csr: 65 },
    'JM5': { ad: 10.8, v: 23.5, s: 0.78, g: 80, y: 17, x: 35, b: 16, r: 62, m: 83, cri: 23, csr: 69 },
    'JM6': { ad: 9.5, v: 26.0, s: 0.65, g: 72, y: 14, x: 31, b: 13, r: 56, m: 78, cri: 26, csr: 63 },
    'JM7': { ad: 10.0, v: 25.0, s: 0.70, g: 73, y: 14.5, x: 31, b: 13.5, r: 57, m: 79, cri: 25.5, csr: 64 },
    'PSM1': { ad: 10.5, v: 18.0, s: 0.55, g: 55, y: 8, x: 22, b: 8, r: 45, m: 70, cri: 30, csr: 56 },
    'PSM2': { ad: 11.0, v: 17.5, s: 0.58, g: 52, y: 7, x: 20, b: 7, r: 43, m: 68, cri: 31, csr: 54 },
    'SJM1': { ad: 10.0, v: 20.0, s: 0.60, g: 60, y: 10, x: 25, b: 10, r: 48, m: 73, cri: 28, csr: 60 },
    'SJM2': { ad: 9.5, v: 21.0, s: 0.55, g: 62, y: 11, x: 26, b: 11, r: 50, m: 75, cri: 27, csr: 62 },
    'SJM3': { ad: 10.5, v: 19.5, s: 0.62, g: 58, y: 9, x: 24, b: 9, r: 47, m: 72, cri: 29, csr: 58 },
  };

  // 插入一期基准配比
  const ycpbResult = insertYcpb.run(today, '一期', '基准配比(11.28)', 'completed', 100, now, now);
  const ycpbId = ycpbResult.lastInsertRowid as number;

  let binNo = 1;
  for (const item of baseRatioPeriod1) {
    const q = coalQuality[item.coal_name];
    const price = coalPrices.find(p => p.coal_name === item.coal_name);
    if (q && price) {
      insertDetail.run(ycpbId, binNo++, item.coal_name, item.coal_name, item.ratio,
        q.ad, q.v, q.s, q.g, q.y, q.x, q.b, q.r, q.m, q.cri, q.csr,
        price.financial_price, price.arrival_price);
    }
  }

  // ========== 到货计划（未来7天） ==========
  const insertArrival = db.prepare('INSERT INTO coal_arrival_plan (coal_name, arrival_date, quantity, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  const arrivalCoals = ['QM1', 'QM2', 'FM1', 'FM2', '1/3JM1', '1/3JM2', 'JM1', 'JM2', 'PSM1', 'SJM1'];
  for (let day = 1; day <= 7; day++) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().slice(0, 10);
    for (const coal of arrivalCoals) {
      const qty = Math.floor(200 + Math.random() * 800);
      insertArrival.run(coal, dateStr, qty, 'manual', now, now);
    }
  }

  console.log('[Seed] 种子数据初始化完成');
}
