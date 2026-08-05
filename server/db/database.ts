// 数据库初始化与Schema定义
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'data', 'coal-blending.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- 煤种分类字典（两级树形编码）
    CREATE TABLE IF NOT EXISTS coal_kind (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      parent_code TEXT,
      safety_threshold REAL DEFAULT 0,
      warning_threshold REAL DEFAULT 0,
      critical_threshold REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 煤名→煤种归类映射
    CREATE TABLE IF NOT EXISTS coal_to_kind (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coal_name TEXT NOT NULL UNIQUE,
      kind_code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (kind_code) REFERENCES coal_kind(code)
    );

    -- 人工配比表头（YCPB）
    CREATE TABLE IF NOT EXISTS ycpb (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      furnace_group TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      total_ratio REAL DEFAULT 0,
      predicted_json TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 人工配比明细
    CREATE TABLE IF NOT EXISTS ycpb_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ycpb_id INTEGER NOT NULL,
      bin_no INTEGER NOT NULL,
      coal_name TEXT NOT NULL,
      kind_code TEXT,
      ratio REAL NOT NULL DEFAULT 0,
      ad REAL, v REAL, s REAL, g REAL, y REAL,
      x REAL, b REAL, r REAL, m REAL,
      cri REAL, csr REAL,
      financial_price REAL DEFAULT 0,
      arrival_price REAL DEFAULT 0,
      FOREIGN KEY (ycpb_id) REFERENCES ycpb(id) ON DELETE CASCADE
    );

    -- 焦炭合同指标
    CREATE TABLE IF NOT EXISTS contract_coke (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      furnace_group TEXT NOT NULL,
      m40 REAL, m25 REAL, m10 REAL,
      csr REAL, cri REAL,
      ad REAL, v REAL, s REAL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 煤库存
    CREATE TABLE IF NOT EXISTS coal_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      coal_name TEXT NOT NULL,
      stock REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 煤价格
    CREATE TABLE IF NOT EXISTS coal_price (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      coal_name TEXT NOT NULL,
      financial_price REAL DEFAULT 0,
      arrival_price REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 化产品价格
    CREATE TABLE IF NOT EXISTS chem_price (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      electricity REAL DEFAULT 0,
      tar REAL DEFAULT 0,
      crude_benzene REAL DEFAULT 0,
      ammonium_sulfate REAL DEFAULT 0,
      gas REAL DEFAULT 0,
      coke_powder REAL DEFAULT 0,
      coke_nut REAL DEFAULT 0,
      coke REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 发运记录表
    CREATE TABLE IF NOT EXISTS shipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coal_name TEXT NOT NULL,
      ship_date TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      batch_no TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 初始库存表
    CREATE TABLE IF NOT EXISTS initial_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coal_name TEXT NOT NULL UNIQUE,
      initial_qty REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 持有成本参数配置
    CREATE TABLE IF NOT EXISTS holding_cost_params (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      daily_rate REAL NOT NULL DEFAULT 0.001,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 到货计划表（2.0新增）
    CREATE TABLE IF NOT EXISTS coal_arrival_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coal_name TEXT NOT NULL,
      arrival_date TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 排程历史表（2.0新增）
    CREATE TABLE IF NOT EXISTS schedule_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_date TEXT NOT NULL,
      furnace_group TEXT NOT NULL,
      formula_json TEXT NOT NULL,
      cost REAL DEFAULT 0,
      conversion_flag INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 排程配置表（2.0新增）
    CREATE TABLE IF NOT EXISTS schedule_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 安全迁移：为已存在的coal_kind表添加新列
  try { db.exec(`ALTER TABLE coal_kind ADD COLUMN warning_threshold REAL DEFAULT 0`); } catch { /* 列已存在 */ }
  try { db.exec(`ALTER TABLE coal_kind ADD COLUMN critical_threshold REAL DEFAULT 0`); } catch { /* 列已存在 */ }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
