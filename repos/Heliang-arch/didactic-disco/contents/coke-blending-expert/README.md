# 焦化厂配煤专家系统（数学建模 + 数据流水线）

LP 配煤优化与库存/物流排程系统：从每日业务台账（库存/船运/铁运/质量 CSV）出发，
构建配比优化、15 天库存排程、采购建议、在途跟踪的完整数据流水线。
当前口径版本 **v9.4**（详见 `build/STATE.md` 口径演进记录）。

## 目录结构

```
coke-blending-expert/
├── build/                  # 代码（Python 3, 依赖 numpy / scipy）
│   ├── preprocess.py       # 数据预处理: 台账CSV -> appdata/dataset.json
│   ├── solver.py           # 求解器: LP配比优化 + 排程 + 采购建议 -> appdata/results.json
│   ├── byproduct_opt.py    # 副产物抵扣净成本分析(反算验证 + 双口径最优)
│   ├── analysis_6day*.py   # 历史六天三模式分析
│   ├── STATE.md            # 口径与规则演进记录(v1~v9.4, 最重要的文档)
│   └── appdata/            # 各阶段产物 JSON
└── data/                   # 业务台账与规格书(真实生产数据)
    ├── 2026.9.x库存/船运/质量/铁运*.csv   # 每日快照
    └── 焦化厂配煤专家系统_*.md            # 需求与数学模型规格书
```

## 运行

```bash
cd build
python3 preprocess.py      # 读 ../data 下最新快照 -> appdata/dataset.json
python3 solver.py          # LP优化+排程 -> appdata/results.json
python3 byproduct_opt.py   # 副产物净成本分析(追加 results.json 的 byproduct 段)
```

## 数学模型（摘要）

- 决策变量 x_i = 各煤种干基配比(%)，目标 min 干基成本 Σ p_i/(1−Mt_i/100)·x_i/100
- 约束：Σx=100；配合煤 Ad≤10.5 / Vdaf∈[24,30] / St.d≤0.90；
  焦炭 Ad_c≤13.0、S_c≤0.70（保守 K 线性化求解 + 精确 K 复核双保险）；
  结构 主焦+肥≥45%、气煤≤15%；库存 x_i·D/100 ≤ 可用量
- 成焦率 K=(100−V_d)/0.989+0.9，V_d=Vdaf·(1−Ad/100)；
  Ad_c=Ad/K×100，S_c=St.d×0.7/K×100
- 副产物产率（v=V_d）：焦油%=1.53v−19.4−0.026v²；粗苯%=0.144v−1.82−0.0016v²；
  硫铵 kg/t=0.144v−1.8−0.0016v²

## 数据口径要点（v9.4）

- 库存锚点 = 9.10 快照 205.5 万吨（煤场口径 LJM1/LJM4/LJM5/BFM5，只能读 T-1）
- 日耗 = 9.9/9.10 两份全天到厂台账均值 16,522 t/天
- 船-铁关联按采购订单号（船名仅参考）；到港后 3~8 天首批进厂，疏运约 4,250 t/天
- 煤价/焦价/副产物价均为示例价（真实价格未提供），成本绝对值仅演示

完整规则与决策记录见 `build/STATE.md`。
