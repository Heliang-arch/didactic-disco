// 种子数据 - 初始化演示数据
import { getDb } from './database';

export function seedData(): void {
  const db = getDb();

  // 检查是否已有数据
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM coal_kind').get() as any).cnt;
  if (count > 0) return;

  console.log('🌱 Seeding initial data...');

  // 煤种分类（两级树形）
  const kinds = [
    // 一级分类
    { code: 'A', name: '焦煤', parent_code: null },
    { code: 'B', name: '肥煤', parent_code: null },
    { code: 'C', name: '瘦煤', parent_code: null },
    { code: 'D', name: '气煤', parent_code: null },
    { code: 'E', name: '1/3焦煤', parent_code: null },
    // 二级分类
    { code: 'A01', name: '主焦煤', parent_code: 'A' },
    { code: 'A02', name: '优质焦煤', parent_code: 'A' },
    { code: 'B01', name: '主肥煤', parent_code: 'B' },
    { code: 'B02', name: '高硫肥煤', parent_code: 'B' },
    { code: 'C01', name: '主瘦煤', parent_code: 'C' },
    { code: 'C02', name: '低硫瘦煤', parent_code: 'C' },
    { code: 'D01', name: '主气煤', parent_code: 'D' },
    { code: 'D02', name: '高挥发气煤', parent_code: 'D' },
    { code: 'E01', name: '1/3主焦煤', parent_code: 'E' },
  ];

  const insertKind = db.prepare('INSERT INTO coal_kind (code, name, parent_code) VALUES (?, ?, ?)');
  for (const k of kinds) {
    insertKind.run(k.code, k.name, k.parent_code);
  }

  // 煤名→煤种映射
  const coalToKind = [
    { coal_name: '山西焦煤', kind_code: 'A01' },
    { coal_name: '河北焦煤', kind_code: 'A01' },
    { coal_name: '山东焦煤', kind_code: 'A02' },
    { coal_name: '淮南焦煤', kind_code: 'A02' },
    { coal_name: '山西肥煤', kind_code: 'B01' },
    { coal_name: '开滦肥煤', kind_code: 'B01' },
    { coal_name: '高硫肥煤', kind_code: 'B02' },
    { coal_name: '山西瘦煤', kind_code: 'C01' },
    { coal_name: '河南瘦煤', kind_code: 'C01' },
    { coal_name: '低硫瘦煤', kind_code: 'C02' },
    { coal_name: '山西气煤', kind_code: 'D01' },
    { coal_name: '陕西气煤', kind_code: 'D01' },
    { coal_name: '高挥发气煤', kind_code: 'D02' },
    { coal_name: '1/3焦煤-山西', kind_code: 'E01' },
    { coal_name: '1/3焦煤-河北', kind_code: 'E01' },
  ];

  const insertCTK = db.prepare('INSERT INTO coal_to_kind (coal_name, kind_code) VALUES (?, ?)');
  for (const c of coalToKind) {
    insertCTK.run(c.coal_name, c.kind_code);
  }

  // 煤库存
  const stocks = [
    { date: '2025-08-01', coal_name: '山西焦煤', stock: 8500 },
    { date: '2025-08-01', coal_name: '河北焦煤', stock: 6200 },
    { date: '2025-08-01', coal_name: '山西肥煤', stock: 4300 },
    { date: '2025-08-01', coal_name: '山西瘦煤', stock: 2800 },
    { date: '2025-08-01', coal_name: '山西气煤', stock: 150 },
    { date: '2025-08-01', coal_name: '1/3焦煤-山西', stock: 5100 },
  ];

  const insertStock = db.prepare('INSERT INTO coal_stock (date, coal_name, stock) VALUES (?, ?, ?)');
  for (const s of stocks) {
    insertStock.run(s.date, s.coal_name, s.stock);
  }

  // 煤价格
  const prices = [
    { date: '2025-08-01', coal_name: '山西焦煤', financial_price: 1850, arrival_price: 1920 },
    { date: '2025-08-01', coal_name: '河北焦煤', financial_price: 1780, arrival_price: 1850 },
    { date: '2025-08-01', coal_name: '山西肥煤', financial_price: 1650, arrival_price: 1720 },
    { date: '2025-08-01', coal_name: '山西瘦煤', financial_price: 1550, arrival_price: 1620 },
    { date: '2025-08-01', coal_name: '山西气煤', financial_price: 1350, arrival_price: 1420 },
    { date: '2025-08-01', coal_name: '1/3焦煤-山西', financial_price: 1450, arrival_price: 1520 },
  ];

  const insertPrice = db.prepare('INSERT INTO coal_price (date, coal_name, financial_price, arrival_price) VALUES (?, ?, ?, ?)');
  for (const p of prices) {
    insertPrice.run(p.date, p.coal_name, p.financial_price, p.arrival_price);
  }

  // 化产品价格
  db.prepare(`
    INSERT INTO chem_price (date, electricity, tar, crude_benzene, ammonium_sulfate, gas, coke_powder, coke_nut, coke)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('2025-08-01', 0.65, 3200, 5800, 1250, 1.8, 850, 1200, 2100);

  // 合同指标
  const contracts = [
    { date: '2025-08-01', furnace_group: '一期', m40: 82, m25: 88, m10: 7.5, csr: 62, cri: 26, ad: 12.5, v: 1.2, s: 0.7 },
    { date: '2025-08-01', furnace_group: '二期', m40: 83, m25: 89, m10: 7.0, csr: 63, cri: 25, ad: 12.0, v: 1.1, s: 0.65 },
    { date: '2025-08-01', furnace_group: '小焦炉', m40: 80, m25: 86, m10: 8.0, csr: 60, cri: 27, ad: 13.0, v: 1.3, s: 0.75 },
  ];

  const insertContract = db.prepare(`
    INSERT INTO contract_coke (date, furnace_group, m40, m25, m10, csr, cri, ad, v, s)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of contracts) {
    insertContract.run(c.date, c.furnace_group, c.m40, c.m25, c.m10, c.csr, c.cri, c.ad, c.v, c.s);
  }

  console.log('✅ Seed data inserted successfully');
}