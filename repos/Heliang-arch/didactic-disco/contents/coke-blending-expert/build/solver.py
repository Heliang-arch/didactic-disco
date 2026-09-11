# -*- coding: utf-8 -*-
"""
焦化厂配煤专家系统 — 数学模型核心求解器
实现《数学模型无歧义描述_V2》全部子模型:
  1) 质量预测链: 加权平均 -> RLM线性校正 -> 通用公式焦炭Ad_c/S_c -> 化产品产率
  2) 配煤优化: LP(scipy/highs), 含质量/结构/库存约束, 紧约束识别, 无可行解诊断
  3) 进销存排程: 15天递推(模式A历史均值 / 模式B配煤驱动), 断料风险, 采购建议
  4) 排程-配煤联动迭代
运行: python3 solver.py  ->  appdata/results.json
"""
import json, os, copy, datetime
import numpy as np
from scipy.optimize import linprog

HERE = os.path.dirname(__file__)
with open(os.path.join(HERE, 'appdata', 'dataset.json'), encoding='utf-8') as f:
    DS = json.load(f)

# ================= 默认参数（系统内全部可编辑） =================
# 煤价: 数据缺失（规格书附录A.4 P0缺口），以下为按煤类设定的示例价（湿基元/吨），仅用于演示成本优化
DEFAULT_PRICE_WET = {
    '1级主焦煤': 1650, '2级主焦煤': 1500, '3级主焦煤': 1350,
    '1级肥煤': 1450, '2级肥煤': 1350,
    '1级1/3焦煤': 1250, '2级1/3焦煤': 1150, '3级1/3焦煤': 1050,
    '1级贫瘦煤': 950, '国内贫瘦煤': 900, '2级瘦焦煤': 1300,
    '1级气煤': 1000, '2级气煤': 950,
}
# 配合煤质量约束（本版本仅 Ad/Vdaf/St.d 三项线性可加指标）
BLEND_QUALITY = {'Ad': (None, 10.50), 'Vdaf': (24.0, 30.0), 'St.d': (None, 0.90)}
# 焦炭质量约束（本版本仅通用公式 Ad_c/S_c 两项）
COKE_QUALITY = {'Ad_c': (None, 13.00), 'S_c': (None, 0.70)}
# 煤种结构约束: (名称, 煤类集合, 下限%, 上限%)
STRUCTURE = [
    ('主焦煤+肥煤合计', ['主焦煤', '肥煤'], 45.0, 100.0),
    ('气煤', ['气煤'], 0.0, 15.0),
]
# 排程参数
SCHEDULE_DAYS = 15
SCHEDULE_START = datetime.date(2026, 9, 12)       # 库存锚点=9.10快照(205.5万吨, 用户9-11确认);
                                                  # 9.10全天到厂17,223t已计入库存不重复计;
                                                  # 按库存平稳假设净零桥接; 9.11在途(制表当日到厂)计入9-12
L_MIN_SCHED = 3.0                                 # 排程硬约束最低库存线(天), 比水位线预警更严
CRITICAL_CLASSES = ('主焦煤', '肥煤')             # 关键煤种
# v6缓冲模型: 到货ETA(dataset)已含运输全程, 进厂后仅需检测缓冲1天
BUFFER = {'ship': 0, 'rail': 0, 'switch': 0, 'test': 1, 'repair': 3}
PURCHASE_MARGIN = 0.10                            # 采购安全裕量
# RLM校正系数（无实测-预测历史配对数据，按默认 w1=1, w2=0 不校正）
RLM = {'Ad': (1.0, 0.0), 'Vdaf': (1.0, 0.0), 'St.d': (1.0, 0.0)}
K_SULFUR = 0.7

COALS = [c for c in DS['coals'] if c['quality'].get('Ad') and c['quality'].get('Vdaf')
         and c['quality'].get('St.d') and c['quality'].get('水分')]
NAMES = [c['name'] for c in COALS]
M = len(COALS)
Q = {c['name']: c['quality'] for c in COALS}
DAILY_TOTAL = DS['meta']['totalDailyConsumption']   # 日均配合煤消耗(干基吨/天)

