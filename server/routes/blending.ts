import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { predict, optimizeBlending, CoalData } from '../services/prediction';

const router = Router();

// 获取配比列表
router.get('/api/ycpb', (req: Request, res: Response) => {
  const db = getDb();
  const { page = '1', pageSize = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
  const limit = parseInt(pageSize as string);

  const total = (db.prepare('SELECT COUNT(*) as cnt FROM ycpb').get() as any).cnt;
  const list = db.prepare('SELECT * FROM ycpb ORDER BY date DESC, id DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({ success: true, data: { list, total, page: parseInt(page as string), pageSize: limit } });
});

// 获取单个配比（含明细）
router.get('/api/ycpb/:id', (req: Request, res: Response) => {
  const db = getDb();
  const header = db.prepare('SELECT * FROM ycpb WHERE id=?').get(req.params.id);
  if (!header) {
    res.status(404).json({ success: false, error: '未找到配比方案' });
    return;
  }
  const details = db.prepare('SELECT * FROM ycpb_detail WHERE ycpb_id=? ORDER BY bin_no').all(req.params.id);
  res.json({ success: true, data: { ...header as any, details } });
});

// 创建配比
router.post('/api/ycpb', (req: Request, res: Response) => {
  const { date, furnace_group, plan_name, details } = req.body;
  if (!date || !furnace_group || !plan_name) {
    res.status(400).json({ success: false, error: '日期、炉组和方案名称为必填项' });
    return;
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO ycpb (date, furnace_group, plan_name) VALUES (?, ?, ?)'
  ).run(date, furnace_group, plan_name);
  const ycpbId = result.lastInsertRowid;

  if (details && Array.isArray(details)) {
    const insert = db.prepare(`
      INSERT INTO ycpb_detail (ycpb_id, bin_no, coal_name, kind_code, ratio,
        ad, v, s, g, y, x, b, r, m, cri, csr, financial_price, arrival_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of details) {
      insert.run(ycpbId, d.bin_no, d.coal_name, d.kind_code, d.ratio,
        d.ad, d.v, d.s, d.g, d.y, d.x, d.b, d.r, d.m, d.cri, d.csr,
        d.financial_price, d.arrival_price);
    }
    // 更新合计配比
    const total = details.reduce((s: number, d: any) => s + (d.ratio || 0), 0);
    db.prepare('UPDATE ycpb SET total_ratio=? WHERE id=?').run(total, ycpbId);
  }

  res.json({ success: true, data: { id: ycpbId } });
});

// 更新配比
router.put('/api/ycpb/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { date, furnace_group, plan_name, details } = req.body;
  const db = getDb();

  db.prepare(
    'UPDATE ycpb SET date=?, furnace_group=?, plan_name=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?'
  ).run(date, furnace_group, plan_name, id);

  if (details && Array.isArray(details)) {
    db.prepare('DELETE FROM ycpb_detail WHERE ycpb_id=?').run(id);
    const insert = db.prepare(`
      INSERT INTO ycpb_detail (ycpb_id, bin_no, coal_name, kind_code, ratio,
        ad, v, s, g, y, x, b, r, m, cri, csr, financial_price, arrival_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of details) {
      insert.run(id, d.bin_no, d.coal_name, d.kind_code, d.ratio,
        d.ad, d.v, d.s, d.g, d.y, d.x, d.b, d.r, d.m, d.cri, d.csr,
        d.financial_price, d.arrival_price);
    }
    const total = details.reduce((s: number, d: any) => s + (d.ratio || 0), 0);
    db.prepare('UPDATE ycpb SET total_ratio=? WHERE id=?').run(total, id);
  }

  res.json({ success: true });
});

// 删除配比
router.delete('/api/ycpb/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM ycpb_detail WHERE ycpb_id=?').run(req.params.id);
  db.prepare('DELETE FROM ycpb WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === 预测接口 ===

// 预测
router.post('/api/ycpb/predict', (req: Request, res: Response) => {
  const { coals, furnace_group } = req.body;
  if (!coals || !Array.isArray(coals) || coals.length === 0) {
    res.status(400).json({ success: false, error: '请提供配煤数据' });
    return;
  }
  if (!furnace_group) {
    res.status(400).json({ success: false, error: '请指定炉组' });
    return;
  }

  try {
    // 获取最新化产品价格
    const db = getDb();
    const latestChemPrice = db.prepare('SELECT * FROM chem_price ORDER BY date DESC LIMIT 1').get() as any;
    const chemPrices: Record<string, number> = latestChemPrice ? {
      tar: latestChemPrice.tar || 0,
      crude_benzene: latestChemPrice.crude_benzene || 0,
      ammonium_sulfate: latestChemPrice.ammonium_sulfate || 0,
      coke: latestChemPrice.coke || 0,
    } : {};

    const result = predict(coals as CoalData[], furnace_group, chemPrices);

    // 保存预测结果到配比记录
    if (req.body.ycpb_id) {
      db.prepare('UPDATE ycpb SET predicted_json=?, status=\'predicted\' WHERE id=?')
        .run(JSON.stringify(result), req.body.ycpb_id);
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 配比优化
router.post('/api/ycpb/optimize', (req: Request, res: Response) => {
  const { coals, furnace_group, constraints } = req.body;
  if (!coals || !Array.isArray(coals) || coals.length < 2) {
    res.status(400).json({ success: false, error: '至少需要2种煤参与优化' });
    return;
  }

  try {
    const db = getDb();
    const latestChemPrice = db.prepare('SELECT * FROM chem_price ORDER BY date DESC LIMIT 1').get() as any;
    const chemPrices: Record<string, number> = latestChemPrice ? {
      tar: latestChemPrice.tar || 0,
      crude_benzene: latestChemPrice.crude_benzene || 0,
      ammonium_sulfate: latestChemPrice.ammonium_sulfate || 0,
      coke: latestChemPrice.coke || 0,
    } : {};

    const result = optimizeBlending(coals, furnace_group, constraints || {}, chemPrices);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;