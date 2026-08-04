# 项目上下文

## 焦化厂配煤专家系统 MVP

**技术栈**
- 前端：React 19 + TypeScript + Ant Design 5 + ECharts
- 后端：Node.js Express + SQLite (better-sqlite3)
- 构建：Vite 7 (前端) + tsup (后端打包)
- 包管理：pnpm

## 目录结构

```
├── scripts/               # 构建与启动脚本
│   ├── build.sh           # 构建脚本
│   ├── dev.sh             # 开发环境启动脚本
│   └── start.sh           # 生产环境启动脚本
├── server/                # 后端服务
│   ├── db/
│   │   ├── database.ts    # SQLite 数据库初始化与Schema
│   │   └── seed.ts        # 种子数据
│   ├── routes/
│   │   ├── index.ts       # 路由聚合
│   │   ├── coal-kind.ts   # 煤种字典管理
│   │   ├── blending.ts    # 配比管理 + 预测接口
│   │   ├── contract.ts    # 合同指标管理
│   │   ├── inventory.ts   # 库存与价格管理
│   │   └── dashboard.ts   # 仪表盘数据
│   ├── services/
│   │   └── prediction.ts  # 质量预测引擎核心算法
│   ├── server.ts          # Express 入口
│   └── vite.ts            # Vite中间件集成
├── src/                   # 前端源码
│   ├── api/
│   │   └── client.ts      # API 客户端
│   ├── pages/
│   │   ├── Dashboard.tsx  # 仪表盘
│   │   ├── CoalKind.tsx   # 煤种字典
│   │   ├── Blending.tsx   # 配比管理
│   │   ├── Contract.tsx   # 合同指标
│   │   └── Inventory.tsx  # 库存价格
│   ├── App.tsx            # 路由配置
│   ├── Layout.tsx         # 主布局
│   ├── index.css          # 全局样式（深色主题）
│   ├── index.tsx          # React 入口
│   └── main.ts            # 保留文件
├── index.html             # 入口 HTML
├── package.json
├── tsconfig.json
├── vite.config.ts
├── AGENTS.md
└── DESIGN.md
```

## 核心功能模块

1. **煤种字典管理**：两级树形编码 + 煤名映射，CRUD
2. **配比管理**：人工配比（YCPB）+ 配比规划优化（全枚举搜索）
3. **质量预测引擎**：加权平均 → 线性校正 → 焦炭预测 → 化产品预测
4. **合同指标管理**：按炉组逐日维护
5. **库存与价格管理**：煤库存/煤价格/化产品价格
6. **仪表盘首页**：今日概览/库存预警/质量趋势

## 开发规范

- 仅使用 pnpm 管理依赖
- 后端使用 Express + SQLite (better-sqlite3)
- 前端使用 React + Ant Design + ECharts
- 深色工业主题（参考 DESIGN.md）
- 所有 API 返回格式：`{ success: boolean, data?: any, error?: string }`

## API 接口列表

- `GET /api/coal-kinds` - 煤种分类列表
- `POST/PUT/DELETE /api/coal-kinds/:id` - CRUD
- `GET /api/coal-to-kinds` - 煤名映射列表
- `POST /api/ycpb/predict` - 质量预测
- `POST /api/ycpb/optimize` - 配比优化
- `GET/POST/PUT/DELETE /api/ycpb/:id` - 配比CRUD
- `GET/POST/DELETE /api/contracts/:id` - 合同指标
- `GET/POST/DELETE /api/coal-stocks/:id` - 库存
- `GET/POST/DELETE /api/coal-prices/:id` - 价格
- `GET/POST/DELETE /api/chem-prices/:id` - 化产品价格
- `GET /api/dashboard` - 仪表盘数据