# ================= 1. 质量预测链 =================
def weighted(x):
    """加权平均(规格书6.2): q̄ = Σ q_i·x_i / 100"""
    return {k: float(np.dot([Q[n][k] for n in NAMES], x)) / 100.0
            for k in ('Ad', 'Vdaf', 'St.d', '水分')}

def rlm_correct(q):
    """RLM线性校正(规格书6.3): q̃ = w1·q̄ + w2，缺省 w1=1 w2=0"""
    return {k: RLM[k][0] * q[k] + RLM[k][1] for k in ('Ad', 'Vdaf', 'St.d')}

def conv_K(vdaf, ad):
    """干煤->焦炭换算系数(规格书B.3)。V 取干基挥发分 V_d = Vdaf·(1-Ad/100)"""
    v_d = vdaf * (1.0 - ad / 100.0)
    return (100.0 - v_d) / 0.989 + 0.9, v_d

def predict_coke(q):
    """通用公式(规格书7.4.1): 本版本仅启用 Ad_c / S_c（M40/M10/CRI/CSR依赖G/Y，忽略）"""
    K, v_d = conv_K(q['Vdaf'], q['Ad'])
    return {'K': K, 'V_d': v_d,
            'Ad_c': q['Ad'] / K * 100.0,
            'S_c': q['St.d'] * K_SULFUR / K * 100.0}

def predict_products(q):
    """化产品产率(规格书7.5), V取干基挥发分V_d。
    注意: 规格书B.5将成焦率写作 ηd=100/K，但按质量守恒(灰分守恒: Ad_c=Ad/ηd)
    应为 ηd=K(%)，规格书示例自算出135.7%亦自证矛盾，此处采用 ηd=K 并标注偏差。"""
    K, v_d = conv_K(q['Vdaf'], q['Ad'])
    v = v_d
    return {
        'cokeRatio': K,
        'LA': 0.144 * v - 1.8 - 0.0016 * v * v,          # 硫铵 kg/t干煤
        'JY': 1.53 * v - 19.4 - 0.026 * v * v,           # 焦油 %
        'CB': 0.144 * v - 1.82 - 0.0016 * v * v,         # 粗苯 %
        'gasYield': 60.0 + 10.0 * v,                      # 煤气 Nm³/t干煤(无歧义描述5.3.2)
        '_deviation_note': '成焦率按ηd=K实现(规格书B.5写100/K会得>100%，与典型值72-78%矛盾)',
    }

def dry_wet_ratio(x):
    """干基配比->湿基称量比例(规格书5.6): w_i = (x_i/(1-Mt_i/100)) / Σ"""
    f = np.array([x[i] / (1.0 - Q[n]['水分'] / 100.0) for i, n in enumerate(NAMES)])
    return f / f.sum() * 100.0

def price_dry(name):
    return DEFAULT_PRICE_WET[name] / (1.0 - Q[name]['水分'] / 100.0)

# ================= 2. 在途到货时间线与有效可用量 =================
def arrival_timeline():
    """{coal: {date: {ship: qty, rail: qty}}} — etaPlant=全部到厂日(v6点估计)"""
    tl = {}
    for s in DS['ships']:
        if not s.get('coal'): continue
        d = s['etaPlant']
        if d < SCHEDULE_START.isoformat():   # 防御: 估早于推演首日按首日计
            d = SCHEDULE_START.isoformat()
        tl.setdefault(s['coal'], {}).setdefault(d, {'ship': 0.0, 'rail': 0.0})
        tl[s['coal']][d]['ship'] += s['qty']
    for r in DS['rails']:
        if not r.get('coal'): continue
        d = r['etaPlant']
        if d < SCHEDULE_START.isoformat():
            d = SCHEDULE_START.isoformat()
        tl.setdefault(r['coal'], {}).setdefault(d, {'ship': 0.0, 'rail': 0.0})
        tl[r['coal']][d]['rail'] += r['qty']
    return tl

TIMELINE = arrival_timeline()

def usable_date(raw_date, kind):
    """v6: ETA已为进厂日, 进厂后仅检测缓冲"""
    d = datetime.date.fromisoformat(raw_date)
    return d + datetime.timedelta(days=BUFFER['test'])

def available_qty(coal, horizon_days):
    """周期内有效可用量 = 库存 + (可用日落在周期内的到货)"""
    s = next(c for c in COALS if c['name'] == coal)['latestInventory']
    detail = []
    end = SCHEDULE_START + datetime.timedelta(days=horizon_days - 1)
    for d, qr in TIMELINE.get(coal, {}).items():
        for kind in ('ship', 'rail'):
            if qr[kind] <= 0: continue
            ud = usable_date(d, kind)
            ok = SCHEDULE_START <= ud <= end
            detail.append({'etaPlant': d, 'kind': kind, 'qty': qr[kind],
                           'usableDate': ud.isoformat(), 'counted': ok})
            if ok: s += qr[kind]
    return s, detail

# ================= 3. LP 配比优化 =================
def blend_optimize(quality=BLEND_QUALITY, coke=COKE_QUALITY, structure=STRUCTURE,
                   coverage_days=1, use_inventory=True, prices=None):
    """
    LP(规格书5.5.2): min Σ p_dry·x/100
      s.t. Σx=100; 质量区间; 结构区间; 库存可用量 x_i·D/100 ≤ s_i
    焦炭约束线性化: Ad_c=Ad·100/K(V) 中 K 随 V 单调递减，取 V=Vdaf上限处 K 作保守值，
    求解后在最优点用精确 K 复核（见 verify）。
    """
    prices = prices or DEFAULT_PRICE_WET
    c = np.array([price_dry(n) for n in NAMES]) / 100.0
    A_ub, b_ub, labels = [], [], []
    # 配合煤质量
    for k, (lo, hi) in quality.items():
        row = np.array([Q[n][k] for n in NAMES]) / 100.0
        if hi is not None:
            A_ub.append(row); b_ub.append(hi); labels.append(f'配合煤{k}≤{hi}')
        if lo is not None:
            A_ub.append(-row); b_ub.append(-lo); labels.append(f'配合煤{k}≥{lo}')
    # 焦炭质量(保守K线性化)
    v_hi = quality['Vdaf'][1] if quality['Vdaf'][1] is not None else 40.0
    K_cons = (100.0 - v_hi * (1 - 0.09)) / 0.989 + 0.9   # Ad取~9%保守
    if coke.get('Ad_c', (None, None))[1] is not None:
        U = coke['Ad_c'][1]
        A_ub.append(np.array([Q[n]['Ad'] for n in NAMES]) / 100.0)
        b_ub.append(U * K_cons / 100.0); labels.append(f'焦炭Ad_c≤{U}(保守K={K_cons:.1f})')
    if coke.get('S_c', (None, None))[1] is not None:
        U = coke['S_c'][1]
        A_ub.append(np.array([Q[n]['St.d'] for n in NAMES]) / 100.0)
        b_ub.append(U * K_cons / 100.0 / K_SULFUR); labels.append(f'焦炭S_c≤{U}(保守K={K_cons:.1f})')
    # 结构约束
    for name, classes, lo, hi in structure:
        sel = np.array([1.0 if next(c for c in COALS if c['name'] == n)['coalClass'] in classes else 0.0
                        for n in NAMES])
        if hi is not None and hi < 100:
            A_ub.append(sel); b_ub.append(hi); labels.append(f'结构:{name}≤{hi}%')
        if lo is not None and lo > 0:
            A_ub.append(-sel); b_ub.append(-lo); labels.append(f'结构:{name}≥{lo}%')
    # 库存可用量
    supply_detail = {}
    if use_inventory:
        D = coverage_days * DAILY_TOTAL
        for i, n in enumerate(NAMES):
            s, det = available_qty(n, coverage_days)
            supply_detail[n] = {'available': round(s, 1), 'demand_at_100': round(D, 1), 'detail': det}
            row = np.zeros(M); row[i] = D / 100.0
            A_ub.append(row); b_ub.append(s); labels.append(f'库存:{n}')
    bounds = [(0.0, 100.0)] * M
    res = linprog(c, A_ub=np.array(A_ub) if A_ub else None,
                  b_ub=np.array(b_ub) if b_ub else None,
                  A_eq=np.ones((1, M)), b_eq=[100.0], bounds=bounds, method='highs')
    out = {'success': bool(res.success), 'coverage_days': coverage_days,
           'use_inventory': use_inventory, 'constraint_labels': labels,
           'supply_detail': supply_detail}
    if not res.success:
        out['diagnosis'] = diagnose_infeasibility(quality, coke, structure, coverage_days, use_inventory)
        return out
    x = np.round(res.x, 4)
    x = x / x.sum() * 100.0   # 归一闭合
    out.update(evaluate(x, quality, coke, structure, prices))
    out['cost_wet_example'] = float(np.dot([prices[n] for n in NAMES], x)) / 100.0
    # 紧约束: 在最优解处取等(容差1e-6)的不等式约束
    tight = []
    if A_ub:
        slack = np.array(b_ub) - np.array(A_ub) @ x
        tight = [labels[i] for i, s_ in enumerate(slack) if s_ < 1e-3]
    out['tight_constraints'] = tight
    return out

def evaluate(x, quality, coke, structure, prices):
    """在最优点做完整推算与精确复核"""
    wq = weighted(x)
    cq = rlm_correct(wq)
    coke_p = predict_coke(cq)
    prod = predict_products(cq)
    checks = []
    TOL = 1e-4   # 边界容差: LP解经4位小数舍入+归一后, 加权指标存在~1e-5量级抖动
    for k, (lo, hi) in quality.items():
        v = wq[k]
        ok = (lo is None or v >= lo - TOL) and (hi is None or v <= hi + TOL)
        checks.append({'item': f'配合煤{k}', 'value': round(v, 3),
                       'req': f"[{lo if lo else '-'},{hi if hi else '-'}]", 'pass': bool(ok)})
    for k, (lo, hi) in coke.items():
        v = coke_p[k]
        ok = (lo is None or v >= lo - TOL) and (hi is None or v <= hi + TOL)
        checks.append({'item': f'焦炭{k}(精确K复核)', 'value': round(v, 3),
                       'req': f"≤{hi}", 'pass': bool(ok)})
    for name, classes, lo, hi in structure:
        v = sum(x[i] for i, n in enumerate(NAMES)
                if next(cc for cc in COALS if cc['name'] == n)['coalClass'] in classes)
        ok = (lo is None or v >= lo - TOL) and (hi is None or v <= hi + TOL)
        checks.append({'item': f'结构:{name}', 'value': round(v, 2),
                       'req': f"[{lo},{hi}]", 'pass': bool(ok)})
    checks.append({'item': '配比闭合Σx', 'value': round(float(x.sum()), 4), 'req': '=100', 'pass': True})
    return {
        'x': {n: round(float(x[i]), 2) for i, n in enumerate(NAMES) if x[i] > 1e-6},
        'x_wet': {n: round(float(v), 2) for i, (n, v) in enumerate(zip(NAMES, dry_wet_ratio(x))) if x[i] > 1e-6},
        'cost_dry': round(float(np.dot([price_dry(n) for n in NAMES], x)) / 100.0, 2),
        'blend_weighted': {k: round(v, 3) for k, v in wq.items()},
        'blend_corrected': {k: round(v, 3) for k, v in cq.items()},
        'coke': {k: round(v, 3) for k, v in coke_p.items()},
        'products': {k: (round(v, 3) if isinstance(v, float) else v) for k, v in prod.items()},
        'constraint_checks': checks,
        'all_pass': bool(all(c_['pass'] for c_ in checks)),
    }

def diagnose_infeasibility(quality, coke, structure, coverage_days, use_inventory):
    """无可行解诊断(规格书5.7): 至少列出一组冲突与放宽建议"""
    diags = []
    s_hi = max(Q[n]['St.d'] for n in NAMES); s_lo = min(Q[n]['St.d'] for n in NAMES)
    a_hi = max(Q[n]['Ad'] for n in NAMES); a_lo = min(Q[n]['Ad'] for n in NAMES)
    U_S = quality['St.d'][1]; U_A = quality['Ad'][1]
    if U_S is not None and s_lo > U_S:
        diags.append(f"硫上限冲突: 全部候选煤St.d最小值{s_lo:.3f}%仍高于上限{U_S}%，建议放宽至≥{s_lo:.2f}%")
    elif U_S is not None and s_lo <= U_S < s_hi:
        high_s = [n for n in NAMES if Q[n]['St.d'] > U_S]
        diags.append(f"硫上限收紧了可用煤池: 高硫煤{','.join(high_s)}无法使用(其St.d均>上限{U_S}%)，"
                     f"若结构/库存约束强制使用则冲突，建议放宽硫上限或调整结构下限")
    if U_A is not None and a_lo > U_A:
        diags.append(f"灰分上限冲突: 全部候选煤Ad最小值{a_lo:.2f}%高于上限{U_A}%，建议放宽至≥{a_lo:.2f}%")
    if use_inventory:
        D = coverage_days * DAILY_TOTAL
        tot = sum(next(c for c in COALS if c['name'] == n)['latestInventory'] for n in NAMES)
        tot_eff = sum(available_qty(n, coverage_days)[0] for n in NAMES)
        if tot_eff < D:
            diags.append(f"库存可用量不足: 周期需求{D:,.0f}吨 > 全部煤种有效可用量{tot_eff:,.0f}吨"
                         f"(库存{tot:,.0f}+周期内可用到货)，任何配比都不可行。"
                         f"建议: 缩短覆盖天数至{max(1,int(tot_eff//DAILY_TOTAL))}天以内，或按采购建议补货")
        else:
            short = []
            for n in NAMES:
                s, _ = available_qty(n, coverage_days)
                if s < D * 0.05: short.append(n)
            if short:
                diags.append(f"部分煤种可用量过低制约闭合: {','.join(short)}；建议放宽结构下限或扩大候选煤")
    cap_sum = 0.0
    if use_inventory:
        D = coverage_days * DAILY_TOTAL
        cap_sum = sum(min(100.0, available_qty(n, coverage_days)[0] / D * 100.0) for n in NAMES)
        if cap_sum < 100.0:
            diags.append(f"配比闭合冲突: 库存约束下各煤配比上限合计仅{cap_sum:.1f}%<100%，无法闭合")
    for name, classes, lo, hi in structure:
        pool = sum(next(c for c in COALS if c['name'] == n)['latestInventory'] for n in NAMES
                   if next(c for c in COALS if c['name'] == n)['coalClass'] in classes)
        if use_inventory and lo and lo > 0:
            D = coverage_days * DAILY_TOTAL
            cap = min(100.0, pool / D * 100.0) if D > 0 else 100
            if cap < lo:
                diags.append(f"结构-库存互斥: {name}要求≥{lo}%但该煤类库存上限仅支撑{cap:.1f}%，"
                             f"建议下调结构下限或补库")
    if not diags:
        diags.append("质量/结构约束组合与候选煤指标区间无交集，建议逐项放宽质量区间或扩大候选煤种")
    return diags

# ================= 4. 进销存排程 =================
def run_schedule(mode='historical', x=None, days=SCHEDULE_DAYS):
    """排程推演(规格书4): I_t = I_{t-1} + A_t - C_t"""
    rows = []           # 每日汇总行
    curves = {n: [] for n in NAMES}   # 各煤种日末库存
    alerts = []
    level_cfg = DS['meta']['waterLevelConfig']
    for t in range(1, days + 1):
        date = (SCHEDULE_START + datetime.timedelta(days=t - 1)).isoformat()
        day_row = {'day': t, 'date': date, 'coals': {}}
        tot_b, tot_e = 0.0, 0.0
        for i, n in enumerate(NAMES):
            coal = next(c for c in COALS if c['name'] == n)
            I_prev = curves[n][-1]['end'] if curves[n] else coal['latestInventory']
            arr = TIMELINE.get(n, {}).get(date, {})
            a = arr.get('ship', 0.0) + arr.get('rail', 0.0)
            if mode == 'historical':
                cons = coal['dailyConsumption']
            else:
                cons = DAILY_TOTAL * x[i] / 100.0        # 配煤驱动(干基)
            end = I_prev + a - cons
            d = coal['dailyConsumption']
            e_days = end / d if d > 0 else None
            crit = coal['coalClass'] in CRITICAL_CLASSES
            risk = (d > 0 and end < L_MIN_SCHED * d) if crit else (end < 0)
            rec = {'begin': round(I_prev, 1), 'ship': round(arr.get('ship', 0.0), 1),
                   'rail': round(arr.get('rail', 0.0), 1), 'consume': round(cons, 1),
                   'end': round(end, 1), 'stockDays': round(e_days, 2) if e_days is not None else None,
                   'critical': crit, 'risk': bool(risk)}
            day_row['coals'][n] = rec
            curves[n].append({'date': date, 'end': end})
            tot_b += I_prev; tot_e += end
            if risk:
                alerts.append({'date': date, 'coal': n, 'end': round(end, 1),
                               'gapToMin': round(L_MIN_SCHED * d - end, 1) if d > 0 else None})
        day_row['total'] = {'begin': round(tot_b, 1), 'end': round(tot_e, 1)}
        rows.append(day_row)
    return {'mode': mode, 'days': days, 'start': SCHEDULE_START.isoformat(),
            'rows': rows, 'curves': {n: [c_['end'] for c_ in v] for n, v in curves.items()},
            'alerts': alerts}

def purchase_suggest(sched):
    """采购建议(规格书4.6): Q = (L_min - E_N)·d·(1+γ)，建议到货日=断料风险日-采购周期"""
    out = []
    for i, n in enumerate(NAMES):
        coal = next(c for c in COALS if c['name'] == n)
        d = coal['dailyConsumption']
        if d <= 0: continue
        end = sched['curves'][n][-1]
        e_end = end / d
        if e_end < L_MIN_SCHED:
            q = (L_MIN_SCHED - e_end) * d * (1 + PURCHASE_MARGIN)
            risk = next((a for a in sched['alerts'] if a['coal'] == n), None)
            out.append({'coal': n, 'dailyConsumption': round(d, 1),
                        'endInventory': round(end, 1), 'endStockDays': round(e_end, 2),
                        'suggestQty': round(q, 0),
                        'firstRiskDate': risk['date'] if risk else None,
                        'suggestArriveBy': (datetime.date.fromisoformat(risk['date'])
                                            - datetime.timedelta(days=15)).isoformat() if risk else None,
                        'note': '建议量仅补足至最低库存线(3天)；维持15天连续生产还需另行 bulk 采购'})
    return out

# ================= 5. 联动迭代(规格书7.1) =================
def run_linked(coverage_days=1, max_iter=10):
    iters = []
    cov = coverage_days
    for it in range(max_iter):
        opt = blend_optimize(coverage_days=cov, use_inventory=True)
        iters.append({'iter': it + 1, 'coverage_days': cov,
                      'success': opt['success']})
        if not opt['success']:
            iters[-1]['note'] = '无可行解: ' + '; '.join(opt.get('diagnosis', [])[:2])
            return opt, None, iters
        x = np.array([opt['x'].get(n, 0.0) for n in NAMES])
        sched = run_schedule(mode='blend', x=x)
        bad = [a for a in sched['alerts']]
        iters[-1]['alerts'] = len(bad)
        if not bad:
            return opt, sched, iters
        # 调整: 跌破最低线的煤种配比上界压缩到库存可支撑水平后重解
        # (库存充足时断料为结构性, 快速转入采购建议分支)
        cov = max(1, cov - 1) if cov > 1 else 1
        if it >= 2:
            short = sorted({a['coal'] for a in bad})
            iters[-1]['note'] = (f"个别煤种按消耗结构推演断料({','.join(short)})，"
                                 f"总供给充足属结构性缺口，转入采购建议")
            return opt, sched, iters
    return opt, sched, iters

# ================= 主流程 =================
def main():
    results = {
        'params': {
            'priceNote': '煤价数据缺失(规格书A.4 P0缺口)，以下为示例价(湿基元/吨)，系统内可编辑',
            'pricesWet': DEFAULT_PRICE_WET,
            'blendQuality': BLEND_QUALITY, 'cokeQuality': COKE_QUALITY,
            'structure': [{'name': n, 'classes': c, 'lo': lo, 'hi': hi} for n, c, lo, hi in STRUCTURE],
            'rlm': RLM, 'kSulfur': K_SULFUR,
            'scheduleDays': SCHEDULE_DAYS, 'scheduleStart': SCHEDULE_START.isoformat(),
            'lMinSched': L_MIN_SCHED, 'buffer': BUFFER, 'purchaseMargin': PURCHASE_MARGIN,
            'dailyTotalDemand': DAILY_TOTAL,
        },
        'candidates': [n for n in NAMES],
        'cokeFormulaNote': '本版本仅启用通用公式Ad_c/S_c；M40/M10/CRI/CSR依赖G/Y(用户指定忽略)不启用',
    }
    # A. 参考: 不含库存约束的质量-成本最优配比
    opt_free = blend_optimize(use_inventory=False)
    results['opt_free'] = opt_free
    # B. 库存约束下 1 天覆盖配比(联动迭代)
    opt_inv, sched_b, iters = run_linked(coverage_days=1)
    results['opt_inventory'] = opt_inv
    results['linked_iters'] = iters
    # C. 排程: 模式A(历史均值) 与 模式B(配比驱动, 用库存约束最优解; 无解则用参考配比)
    sched_a = run_schedule(mode='historical')
    x_for_b = np.array([opt_inv['x'].get(n, 0.0) for n in NAMES]) if opt_inv['success'] \
        else np.array([opt_free['x'].get(n, 0.0) for n in NAMES])
    results['schedule_A'] = sched_a
    results['schedule_B'] = run_schedule(mode='blend', x=x_for_b)
    results['schedule_B']['blendUsed'] = '库存约束最优配比' if opt_inv['success'] else '参考配比(无库存约束)'
    # D. 采购建议
    results['purchase'] = purchase_suggest(sched_a)
    # E. 15天覆盖LP(演示无可行解诊断)
    results['opt_15d'] = blend_optimize(coverage_days=15, use_inventory=True)

    with open(os.path.join(HERE, 'appdata', 'results.json'), 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    # ---- 校验输出 ----
    print('=== 候选煤(%d种) ===' % M, NAMES)
    print('\n=== A. 参考配比(无库存约束) ===')
    print(json.dumps({k: opt_free[k] for k in ('success', 'x', 'cost_dry', 'coke', 'tight_constraints')
                      if k in opt_free}, ensure_ascii=False, indent=1))
    if not opt_free['success']:
        print('诊断:', opt_free['diagnosis'])
    print('\n=== B. 库存约束(1天覆盖) ===')
    print(json.dumps({k: opt_inv[k] for k in ('success', 'x', 'cost_dry', 'tight_constraints',
                                              'constraint_checks') if k in opt_inv}, ensure_ascii=False, indent=1))
    if not opt_inv['success']:
        print('诊断:', opt_inv['diagnosis'])
    print('\n联动迭代:', json.dumps(iters, ensure_ascii=False))
    # 排程恒等式校验
    for tag, sc in (('A', sched_a), ('B', results['schedule_B'])):
        ok = all(abs(r['coals'][n]['begin'] + r['coals'][n]['ship'] + r['coals'][n]['rail']
                     - r['coals'][n]['consume'] - r['coals'][n]['end']) < 0.15
                 for r in sc['rows'] for n in NAMES)
        first_neg = next((r['date'] for r in sc['rows'] for n in NAMES if r['coals'][n]['end'] < 0), None)
        print(f"排程{tag}: 恒等式校验={'PASS' if ok else 'FAIL'}, 首个负库存日={first_neg}, "
              f"预警条数={len(sc['alerts'])}, 期末总库存={sc['rows'][-1]['total']['end']:,.0f}")
    print('\n=== 采购建议(模式A排程) ===')
    for p in results['purchase']:
        print(f"{p['coal']:8s} 建议{p['suggestQty']:>10,.0f}吨, 期末当量{p['endStockDays']}天, "
              f"首险日{p['firstRiskDate']}")
    print('\n=== 15天覆盖LP(诊断演示) ===')
    print('success:', results['opt_15d']['success'])
    for d in results['opt_15d'].get('diagnosis', []):
        print(' -', d)

if __name__ == '__main__':
    main()
