"""Step 45.7: export goldens.json from step45_reference_sim_v3.py (imports the sim; no rules copied).
Usage: python step45_07_export_goldens.py [--out PATH] [--mutate r0|r0_625|seed|exp1|trunc|half_even|float_hash|restart_phase|unsnapped_cell|tick_nearest]   (mutate = known-bad run for the check)
v3.7.2 (45.10b-4): the legacy sections always run in trunk mode (sim.set_mode); with --start-mode trunk (or S45_START_MODE=trunk) the output is the goldens_v37 content
(only the _meta hashes and spec_version differ). In the shipped mode (surface) the surface sections S_GV*, S_P, S_MID, S_E, S_cover, S_anchor and S_consts are added; no legacy key changes.
Sections: v3.5 content (GV*, reaim_case, worst_case, GV5) plus E1 u01 hashes, E2 readout strings, E3 snap, E4 budget/tick,
E5 paint/sparse, E6 advisor/re-aim, E7 worst cases, E8 per-level F and the 12 generator vectors. All values come from sim calls."""
import sys, os, json, hashlib, functools, math
from decimal import Decimal, ROUND_DOWN
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import step45_reference_sim_v3 as sim

def arg(n, d=None): return sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
OUT = arg("--out", os.path.join(HERE, "goldens.json")); MUT = arg("--mutate")
START = arg("--start-mode", sim.START_MODE)        # surface (shipped) adds the S sections; trunk reproduces goldens_v37
sim.set_mode(sim.MODE_TRUNK)                       # every legacy section below is trunk-mode content
if MUT == "seed":
    _u = sim.u01; sim.u01 = lambda seed, x, y, side=None: _u(seed + 1, x, y, side)
elif MUT == "r0":
    sim.sparse = functools.partial(sim.sparse, r0=sim.R0_FULL * 1.25)
elif MUT == "r0_625":
    sim.sparse = functools.partial(sim.sparse, r0=6.25 / sim.CELL_M)
elif MUT == "exp1":
    sim.p_reveal = lambda r, r0=sim.R0_FULL: min(1.0, (r0 / r) ** 1)
elif MUT == "trunc":
    sim.fmt1 = lambda x: str(Decimal(repr(round(float(x), 9))).quantize(Decimal("0.1"), rounding=ROUND_DOWN))
    sim.fmt_m = lambda cells: f"{Decimal(repr(round(float(cells) * sim.CELL_M, 6))).quantize(Decimal('0.1'), rounding=ROUND_DOWN):,}"
elif MUT == "half_even":                                  # step 45.8: Python round() (half even) for the budget and half-up helpers
    sim.rhu = lambda v: round(v); sim.budgets.__defaults__ = (lambda v: round(v),)
elif MUT == "float_hash":                                 # step 45.8: float multiply in place of Math.imul (loses low bits above 2^53)
    def _fh(seed, x, y, side=None):
        h = int(float(seed) * float(0x9E3779B1) + float(x) * float(0xC2B2AE3D) + float(y) * float(0x27D4EB2F)) & 0xFFFFFFFF
        h ^= h >> 16; h = int(float(h) * float(0x85EBCA6B)) & 0xFFFFFFFF; h ^= h >> 13; h = int(float(h) * float(0xC2B2AE35)) & 0xFFFFFFFF; h ^= h >> 16
        return h / 4294967296.0
    sim.u01 = _fh
elif MUT == "restart_phase":                              # step 45.8: per-segment coring restart
    _s = sim.sample
    def _sw(sx, sy, d, L, ok, A0=0.0, rule="carry"):
        return _s(sx, sy, d, L, ok, A0, "restart" if rule == "carry" else rule)   # sample() stores .svals on the global name, which is now _sw
    sim.sample = _sw
elif MUT == "unsnapped_cell":                             # step 45.8: floor(v + 0.5) without round6
    sim.rh = lambda v: math.floor(v + 0.5)
elif MUT == "tick_nearest":                               # step 45.8: nearest-tick instead of floor-to-tick
    sim.to_tick = lambda t, mut=(): int(round(t * 10.0))
elif MUT: sys.exit("unknown mutation " + MUT)

def cl(S): return sorted([int(x), int(y)] for x, y in S)
def seg_json(s): return dict(cells=[[int(x), int(y)] for x, y in s['cells']], len=s['len'], t=s['t'], gen=s['gen'])
def conv(o):
    if isinstance(o, dict): return {str(k): conv(v) for k, v in o.items()}
    if isinstance(o, (set, frozenset)): return sorted(conv(v) for v in o)
    if isinstance(o, (list, tuple)): return [conv(v) for v in o]
    return o

def sides(F, segs, holes, seed, W, H, reach=None):
    t2, t1, schL, skpL = sim.left_sense(segs, seed=seed, W=W, H=H, reach=reach); eL = sim.run_end(sim.left_sense.last)
    r2, r1, schR, skpR = sim.rig_sense(holes, seed=seed, W=W, H=H); eR = sim.run_end(sim.rig_sense.last)
    def side(a, b, sch, skp, end, drilled):
        return dict(cored=cl(a), revealed=cl(b), score=list(sim.score(F, a, b)), pairs=[sch, skp],
                    end_s=round(end, 6), drilled_cells=drilled, drilled_m=round(drilled * sim.CELL_M, 3))
    dL = sum(s['len'] for s in segs); dR = sum(h[1] for hs in holes for h in hs)
    return dict(left=side(t2, t1, schL, skpL, eL, dL), right=side(r2, r1, schR, skpR, eR, dR))

def totals(d, F):
    return [sim.pct1(sum(d[s]['score'][:2]), len(F)) for s in ('left', 'right')]

def run(name, F, S, portals, clicks, cap, seed, W=sim.W_GRID, H=sim.H_GRID, adds=()):
    r = sim.play(F, S, portals, clicks, cap, W, H, adds=adds, seed=seed)
    net = r['net']
    d = dict(name=name, W=W, H=H, seed=seed, cap=cap, portals=portals, clicks=[[p, D] for p, D in clicks], adds=[list(a) for a in adds],
             F=cl(F), S=cl(S), results=r['results'], budget=r['budget'], b=r['b'], reserve=r['reserve'], reaim_cap=r['reaim_cap'],
             holes=conv(r['holes']), length_cells=round(r['length'], 6), segs=[seg_json(s) for s in net.segs])
    d.update(sides(F, net.segs, r['holes'], seed, W, H))
    d['totals'] = totals(d, F)
    return d, r

G = {}
F, S = sim.l1_world(); p1 = sim.default_portal(sim.comps(S)[0])
c1 = [(p1, D) for D in sim.L1_CLICKS_M]
G['GV1'], r1 = run('GV1', F, S, [p1], c1, sim.L1_CAP, sim.SEED_L1, 25, 25)
dep = sim.add_hole_depth(S, 18, r1['reserve'])
G['GV1b'], _ = run('GV1b', F, S, [p1], c1, sim.L1_CAP, sim.SEED_L1, 25, 25, adds=[(18, dep, 5.0)])
F, S = sim.pipe_world(); pp = sim.default_portal(sim.comps(S)[0])
G['GV2'], _ = run('GV2', F, S, [pp], [(pp, D) for D in sim.PIPE6_M], sim.DRILL_CAP, sim.SEED_PIPE)
G['GV3'], _ = run('GV3', F, S, [pp], [(pp, float(D)) for D in sim.PIPE24_M], sim.DRILL_CAP, sim.SEED_PIPE)
G['GV3b'], _ = run('GV3b', F, S, [pp], [(pp, float(D)) for D in sim.PIPE24_M], 2 * sim.DRILL_CAP, sim.SEED_PIPE)
Fm, Sm = sim.main_world(); dp = [sim.default_portal(C) for C in sim.comps(Sm)]
cm = [(p, D) for D in sim.MAIN_M for p in dp]
G['GV4'], r4 = run('GV4', Fm, Sm, dp, cm, sim.DRILL_CAP, sim.SEED_MAIN)

# GV4m: the mid-run moves, composed from the sim's own functions in the order sim.play_moves uses
ADD = (80, 60, 75.0); T_RE = 90.0; TGT = (20.0, 20.0)
net = sim.Network(Sm, dp, sim.DRILL_CAP)
for p, D in cm: net.next_gen(p, D)
budget, b, reserve, rcap = sim.budgets(net)
pbc = {}
for p in net.portals: pbc.setdefault(sim.portal_comp(net.Cs, Sm, p)[0], []).append(p)
holes, spent = sim.rig_plan(net.Cs, pbc, b); holes[-1].append(tuple(ADD))
idx = sim.reaim_pick(net, T_RE); ra = sim.reaim(net, T_RE, idx, TGT, rcap)
segs1 = sim.apply_reaim(net, T_RE, idx, ra)
gm = sim.play_moves(Fm, Sm, dp, cm, sim.DRILL_CAP, ADD, T_RE, TGT, seed=sim.SEED_MAIN)
d = dict(name='GV4m', W=sim.W_GRID, H=sim.H_GRID, seed=sim.SEED_MAIN, cap=sim.DRILL_CAP, portals=dp, clicks=[[p, D] for p, D in cm],
         add=list(ADD), reaim=dict(t=T_RE, seg=idx, target=list(TGT), cost=round(ra['cost'], 6), wantedCost=round(ra['wantedCost'], 6), clamped=bool(ra['clamped'])),
         F=cl(Fm), S=cl(Sm), budget=budget, b=b, reserve=reserve, reaim_cap=rcap, holes=conv(holes), segs=[seg_json(s) for s in segs1])
d.update(sides(Fm, segs1, holes, sim.SEED_MAIN, sim.W_GRID, sim.H_GRID))
assert d['left']['score'] == list(gm['L']) and d['right']['score'] == list(gm['R']), "GV4m composition differs from play_moves"
d['totals'] = totals(d, Fm)
G['GV4m'] = d

# re-aim case on GV4: first clamped success and first refusal, 10 s scan as in the sim
first_ok = first_ref = None
for t in range(40, 400, 10):
    i = sim.reaim_pick(r4['net'], float(t))
    if i is None: continue
    q = sim.reaim(r4['net'], float(t), i, TGT, r4['reaim_cap'])
    if q is None and first_ref is None: first_ref = dict(t=t, seg=i, result="refused")
    if q is not None and q['clamped'] and first_ok is None:
        first_ok = dict(t=t, seg=i, cost=round(q['cost'], 6), wantedCost=round(q['wantedCost'], 6), cap=r4['reaim_cap'],
                        new=[seg_json(k) for k in q['new']])
G['reaim_case'] = dict(world='GV4', target=list(TGT), first_clamped_success=first_ok, first_refusal=first_ref)

# worst cases
worst = []
shapes = {"250 x 500 m, 1 portal": (sim.rect(75, 124, 0, 99), [100]), "250 x 500 m, 3 portals": (sim.rect(75, 124, 0, 99), [80, 100, 120]),
          "500 x 250 m, 1 portal": (sim.rect(50, 149, 0, 49), [100]), "500 x 250 m, 3 portals": (sim.rect(50, 149, 0, 49), [62, 100, 137]),
          "1,000 x 125 m, 3 portals": (sim.rect(0, 199, 0, 24), [25, 100, 175]), "337.5 x 375 m, 3 portals": (sim.rect(67, 133, 25, 99), [75, 100, 125])}
for nm, (Sx, ports) in shapes.items():
    for cap in (10**9, sim.DRILL_CAP):
        n_ = sim.Network(Sx, ports, cap)
        for _ in range(24):
            for p in ports: n_.next_gen(p, 20.0)
        worst.append(dict(shape=nm, cap=("none" if cap > 10**8 else cap), segments=len(n_.segs), length_cells=round(n_.length(), 6)))
G['worst_case'] = worst
nt = sim.Network(sim.rect(75, 124, 0, 99), [100], 10**9); res = [nt.next_gen(100, 20.0) for _ in range(25)]
G['GV5'] = dict(ok=res.count('ok'), last=res[-1], segments=len(nt.segs))

# ================= parity sections E1..E8 (spec v3.6.1); every value is a call into the sim =================
def J(o):
    if isinstance(o, dict): return {str(k): J(v) for k, v in o.items()}
    if isinstance(o, (set, frozenset)): return sorted(J(v) for v in o)
    if isinstance(o, (list, tuple)): return [J(v) for v in o]
    if isinstance(o, float): return round(o, 9)
    if isinstance(o, (int, str, bool)) or o is None: return o
    return str(o)

# E1: u01 hash words, x in 0..199, y in 0..99, index x * 100 + y; word = u * 2^32 (exact in a double)
E1_SEEDS = [7919, 15838, 31678, 7920, 15839, 31679]
G['E1'] = dict(seeds=E1_SEEDS, W=200, H=100, order="x-major: index = x * 100 + y",
               vectors=[[s_, x_, y_, sim.u01(s_, x_, y_)] for s_, x_, y_ in [(7919, 5, 4), (7919, 4, 6), (7919, 6, 4), (15838, 40, 20)]],
               hash={str(sd): [int(sim.u01(sd, x, y) * 4294967296.0) for x in range(200) for y in range(100)] for sd in E1_SEEDS})

# E2: readout strings
FMT_IN = [43.75, 45.25, 0.05, 0.049, 0.15, 0.25, 99.95, 100.0, 0.0, 12.34999, 12.35]
gv_keys = ('GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4', 'GV4m')
G['E2'] = dict(fmt1=[[v, sim.fmt1(v)] for v in FMT_IN], pct_zero=sim.pct1(0, 0),
               pct={str(d): [sim.pct1(n, d) for n in range(d + 1)] for d in (80, 1020, 2036)},
               gv=[dict(name=k, side=sd, counts=G[k][sd]['score'], readout=sim.readout(tuple(G[k][sd]['score'])))
                   for k in gv_keys for sd in ('left', 'right')],
               meters=[[c, sim.fmt_m(c)] for c in (327.889, 359, 400, 1.0, 0, 0.01, 0.02, 1234.5, 0.99)]
                      + [[G[k][sd]['drilled_cells'], sim.fmt_m(G[k][sd]['drilled_cells'])] for k in gv_keys for sd in ('left', 'right')])

# E3: cell snap
SNAP_IN = [v for k in range(-3, 7) for v in (k + 0.5 - 1e-7, k + 0.5, k + 0.5 + 1e-7, k + 0.5 - 1e-6, k + 0.5 + 1e-6)] \
          + [0.0, 3.4999999, 3.4999989, 2.5000001, 0.4999999, -0.5, -0.5000001, 1e-7, -1e-7]
G['E3'] = [dict(v=v, rh=sim.rh(v), rhu=sim.rhu(v), cell=sim.cell_of(v)) for v in SNAP_IN]

# E4: half-up budget ties, fixed tick, ticks due, GV4m driven through the tick
TIES = [0.5, 1.5, 2.5, 3.5, 298.5, 299.5, 33.5]
def drive_ticks_run():
    r_ = sim.Round(sim.TEST_LEVELS['main'], Fm, Sm, dp, cm, sim.SEED_MAIN); tk = lambda t: sim.tick_time(sim.to_tick(t))
    a_ = r_.add_hole(tk(75.06), 80, 60); i2 = sim.reaim_pick(r_.net, 90.0, segs=r_.layout); b2 = r_.reaim(tk(90.03), i2, sim.REAIM_TARGET)
    rs = r_.result()
    return dict(add_status=a_['status'], reaim_status=b2['status'], L=list(rs['L']), R=list(rs['R']), endL=round(rs['endL'], 6), endR=round(rs['endR'], 6),
                tick_add=sim.to_tick(75.06), tick_reaim=sim.to_tick(90.03))
G['E4'] = dict(
    half_up=[[v, sim.rhu(v)] for v in TIES], gv4_length_cells=G['GV4']['length_cells'], gv4_budget=G['GV4']['budget'],
    tick=dict(step=0.01, n=30001, ticks=[sim.to_tick(i / 100.0) for i in range(30001)],
              named=[[t, sim.to_tick(t), sim.tick_time(sim.to_tick(t))] for t in (75.0, 75.04, 75.06, 74.999999, 90.0, 90.03, 0.0999, 0.0, 19.2, 97.6)]),
    ticks_due={str(sp): dict(step=0.01, n=2501, due=[sim.ticks_due(i / 100.0, sp) for i in range(2501)]) for sp in (1, 4, 16)},
    ticks_due_named=[[w, sp, sim.ticks_due(w, sp)] for w, sp in ((19.2, 1), (4.8, 4), (1.2, 16), (0.0, 1), (0.05, 1), (0.01, 1), (0.0099, 1))],
    gv4m_driven=drive_ticks_run())

# E5: paint rules and the radar reveal fixtures
def painter_cases():
    out = {}
    P = sim.Painter(400); P.stroke([(20.5, 20.5)], 2); out['stroke_r2'] = sorted(P.S)
    P.stroke([(20.5, 20.5), (30.5, 20.5)], 5); out['stroke_r5_line_union'] = sorted(P.S)
    P.stroke([(20.5, 20.5)], 2, erase=True); out['after_erase'] = sorted(P.S)
    P = sim.Painter(50); P.stroke([(50.5, 50.5)], 5); out['cap50'] = sorted(P.S)
    ring = sim.rect(10, 20, 10, 20) - sim.rect(11, 19, 11, 19)
    P = sim.Painter(400); P.S = set(ring); f1 = P.fill((15, 15)); n1 = len(P.S); f2 = P.fill((15, 15)); f3 = P.fill((0, 0))
    P2 = sim.Painter(100); P2.S = set(ring); f4 = P2.fill((15, 15))
    out['fill'] = dict(inside=f1, size_after=n1, repeat=f2, outside_edge=f3, over_cap=f4, over_cap_size=len(P2.S))
    P = sim.Painter(5000)
    for i in range(21): P.stroke([(10.5 + 8 * (i % 20), 10.5 + 8 * (i // 20))], 2)
    depth = len(P.undo_stack); n_undo = 0
    while P.undo(): n_undo += 1
    out['undo'] = dict(strokes=21, depth=depth, undos=n_undo, left=len(P.S))
    P = sim.Painter(400); P.stroke([(20.5, 20.5)], 2); P.clear(); a = len(P.S); P.undo(); out['clear_undo'] = dict(after_clear=a, after_undo=len(P.S))
    P = sim.Painter(400); P.stroke([(20.5, 20.5)], 2, erase=True); out['empty_stroke_pushes'] = len(P.undo_stack)
    return out
def repaint_cases():
    R = sim.rect
    cases = {
        'unchanged': (R(10, 30, 20, 60), [20], [(20, 25.0)]),
        'leaves_S': (R(60, 80, 20, 60), [20], [(20, 25.0)]),
        'merge': (R(10, 40, 20, 60), [18, 21], [(18, 25.0), (21, 20.0)]),
        'split': (R(10, 20, 20, 60) | R(40, 50, 20, 60), [15], [(15, 25.0)]),
        'over_three': (R(10, 30, 20, 60) | R(60, 70, 20, 60) | R(100, 110, 20, 60), [12, 18, 24], [(12, 25.0), (18, 25.0), (24, 25.0)]),
    }
    out = {}
    for k, (S_, ps, cl_) in cases.items():
        kept, clk, dropped, added = sim.repaint_portals(S_, ps, cl_)
        out[k] = dict(S=cl(S_), portals=ps, clicks=[list(c) for c in cl_], kept=kept, clicks_after=[list(c) for c in clk], dropped=dropped, added=added)
    return out
sp_t2 = {(12, y) for y in range(10)}; sp_t1 = {}; sim.sparse(sp_t2, sp_t1, 7919, 25, 25)
sp2_t2 = {(5, y) for y in range(8)} | {(18, y) for y in range(5, 15)}; sp2_t1 = {}; sim.sparse(sp2_t2, sp2_t1, 31678, 25, 25)
G['E5'] = dict(
    brush=dict(counts={str(r): len(sim.brush_cells(100, 50, r)) for r in sim.BRUSH_R},
               corner={str(r): len(sim.brush_cells(0, 0, r)) for r in sim.BRUSH_R}, edge={str(r): len(sim.brush_cells(0, 50, r)) for r in sim.BRUSH_R}),
    centers=[sim.stroke_centers(p) for p in ([(10.2, 10.7), (14.9, 10.7)], [(5.5, 5.5)], [(0.0, 0.0), (3.0, 4.0)], [(2.0, 2.0), (2.0, 2.0)])],
    painter=painter_cases(), repaint=repaint_cases(),
    p_reveal=[[r, sim.p_reveal(r)] for r in (0.5, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0)],
    sparse=[dict(W=25, H=25, seed=7919, cored=cl(sp_t2), revealed=cl(sp_t1)), dict(W=25, H=25, seed=31678, cored=cl(sp2_t2), revealed=cl(sp2_t1))],
    gv_holes={k: dict(holes=G[k].get('holes'), pairs_left=G[k]['left']['pairs'], pairs_right=G[k]['right']['pairs'], end_left=G[k]['left']['end_s'], end_right=G[k]['right']['end_s'])
              for k in gv_keys})

# E6: re-aim sequences, trunk re-aim, refusal order, advisor
LVM = sim.TEST_LEVELS['main']; LV1 = sim.TEST_LEVELS['gv1']; F1_, S1_ = sim.l1_world()
def newRound(F_=None, mut=()): return sim.Round(LVM, Fm if F_ is None else F_, Sm, dp, cm, sim.SEED_MAIN, mut)
def ra_row(r_):
    ra = r_.get('ra'); return dict(status=r_['status'], cost=(round(ra['cost'], 6) if ra else None), wanted=(round(ra['wantedCost'], 6) if ra else None),
                                   clamped=(bool(ra['clamped']) if ra else None), triggers=r_.get('triggers'), line=(r_['popup']['line'] if r_.get('popup') else None))
R_ = newRound(); seq = []
for t_, i_, tg in [(90.0, 6, (20.0, 30.0)), (95.0, 8, (40.0, 30.0)), (100.0, 31, (10.0, 10.0))]:
    seq.append(dict(t=t_, seg=i_, target=list(tg), **ra_row(R_.reaim(t_, i_, tg)), res_left=round(R_.resL, 6)))
R_ = newRound(); trunk_id = sim.reaim_pick(R_.net, 20.0, comp=1, include_trunk=True)
trunk = dict(t=20.0, seg=trunk_id, target=[100.0, 60.0], **ra_row(R_.reaim(20.0, trunk_id, (100.0, 60.0))), nre=R_.nre)
def order_codes():
    a = newRound(); a.nre = sim.REAIM_LIMIT; c_limit = a.reaim(90.0, 6, sim.REAIM_TARGET)['status']
    b = newRound(); b.nre = sim.REAIM_LIMIT; c_fin = b.reaim(b.left_end(), 6, sim.REAIM_TARGET)['status']
    c = newRound(); c.t_last = 95.0; c_time = c.reaim(90.0, 6, sim.REAIM_TARGET)['status']
    d = newRound(); c_nb = d.reaim(90.0, 9999, sim.REAIM_TARGET)['status']
    e = newRound(); e.t_last = 80.0; c_add = e.add_hole(75.0, 80)['status']
    return dict(limit=c_limit, side_finished=c_fin, time=c_time, no_branch=c_nb, add_time=c_add)
R2c = newRound()
chk = {k: sim.reaim_check(R2c.net, t_, 6, tg, R2c.layout) for k, (t_, tg) in dict(ok=(90.0, (20.0, 20.0)), finished=(1e6, (20.0, 20.0)), not_started=(0.0, (20.0, 20.0)),
                                                                              outside=(90.0, (-3.0, 20.0))).items()}
def add_out(r_): return dict(status=r_['status'], depth=r_.get('depth'), triggers=r_.get('triggers'), line=(r_['popup']['line'] if r_.get('popup') else None),
                             text=(r_['popup']['text'] if r_.get('popup') else None), spot=J(r_.get('spot')), pairs=J(r_.get('pairs')))
def adv_variant(F_):
    o = []
    for kind in ('add61', 'addP4', 'reaim'):
        R1 = newRound(F_); r_ = (R1.add_hole(74.0, 61) if kind == 'add61' else R1.add_hole(20.0, 199, 2) if kind == 'addP4' else R1.reaim(90.0, 6, sim.REAIM_TARGET))
        o.append(dict(kind=kind, status=r_['status'], triggers=r_.get('triggers'), text=(r_['popup']['text'] if r_.get('popup') else None), spot=J(r_.get('spot'))))
    return o
Falt = {(x + 1, y) for x, y in Fm}
Fvars = {'F': Fm, 'shift1': Falt, 'empty': set(), 'F_eq_S': Sm, 'half_S': {(x, y) for x, y in Sm if (x + y) % 2}}
Rg = sim.Round(LV1, F1_, S1_, [9], [(9, 25.0), (9, 20.0)], sim.SEED_L1); gv1b_add = add_out(Rg.add_hole(5.0, 18))
Sx_ = sim.rect(40, 60, 20, 60); ex_ = set()
def popup_run(gap, n, mut=()):
    R1 = sim.Round(LVM, Fm, Sm, dp, cm, sim.SEED_MAIN, mut); k = got = 0
    for c in (61, 51, 71, 137, 147, 157, 41, 81):
        if got >= n: break
        R1.add_hole(1.0 + k * gap, c, 2); k += 1; got += 1
    return [[p['t'], p['line'], p['trigger']] for p in R1.popups['R']]
def vex_case(t_, u_, sp):
    ln, tx = sim.vex_line(t_, set(u_), 7, dict(text='SPOT') if sp else None)
    return dict(trigger=t_, used=sorted(u_), spot=sp, ln=ln, text=tx)
G['E6'] = dict(
    reaim_sequence=seq, trunk_reaim=trunk, refusal_order=order_codes(), reaim_check=chk, reaim_case=G['reaim_case'],
    advisor=dict(
        triggers=dict(p2=sim.advisor_triggers('add', [(50, 30)], ex_, (50, 30), [(1, 10)], Sx_, LVM),
                      p5=sim.advisor_triggers('add', [(50, 30)], ex_, (50, 30), [], Sx_, LVM),
                      p4=sim.advisor_triggers('add', [(150, 30)], ex_, (150, 30), [(9, 9)], Sx_, LVM),
                      quiet=sim.advisor_triggers('add', [(50, 30)], ex_, (50, 30), [(9, 9)], Sx_, LVM),
                      p3_barren=sim.advisor_triggers('add', [(50, 2)], ex_, (50, 2), [(9, 9)], Sx_, LVM),
                      p3_floor=sim.advisor_triggers('add', [(50, LVM['max_depth_rows'])], ex_, (50, LVM['max_depth_rows']), [(9, 9)], Sx_, LVM),
                      p1_reaim_half=sim.advisor_triggers('reaim', [(50, 30), (51, 30)], {(50, 30)}, (51, 30), [(9, 9)], Sx_, LVM),
                      p1_reaim_below_half=sim.advisor_triggers('reaim', [(50, 30), (60, 30), (70, 30)], {(50, 30)}, (70, 30), [(9, 9)], Sx_, LVM)),
        gv1b=gv1b_add, gv4_add61=add_out(newRound().add_hole(74.0, 61)), gv4_add_ok=add_out(newRound().add_hole(75.0, 80, 60)),
        f_variants={k: adv_variant(v) for k, v in Fvars.items()},
        popups=dict(gap1_n6=popup_run(1.0, 6), gap12_n2=popup_run(12.0, 2), gap21_n6=popup_run(21.0, 6)),
        vex=[vex_case(*c) for c in (('P1', [], True), ('P1', [3], True), ('P1', [3, 6, 7], True), ('P3', [4, 9], False), ('P5', [5, 8, 12, 1, 10], False),
                                    ('P2', [2, 3, 8, 1, 10, 13, 14, 15], True))]))

# E7: worst cases are the v3.5 section above; the alias carries the shapes
G['E7'] = dict(worst_case=G['worst_case'], GV5=G['GV5'])

# E8: per-level F (variant 0) and the 12 generator vectors (variants 0 and 1)
def gen_row(i, v):
    g = sim.gen_level(sim.LEVELS[i], v)
    return g, dict(level=i, variant=v, seed=g['seed'], n=len(g['F']), fingerprint=sum(100 * x + y for x, y in g['F']), reseeds=g['reseeds'],
                   noise_zero=bool(g['noise_zero']), bodies=J([{k: b[k] for k in b if k in ('kind', 'x0', 'N')} for b in g['info']]))
levels_out = {}; vecs = []
for i in range(1, 7):
    for v in (0, 1):
        g, row = gen_row(i, v); vecs.append(row)
        if v == 0:
            lv = sim.LEVELS[i]
            levels_out[str(i)] = dict(F=cl(g['F']), seed=g['seed'], drill_cap_m=lv['drill_cap_m'], barren_rows=lv['barren_rows'], w_min_cells=lv['w_min_cells'],
                                      max_depth_rows=lv['max_depth_rows'], edge_noise_cells=lv['edge_noise_cells'], expected_bodies=lv['expected_bodies'])
G['E8'] = dict(levels=levels_out, vectors=vecs)

# E3b (step 45.8): rounding-boundary probes, decimal ties at the seventh place; cell = the sim's rh(v)
G['E3b'] = [[v, sim.rh(v)] for k in range(-5, 206) for v in (k + 0.4999995, k + 0.5000005)]

# E9 (step 45.8): gate cases. E9[Gnn] = {inputs, zero_expected, bad_expected{mutant: value}}; every value is a call into the sim.
def fp(net): return [len(net.segs), sum(100 * x + y for s in net.segs for x, y in s['cells'])]
def dil(F_, r): return {(c[0] + dx, c[1] + dy) for c in F_ for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy <= r * r}
E9 = {}
Fa, Sa = sim.l1_world(); Sb = Sa | sim.rect(20, 23, 10, 12); Cb = sim.comps(Sb)
drops = [9, 20, 0]; tieS = {(2, 5), (6, 5)}
E9['G1'] = dict(inputs=dict(S=cl(Sa), drops=drops, tie_S=cl(tieS), tie_drop=4),
                zero_expected=dict(snapped=[sim.snap_portal(Sa, c) for c in drops], tie=sim.snap_portal(tieS, 4)),
                bad_expected=dict(identity=dict(snapped=drops, tie=4), ties_upper=dict(snapped=[sim.snap_portal(Sa, c, "high") for c in drops], tie=sim.snap_portal(tieS, 4, "high"))))
def start_cases(m): return [sim.start_ok(sim.comps(Sa), Sa, [9], 1, m), sim.start_ok(sim.comps(Sa), Sa, [9], 0, m), sim.start_ok(Cb, Sb, [9], 1, m)]
E9['G2'] = dict(inputs=dict(S=cl(Sa), S_two_components=cl(Sb), cases=["1 click, one component", "0 clicks", "1 click, unserved component"]),
                zero_expected=start_cases(()), bad_expected={m: start_cases((m,)) for m in ('no_served', 'no_click_check')})
def range_res(m):
    n = sim.Network(Sa, [9], sim.L1_CAP, 25, 25, mut=m); return [n.next_gen(9, D) for D in (20.0, 15.0, 22.5, 105.0)]
E9['G3'] = dict(inputs=dict(S=cl(Sa), portal=9, cap=sim.L1_CAP, W=25, H=25, clicks_m=[20.0, 15.0, 22.5, 105.0]), zero_expected=range_res(()), bad_expected=dict(no_range=range_res(('no_range',))))
Fp, Sp = sim.pipe_world(); ppp = sim.default_portal(sim.comps(Sp)[0])
def len_rows(m):
    n = sim.Network(Sp, [ppp], sim.DRILL_CAP, mut=m)
    for D in sim.PIPE6_M: n.next_gen(ppp, D)
    return [[s_['gen'], s_['len'], n.dlist(ppp)[s_['gen'] - 1]] for s_ in n.segs if s_['gen'] > 0 and not s_['trunc']]
E9['G4'] = dict(inputs=dict(portal=ppp, clicks_m=list(sim.PIPE6_M)), zero_expected=len_rows(()), bad_expected=dict(rho=len_rows(('rho',))))
def cap_res(m):
    n = sim.Network(Sp, [ppp], 12, mut=m); return [n.next_gen(ppp, 100.0), n.length()]
E9['G5'] = dict(inputs=dict(portal=ppp, cap_cells=12, click_m=100.0, uncapped_clicks_m=list(sim.PIPE6_M)), zero_expected=dict(capped=cap_res(()),
                uncapped=sim.play(Fp, Sp, [ppp], [(ppp, D) for D in sim.PIPE6_M], 10**9)['results']), bad_expected=dict(no_cap=cap_res(('no_cap',))))
Sw = sim.rect(50, 149, 20, 59)
def tip_res(pr):
    n = sim.Network(Sw, [100], 10**9, tip_prune=pr)
    for _ in range(8): n.next_gen(100, 20.0)
    return sim.tip_violations(n)
E9['G6'] = dict(inputs=dict(S="rect(50,149,20,59)", portal=100, clicks=8, click_m=20.0), zero_expected=tip_res(True), bad_expected=dict(prune_off=tip_res(False)))
def ceil_res(m):
    n = sim.Network(sim.rect(75, 124, 0, 99), [100], 10**9, mut=m); return [n.next_gen(100, 20.0) for _ in range(25)]
E9['G7'] = dict(inputs=dict(S="rect(75,124,0,99)", portal=100, clicks=25, click_m=20.0), zero_expected=ceil_res(()), bad_expected=dict(no_ceiling=ceil_res(('no_ceiling',))))
a8 = sim.Network(Sp, [ppp], sim.DRILL_CAP); b8 = sim.Network(Sp, [ppp], sim.DRILL_CAP); nv8 = sim.Network(Sp, [ppp], sim.DRILL_CAP)
for D in sim.PIPE6_M: a8.next_gen(ppp, D); nv8.next_gen(ppp, D)
for D in sim.PIPE6_M[:-1]: b8.next_gen(ppp, D)
a8.undo(); nv8.clicks.pop()
E9['G8'] = dict(inputs=dict(portal=ppp, clicks_m=list(sim.PIPE6_M)), zero_expected=dict(undone=fp(a8), five_click_build=fp(b8)), bad_expected=dict(pop_no_rebuild=fp(nv8)))
r5 = sim.play(Fa, Sa, [13], [(13, 25.0)], sim.L1_CAP, 25, 25); hm, _ = sim.rig_plan(r5['net'].Cs, {0: [sim.default_portal(sim.comps(Sa)[0])]}, r5['b'])
E9['G10'] = dict(inputs=dict(portal=13, click_m=25.0, budget=r5['b']), zero_expected=conv(r5['holes']), bad_expected=dict(mean_column_first_hole=conv(hm)))
q1_ = sim.play(*sim.pipe_world(), [ppp], [(ppp, D) for D in sim.PIPE6_M], sim.DRILL_CAP, seed=sim.SEED_PIPE)
q2_ = sim.play(*sim.pipe_world(), [ppp], [(ppp, D) for D in sim.PIPE6_M[:-1] + [30.0]], sim.DRILL_CAP, seed=sim.SEED_PIPE)
E9['G12'] = dict(inputs=dict(portal=ppp, clicks_m=list(sim.PIPE6_M), alt_last_click_m=30.0, seed=sim.SEED_PIPE),
                 zero_expected=dict(first=J(sim.summary(q1_)), second=J(sim.summary(q1_ and sim.play(*sim.pipe_world(), [ppp], [(ppp, D) for D in sim.PIPE6_M], sim.DRILL_CAP, seed=sim.SEED_PIPE)))),
                 bad_expected=dict(last_click_30=J(sim.summary(q2_))))
hole = {(100, y) for y in range(100)}
def rings(pf):
    t1 = {}; sim.sparse(hole, t1, sim.SEED_PIPE, 200, 100, pfun=pf); o = {}
    for c in [(x, y) for x in range(88, 113) for y in range(100) if x != 100]:
        o.setdefault(abs(c[0] - 100), [0, 0]); o[abs(c[0] - 100)][0] += c in t1; o[abs(c[0] - 100)][1] += 1
    return {str(d): round(u / v, 3) for d, (u, v) in sorted(o.items())}
t1z = {}
E9['G13'] = dict(inputs=dict(seed=sim.SEED_PIPE, hole_column=100, columns="88..112 excluding 100", no_hole_case=True),
                 zero_expected=dict(fractions=rings(None), no_hole_revealed=sim.sparse(set(), t1z, sim.SEED_PIPE, 200, 100)),
                 bad_expected=dict(inverted_p=rings(lambda r: min(1.0, (r / sim.R0_FULL) ** 2))))
imm = sim.imaged([(r, 60, 70) for r in range(100)], 0, 100)
def pair_res(pf):
    t2_, t1_, sch_, _ = sim.rig_sense([[(60, 100), (70, 100)]], seed=sim.SEED_PIPE, pair_falloff=pf); return [sch_, sum(1 for c in imm if c in t1_)]
E9['G14'] = dict(inputs=dict(pair_gap10=[[60, 100], [70, 100]], pair_gap11=[[60, 100], [71, 100]], D=100, seed=sim.SEED_PIPE),
                 zero_expected=dict(gap10=pair_res(False), imaged=len(imm), gap11_pairs=sim.rig_sense([[(60, 100), (71, 100)]], seed=sim.SEED_PIPE)[2]),
                 bad_expected=dict(pair_falloff=pair_res(True)))
ta_, tc_ = {}, {}
sim.sparse(hole, ta_, sim.SEED_MAIN, 200, 100); sim.sparse(hole, tc_, sim.SEED_MAIN, 200, 100, side=1)
E9['G15'] = dict(inputs=dict(seed=sim.SEED_MAIN, hole_column=100), zero_expected=dict(n=len(ta_), cells=cl(ta_)), bad_expected=dict(side_term=dict(n=len(tc_), equal_to_zero=(ta_ == tc_), cells=cl(tc_))))
frac = [2.5] + [4] * 24 + [1.5]
def chain_cells(rule):
    A = 0.0; out = []
    for L in frac:
        cs, _, _, _ = sim.sample(50.0, 5.0 + A, 0.0, L, lambda c: True, A, rule); out += [[int(c[0]), int(c[1])] for c in cs]; A += L
    return out
E9['G16'] = dict(inputs=dict(segment_lengths_cells=frac, start=[50.0, 5.0], direction_deg=0.0, rates_dB_cells="4..20", angles_deg=[0, 15, 30, 45, 60]),
                 zero_expected=dict(rates={str(D): round(sim.chain_rate([D] * 12, 0, "carry"), 4) for D in range(4, 21)}, chain_cells=chain_cells("carry"),
                                    chain_rate=round(sim.chain_rate(frac[:10], 0, "carry"), 4),
                                    angle_table={str(d_): round(sim.chain_rate([4] * 25, d_, "carry", 20), 3) for d_ in (0, 15, 30, 45, 60)}),
                 bad_expected=dict(restart_phase=dict(chain_cells=chain_cells("restart"), chain_rate=round(sim.chain_rate(frac[:10], 0, "restart"), 4)),
                                   half_coring=dict(rate=round(sim.chain_rate([4] * 12, 0, "half"), 3))))
Sf = sim.rect(25, 174, 40, 59)
def clamp_res(m):
    n = sim.Network(Sf, [100], 10**9, mut=m); n.next_gen(100, 50.0); return sorted(round(s_['dir'], 6) for s_ in n.segs if s_['gen'] == 1)
E9['G18'] = dict(inputs=dict(S="rect(25,174,40,59)", portal=100, click_m=50.0), zero_expected=clamp_res(()), bad_expected=dict(no_gen1_clamp=clamp_res(('no_gen1_clamp',))))
clk19 = [(ppp, D) for D in sim.PIPE6_M]
st_, newp_, acc_ = sim.plan_move_portal(Sp, [ppp], clk19, ppp, 99, sim.DRILL_CAP)
fresh_ = sim.Network(Sp, newp_, sim.DRILL_CAP)
for p_, D in acc_: fresh_.next_gen(p_, D)
moved_, _, _ = sim.replay(Sp, newp_, acc_, sim.DRILL_CAP)
stale_ = sim.Network(Sp, [ppp], sim.DRILL_CAP)
for D in sim.PIPE6_M: stale_.next_gen(ppp, D)
alt_ = 99 if newp_ != [99] else 110
st2_, p2_, acc2_ = sim.plan_remove_portal(Sp, [ppp, alt_], clk19 + [(alt_, 20.0)], ppp, sim.DRILL_CAP)
def undo_trace(mut=()):
    n_ = sim.Network(Sp, [96, 103], sim.DRILL_CAP, mut=mut); n_.next_gen(103, 50.0); n_.next_gen(96, 50.0); tr = []
    for _ in range(3): r_ = n_.undo(); tr.append([r_, list(n_.portals), len(n_.clicks)])
    return tr
E9['G19'] = dict(inputs=dict(S="pipe", portal=ppp, clicks_m=list(sim.PIPE6_M), move_drop=99, remove_other=alt_, two_portal_world=[96, 103], undo_calls=3),
                 zero_expected=dict(move=dict(status=st_, portals=newp_, moved=fp(moved_), fresh=fp(fresh_)), remove=dict(status=st2_, portals=p2_, clicks=conv(acc2_)), undo=undo_trace()),
                 bad_expected=dict(stale_network=fp(stale_), undo_portal=undo_trace(('undo_portal',))))
Sx = sim.rect(10, 30, 60, 99) | sim.rect(60, 80, 5, 30)
st3_, ps3_, _ = sim.plan_add_portal(Sx, [70], [(70, 100.0)] * 3, 20, 50)
try: sim.Network(Sx, [20, 70], 50); crashed_ = False
except ValueError: crashed_ = True
E9['G20'] = dict(inputs=dict(S="rect(10,30,60,99)|rect(60,80,5,30)", portals=[70], drop=20, cap_cells=50),
                 zero_expected=dict(status=st3_, portals=ps3_, meter_start=sim.meter_start(Sx, [70]), length=sim.Network(Sx, [70], 50).length()),
                 bad_expected=dict(unguarded_constructor_raises=crashed_))
arch = sim.archetypes()
E9['G21'] = dict(inputs=dict(floors=[sim.F_FLOOR, 2000]), zero_expected=dict(areas={k: len(v) for k, v in arch.items()}, builds={k: sim.builds(v) for k, v in arch.items()}),
                 bad_expected=dict(floor_2000={k: sim.builds(v, floor=2000) for k, v in arch.items()}))
caps_ = {k: sim.edge_noise_cap(k) for k in arch}
E9['G22'] = dict(inputs=dict(caps=caps_, uncapped_inward=5, uncapped_outward=11),
                 zero_expected=dict(inward={k: [len(sim.eroded(arch[k], caps_[k] + 1)), len(sim.comps(sim.eroded(arch[k], caps_[k])))] for k in arch},
                                    outward={k: len(sim.comps(dil(arch[k], caps_[k]))) for k in arch}),
                 bad_expected=dict(uncapped=dict(thin_lens_inward_5=[len(sim.eroded(arch["buried thin lens"], 6)), len(sim.comps(sim.eroded(arch["buried thin lens"], 5)))],
                                                 cluster_outward_11=len(sim.comps(dil(arch["cluster"], 11))))))
Fp2, Sp2 = sim.pipe_world()
lv1000_ = dict(sim.TEST_LEVELS['pipe'], drill_cap_m=1000.0)
def cap_ref(level, mut=()):
    n_ = sim.Network(Sp2, [ppp], sim.plan_cap(level, mut)); return [n_.next_gen(ppp, D) for D in sim.PIPE6_M]
E9['G24'] = dict(inputs=dict(levels=["gv1", "pipe", "pipe with drill_cap_m 1000"], clicks_m=list(sim.PIPE6_M)),
                 zero_expected=dict(cap_cells=[sim.plan_cap(sim.TEST_LEVELS['gv1']), sim.plan_cap(sim.TEST_LEVELS['pipe']), sim.plan_cap(lv1000_)],
                                    pipe=cap_ref(sim.TEST_LEVELS['pipe']), pipe_1000=cap_ref(lv1000_), all_levels=[[l['drill_cap_m'], l['barren_rows']] for l in sim.LEVELS.values()]),
                 bad_expected=dict(hardcode_cap=cap_ref(lv1000_, ('hardcode_cap',))))
LVMa = sim.TEST_LEVELS['main']; lvb8_ = dict(LVMa, barren_rows=8)
def p3_(level, row, mut=()): return 'P3' in sim.advisor_triggers('add', [(50, row)], set(), (50, row), [(5, 5)], {(50, 40)}, level, mut)
rows25 = [3, 5, 6, 8, 20, LVMa['max_depth_rows']]
E9['G25'] = dict(inputs=dict(rows=rows25, barren_rows_levels=[LVMa['barren_rows'], 8]),
                 zero_expected=dict(barren5=[p3_(LVMa, r) for r in rows25], barren8=[p3_(lvb8_, r) for r in rows25]),
                 bad_expected=dict(hardcode_barren=dict(barren8=[p3_(lvb8_, r, ('hardcode_barren',)) for r in rows25])))
G['E9'] = J(E9)

# E10 (step 45.8): 200 PLAN edit sequences on GV2 and GV4, seeded random.Random(4545)
import random
def edit_sequence(rng, S, portals0, cap, n_ops):
    portals = list(portals0); clicks = []; ops = []; cols = sorted(set(x for x, y in S))
    for _ in range(n_ops):
        k = rng.choice(['click', 'click', 'click', 'undo', 'add', 'move', 'remove'])
        if k == 'click':
            p = rng.choice(portals); D = 5.0 * rng.randint(4, 20)
            net, _, _ = sim.replay(S, portals, clicks, cap); r = net.next_gen(p, D)
            if r == 'ok': clicks.append((p, D))
            ops.append(['click', p, D, r])
        elif k == 'undo':
            ok = bool(clicks)
            if ok: clicks.pop()
            ops.append(['undo', ok])
        elif k == 'add':
            c = rng.choice(cols); s_, np_, ncl = sim.plan_add_portal(S, portals, clicks, c, cap); portals, clicks = list(np_), list(ncl); ops.append(['add', c, s_])
        elif k == 'move':
            old = rng.choice(portals); c = rng.choice(cols); s_, np_, ncl = sim.plan_move_portal(S, portals, clicks, old, c, cap); portals, clicks = list(np_), list(ncl); ops.append(['move', old, c, s_])
        else:
            if len(portals) < 2: ops.append(['remove', None, 'last']); continue
            old = rng.choice(portals); s_, np_, ncl = sim.plan_remove_portal(S, portals, clicks, old, cap); portals, clicks = list(np_), list(ncl); ops.append(['remove', old, s_])
    net, _, _ = sim.replay(S, portals, clicks, cap)
    return dict(ops=ops, portals=portals, clicks=[list(c) for c in clicks], segments=len(net.segs), fingerprint=sum(100 * x + y for s in net.segs for x, y in s['cells']))
rng = random.Random(4545); E10 = dict(seed=4545, fingerprint="sum of 100 x + y over all segment cells (with multiplicity)", sequences=[])
for i in range(200):
    if i % 2 == 0: w = 'GV2'; Sw_, P0, cap_ = Sp, [ppp], sim.DRILL_CAP
    else: w = 'GV4'; Sw_, P0, cap_ = Sm, dp, sim.DRILL_CAP
    E10['sequences'].append(dict(world=w, **edit_sequence(rng, Sw_, P0, cap_, 10)))
G['E10'] = E10

# E11 (step 45.8): complete level records (body specs, reveal/fade/peeks, landmark step, edge noise, cap_frac, seed_step, priors) and the three debug levels
# that carry the goldens (gv1, pipe, main). E8.levels carries only fields and F; the generator and the advisor tests need these records.
G['E11'] = dict(levels=J(sim.LEVELS), test_levels=J(sim.TEST_LEVELS))

# E12 (step 45.10b-3, spec 2d): speed model and clock. Time keys only; every value is a call into the sim.
def _clock_row(t): return dict(t=round(t, 6), hours=round(sim.clock_h(t), 9), str=sim.clock_str(t))
_late = (80, 60, 75.0 if sim.ZC else 177.0); _late_tick_t = 75.06 if sim.ZC else 177.06   # ZC: the v36 case
gl = sim.play_moves(Fm, Sm, dp, cm, sim.DRILL_CAP, _late, T_RE, TGT, seed=sim.SEED_MAIN)
r_l = sim.Round(sim.TEST_LEVELS['main'], Fm, Sm, dp, cm, sim.SEED_MAIN)
_add = lambda: r_l.add_hole(sim.tick_time(sim.to_tick(_late_tick_t)), 80, 60)   # actions in time order
if sim.ZC: _a_l = _add()
_i_l = sim.reaim_pick(r_l.net, T_RE, segs=r_l.layout); _b_l = r_l.reaim(sim.tick_time(sim.to_tick(90.03)), _i_l, sim.REAIM_TARGET)
if not sim.ZC: _a_l = _add()
rl = r_l.result()
assert _a_l['status'] == 'ok' and _b_l['status'] == 'ok' and abs(rl['endR'] - gl['endR']) < 1e-9 and rl['R'] == gl['R'] and rl['L'] == gl['L']
G['E12'] = dict(
    constants=dict(rig_speed_ratio=sim.RIG_SPEED_RATIO, time_comp=sim.TIME_COMP, speed_l=sim.SPEED_L, rig_drill=sim.RIG_DRILL, rig_travel=sim.RIG_TRAVEL,
                   rig_travel_m_per_game_s=sim.RIG_TRAVEL_M, bot_m_per_h=sim.SPEED_L * sim.CELL_M / sim.TIME_COMP,
                   rig_m_per_h=sim.RIG_DRILL * sim.CELL_M / sim.TIME_COMP, travel_m_per_s_real=sim.RIG_TRAVEL * sim.CELL_M / (sim.TIME_COMP * 3600.0)),
    vectors=dict(rig_100_cells_s=round(100 / sim.RIG_DRILL, 6), bot_10_cells_s=round(10 / sim.SPEED_L, 6)),
    worlds={k: dict(left_end_s=G[k]['left']['end_s'], right_end_s=G[k]['right']['end_s'], left_clock=_clock_row(G[k]['left']['end_s']), right_clock=_clock_row(G[k]['right']['end_s']),
                    run_end_s=max(G[k]['left']['end_s'], G[k]['right']['end_s']), run_end_clock=_clock_row(max(G[k]['left']['end_s'], G[k]['right']['end_s'])))
            for k in gv_keys},
    clock_cases=[_clock_row(t) for t in (0.0, 0.02, 46.0, 192.0, 192.1, 211.0)],
    ticks=[dict(n=n, hours=round(sim.clock_h(n / 10.0), 9), str=sim.tick_clock_str(n)) for n in (0, 1, 2, 3, 1920, 3999, 4000, 16000)],
    gv4m_late=dict(add=list(_late), reaim_t=T_RE, add_tick=sim.to_tick(_late_tick_t), L=list(gl['L']), R=list(gl['R']), pairsL=gl['pairsL'], pairsR=gl['pairsR'],
                   endL=round(gl['endL'], 6), endR=round(gl['endR'], 6), play_moves_equals_round=True, window_s=[175.958, 178.958]))

# ================= surface sections (45.10b-4, spec 4c; shipped mode only) =================
SU = sim.MODE_SURFACE
def seg_json_s(s):
    return dict(id=s['id'], parent=s['parent'], gen=s['gen'], comp=s['comp'], dir=s['dir'], len=s['len'], t=s['t'], A0=s['A0'], A1=s['A1'], sx=s['sx'], sy=s['sy'],
                end=[s['end'][0], s['end'][1]], trunc=bool(s['trunc']), ent=bool(s.get('ent')), cells=[[int(x), int(y)] for x, y in s['cells']])
def record_s(name, F, S, portals, clicks, cap, seed, W=sim.W_GRID, H=sim.H_GRID, adds=(), policy=None, attempts=None):
    r = sim.play(F, S, portals, clicks, cap, W, H, adds=adds, seed=seed, mode=SU); net = r['net']
    d = dict(name=name, mode=SU, W=W, H=H, seed=seed, cap=cap, portals=portals, clicks=[[p, D] for p, D in clicks], adds=[list(a) for a in adds], F=cl(F), S=cl(S),
             results=r['results'], budget=r['budget'], b=r['b'], reserve=r['reserve'], reaim_cap=r['reaim_cap'], holes=conv(r['holes']), spent=r['spent'],
             length_cells=round(r['length'], 6), gens={str(k): v for k, v in net.gens.items()}, theta={str(k): v for k, v in net.theta.items()},
             target_sets={str(k): v for k, v in net.Tk.items()}, segs=[seg_json_s(q) for q in net.segs])
    if policy is not None: d.update(policy=list(policy), attempts=[[D, st] for D, st in attempts])
    d.update(sides(F, net.segs, r['holes'], seed, W, H, net.reach())); d['totals'] = totals(d, F)
    return d, r
def add_out_s(r_): return dict(status=r_['status'], depth=r_.get('depth'), triggers=r_.get('triggers'))
if START == SU:
    SG = {}
    F1_, S1_ = sim.l1_world(); p1s = sim.default_portal_surface(S1_); c1s = [(p1s, D) for D in sim.L1_CLICKS_M]
    SG['S_GV1'], r1s = record_s('S_GV1', F1_, S1_, [p1s], c1s, sim.L1_CAP, sim.SEED_L1, 25, 25)
    SG['S_GV1b'], _ = record_s('S_GV1b', F1_, S1_, [p1s], c1s, sim.L1_CAP, sim.SEED_L1, 25, 25, adds=[(18, sim.add_hole_depth(S1_, 18, r1s['reserve']), 5.0)])
    Fp_, Sp_ = sim.pipe_world(); pps = sim.default_portal_surface(Sp_)
    SG['S_GV2'], _ = record_s('S_GV2', Fp_, Sp_, [pps], [(pps, D) for D in sim.PIPE6_M], sim.DRILL_CAP, sim.SEED_PIPE)
    SG['S_GV3'], _ = record_s('S_GV3', Fp_, Sp_, [pps], [(pps, float(D)) for D in sim.PIPE24_M], sim.DRILL_CAP, sim.SEED_PIPE)
    SG['S_GV3b'], _ = record_s('S_GV3b', Fp_, Sp_, [pps], [(pps, float(D)) for D in sim.PIPE24_M], 2 * sim.DRILL_CAP, sim.SEED_PIPE)
    SG['S_GV4'], _ = record_s('S_GV4', Fm, Sm, dp, cm, sim.DRILL_CAP, sim.SEED_MAIN)         # two free portals (the legacy default columns), the spec click list
    # the nine policy worlds (final.out part A; v3.8.0: fixed theta 15), one V3 portal each
    S_P = {}
    for w in sim.surface_worlds('v3'):
        net_, att_ = sim.run_policy_world(w); acc = [(p, float(D)) for p in att_ for D, st in att_[p] if st == 'ok']
        S_P[w['name']], _ = record_s('S_P_' + w['name'], w['F'], w['S'], [w['portal']], acc, w['cap'], w['seed'], policy=w['policy'], attempts=att_[w['portal']])
        S_P[w['name']]['dead_default'] = bool(w['dead_default'])
    SG['S_P'] = S_P
    # mid-run scenario: GV4 world, V3 portal 91, policy (50, 3, 75) (v3.7.5: click 1 is the straight segment); add hole and re-aim, three re-aims, add rules, refusal order
    w_, net_, clicks_, mk_ = sim.surface_scenario(); budget_, b_, reserve_, rcap_ = sim.budgets(net_)
    ok_, ref_ = sim.surface_reaim_case(net_, rcap_)
    first_ok = None
    for t in range(40, 400, 10):
        i = sim.reaim_pick(net_, float(t))
        if i is None: continue
        q = sim.reaim(net_, float(t), i, (20.0, 20.0), rcap_)
        if q is not None and q['clamped']:
            first_ok = dict(t=t, seg=i, cost=round(q['cost'], 6), wantedCost=round(q['wantedCost'], 6), cap=rcap_, new=[seg_json(k) for k in q['new']]); break
    R_ = mk_(); add_ = R_.add_hole(75.0, 80, 20); i_re = sim.reaim_pick(R_.net, 100.0, segs=R_.layout); re_ = R_.reaim(100.0, i_re, sim.REAIM_TARGET); rs_ = R_.result()
    mid = dict(world='GV4', portal=w_['portal'], policy=list(w_['policy']), clicks=[[p, D] for p, D in clicks_],
               reaim_case=dict(first_clamped_success=first_ok, first_clamped=list(ok_), first_refusal=list(ref_), refusal_target=list(sim.SURF_REFUSE)),
               add=dict(t=75.0, col=80, req_depth=20, status=add_['status'], depth=add_.get('depth'), triggers=add_.get('triggers')),
               reaim=dict(t=100.0, seg=i_re, target=list(sim.REAIM_TARGET), status=re_['status'], cost=round(re_['ra']['cost'], 6), wantedCost=round(re_['ra']['wantedCost'], 6), clamped=bool(re_['ra']['clamped'])),
               reserves=dict(initial=R_.reserve0, left=round(R_.resL, 6), right=R_.resR), segs=[seg_json_s(q) for q in R_.layout], holes=conv(R_.holes),
               result=dict(L=list(rs_['L']), R=list(rs_['R']), pairsL=rs_['pairsL'], pairsR=rs_['pairsR'], endL=round(rs_['endL'], 6), endR=round(rs_['endR'], 6),
                           drilledL=round(rs_['drilledL'], 6), drilledR=rs_['drilledR']))
    def seq_s(mut=()):
        R1 = mk_(mut); o = []
        for t_, tg_ in zip((95.0, 105.0, 115.0), ((190.0, 95.0), (10.0, 50.0), (100.0, 10.0))):
            i1 = sim.reaim_pick(R1.net, t_, comp=0, segs=R1.layout); r1_ = R1.reaim(t_, i1, tg_); o.append(dict(t=t_, seg=i1, target=list(tg_), status=r1_['status'], res_left=round(R1.resL, 6)))
        return o
    mid['three_reaims'] = seq_s(); mid['three_reaims_cap_vs_initial'] = seq_s(('cap_vs_initial',))
    i0_ = sim.reaim_pick(mk_().net, 10.0)
    def codes_s(mut=()):
        a = mk_(mut); a.nre = sim.REAIM_LIMIT; c_limit = a.reaim(10.0, i0_, sim.REAIM_TARGET)['status']
        b = mk_(mut); b.nre = sim.REAIM_LIMIT; c_fin = b.reaim(b.left_end(), i0_, sim.REAIM_TARGET)['status']
        c = mk_(mut); c.t_last = 20.0; c_time = c.reaim(10.0, i0_, sim.REAIM_TARGET)['status']
        d = mk_(mut); c_nb = d.reaim(10.0, 9999, sim.REAIM_TARGET)['status']
        e = mk_(mut); e.t_last = 80.0; c_add = e.add_hole(75.0, 80)['status']
        return dict(limit=c_limit, side_finished=c_fin, time=c_time, no_branch=c_nb, add_time=c_add)
    mid['overburden_reaim_seg'] = i0_; mid['refusal_order'] = codes_s(); mid['refusal_order_no_limit'] = codes_s(('no_limit',))
    Rg_ = sim.Round(sim.TEST_LEVELS['gv1'], F1_, S1_, [10], [(10, 35.0), (10, 25.0)], sim.SEED_L1, mode=SU)
    mid['gv1b_surface'] = dict(clicks=[[10, 35.0], [10, 25.0]], budget=Rg_.budget, reserve=Rg_.reserve0, holes=conv(Rg_.holes), add=add_out_s(Rg_.add_hole(5.0, 18)), second=add_out_s(Rg_.add_hole(6.0, 22)))
    SG['S_MID'] = mid
    # hand vectors (SW-A and friends) with the key value of every named mutant
    SWA_ = sim.rect(90, 109, 20, 39); SWD_ = sim.rect(100, 103, 6, 29); SWD5_ = sim.rect(100, 104, 6, 29); S2c_ = sim.rect(20, 39, 20, 39) | sim.rect(160, 179, 20, 39)
    S2m_ = sim.rect(20, 39, 20, 39) | sim.rect(150, 179, 20, 39); SWC_ = sim.rect(75, 124, 20, 99)
    def nn(S_, mut=(), cap=400, ps=(100,)): return sim.Network(S_, list(ps), cap, mut=mut, mode=SU)
    def clk(S_, Ds, mut=(), cap=400, ps=(100,)):
        n = nn(S_, mut, cap, ps); res = [n.next_gen(ps[0], D) for D in Ds]
        return dict(results=res, segs=[seg_json_s(q) for q in n.segs], length=n.length())
    def ceil_(mut=()):
        n = nn(SWC_, mut, 10 ** 9); return [n.next_gen(100, 20.0) for _ in range(25)]
    SW49_ = sim.rect(96, 103, 20, 39)                       # G49 (v3.8.0): 8 wide, so the outward grandchildren leave the margin at 15 deg
    n2_ = nn(SWA_); n49_ = nn(SW49_); [n49_.next_gen(100, 20.0) for _ in range(3)]
    EO_ = (102.56600990987044, 11.559221435201419)
    ray_cases = [[list(e), h, D, (n49_ if w == 'sw49' else n2_).ray_ok(100, e, h, D), w] for w, e, h, D in (('sw49', EO_, 22.5, 4.0), ('sw49', EO_, 21.5, 4.0), ('sw49', EO_, 15.0, 4.0), ('sw49', EO_, 14.5, 4.0),
                                                                                                       ('sw49', EO_, 7.5, 4.0), ('swa', (110.0, 3.0), 0.0, 4.0), ('swa', (111.0, 3.0), 0.0, 4.0), ('swa', (109.0, 3.0), 0.0, 4.0))]
    def seglen_(S_, d, D, mut=()):
        n = nn(S_, mut); ok, st_ = n.mask(); cells, elen, endpt, tr = sim.sample(100, 0.0, d, D, ok, 0.0, "carry"); return [elen, bool(tr), [sim.rh(endpt[0]), sim.rh(endpt[1])]]
    dot_ = {(50, 50)}; offs_ = [(0, 10), (6, 8), (7, 7), (1, 10), (0, 11), (8, 8), (10, 10)]
    def table_(mut=()):
        w2 = sim.reach_fn(dot_, 200, 100, mut); return [[list(o), w2((51 + o[0], 51 + o[1]))] for o in offs_]
    CsA_ = sim.comps(SWA_)
    S2k_ = sim.rect(70, 89, 20, 39) | sim.rect(110, 139, 20, 39) | sim.rect(99, 101, 38, 39)
    nq_ = nn(S2k_); [nq_.next_gen(100, 20.0) for _ in range(2)]; nf_ = nn(S2k_, ('comp_first',)); [nf_.next_gen(100, 20.0) for _ in range(2)]
    E = dict(
        swa_click1=clk(SWA_, [20.0]), swa_click2=clk(SWA_, [20.0, 20.0]), swa_click3=clk(SWA_, [20.0, 20.0, 20.0]), swa_click1_trunk=dict(nsegs=3, note="trunk mode, same input: 3 segments, seg 0 length 20.0, meter 140.0 m"),
        swa_bad=dict(trunk_resurrect=clk(SWA_, [20.0], ('trunk_resurrect',)), root_dir_nonzero=clk(SWA_, [20.0], ('root_dir_nonzero',)), mask_always=clk(SWA_, [20.0], ('mask_always',)),
                     ray_off=clk(SWA_, [20.0, 20.0, 20.0], ('ray_off',)), root_forks=clk(SWA_, [20.0], ('root_forks',)), ray_back=clk(SWA_, [20.0], ('ray_back',)), ray_short=clk(SWA_, [20.0], ('ray_short',))),
        stay_mask=dict(swa=seglen_(SWA_, 15.0, 4.0), swd=seglen_(SWD_, 15.0, 20.0), swd5=seglen_(SWD5_, 15.0, 20.0), mask_never_swd=seglen_(SWD_, 15.0, 20.0, ('mask_never',)),
                       mask_always_swd=seglen_(SWD_, 15.0, 20.0, ('mask_always',)), swd_click=clk(SWD_, [20.0, 100.0])),
        ray_cases=ray_cases, ray49_gen3=sorted(round(q['dir'], 3) for q in n49_.segs if q['gen'] == 3), ray49_ray_off=len([q for q in clk(SW49_, [20.0, 20.0, 20.0], ('ray_off',))['segs'] if q['gen'] == 3]), ray_vs_S=[[[110.0, 3.0], 0.0, nn(SWA_, ('ray_vs_S',)).ray_ok(100, (110.0, 3.0), 0.0, 4.0)], [[109.0, 3.0], 0.0, nn(SWA_, ('ray_vs_S',)).ray_ok(100, (109.0, 3.0), 0.0, 4.0)]],
        cap=dict(cap4=clk(SWA_, [20.0], (), 4)['results'], cap3=clk(SWA_, [20.0], (), 3)['results'], cap3_skip_ob=clk(SWA_, [20.0], ('cap_skip_ob',), 3)['results']),
        ceiling_world=dict(S='rect(75,124,20,99)', portal=100, click_m=20.0, results=ceil_(), ob_gen_free=ceil_(('ob_gen_free',))),
        attribution=dict(S2k=dict(comp=[q['comp'] for q in nq_.segs], comp_lengths=nq_.comp_lengths()), comp_first=dict(comp=[q['comp'] for q in nf_.segs], comp_lengths=nf_.comp_lengths())),
        target_sets={'same_body_100_104': nn(sim.rect(90, 109, 20, 39), (), 400, (100, 104)).Tk, 'two_bodies_10_49': nn(sim.rect(20, 39, 20, 39) | sim.rect(60, 79, 20, 39), (), 400, (10, 49)).Tk,
                     'two_bodies_10_50': nn(sim.rect(20, 39, 20, 39) | sim.rect(60, 79, 20, 39), (), 400, (10, 50)).Tk},
        reach_table=dict(S='dot (50,50)', offsets=[list(o) for o in offs_], zero=table_(), pair_range_11=table_(('pair_range_11',)), range_cheb=table_(('range_cheb',)),
                         range_manh=table_(('range_manh',)), range_lt=table_(('range_lt',))),
        pass0=dict(S='rect(90,109,20,39)', b=[8], first_hole={str(c): sim.rig_plan(CsA_, {0: [c]}, [8], snap=True)[0][0][0] for c in (50, 89, 91, 100)},
                   no_snap={str(c): sim.rig_plan(CsA_, {0: [c]}, [8], snap=True, mut=('pass0_no_snap',))[0][0][0] for c in (50, 89)}))
    SG['S_E'] = E
    # cover cap (G61)
    covw = {'GV2': (Sp_, False), 'GV3': (Sp_, False), 'GV4': (Sm, False)}
    for i in range(1, 7): covw['L%d' % i] = (sim.s_ref(sim.gen_level(sim.LEVELS[i], 0)['F']), True)
    SG['S_cover'] = {k: dict(col=sim.cover_col(S_), cover_m=sim.cover_m(S_), shipped=sh_, ok=sim.cover_ok(S_, sh_), cover_m_col_120=(5.0 * min(y for x, y in S_ if x == 120) if k == 'L3' else None))
                     for k, (S_, sh_) in covw.items()}
    SG['S_anchor'] = {k: list(v) for k, v in sim.ANCHOR.items()}
    SG['S_consts'] = dict(start_mode=SU, ray_step=sim.RAY_STEP, ray_tolerance=0, cover_cap_m=sim.COVER_CAP_M, radar_range=sim.RADAR_RANGE, ceiling=sim.NUMBRANCH_MAX, tip_sep_frac=sim.TIP_SEP_FRAC, theta_fixed=sim.THETA_FIXED, tip_sep_floor=sim.TIP_SEP_FLOOR, dir_clamp=sim.DIR_CLAMP)
    G.update(SG)

with open(os.path.join(HERE, "step45_reference_sim_v3.py"), "rb") as f: sh = hashlib.sha256(f.read()).hexdigest()
with open(__file__, "rb") as f: exh = hashlib.sha256(f.read()).hexdigest()
G['_meta'] = dict(sim_file="step45_reference_sim_v3.py", sim_sha256=sh, exporter_sha256=exh, spec_version="3.8.0", mutated=MUT, cell_m=sim.CELL_M, r0_cells=sim.R0_FULL,
                  export_flag=True, counts={k: len(G[k]) for k in ('E3', 'E3b', 'E8', 'E9', 'E10', 'E11')})
if START == SU: G['_meta']['start_mode'] = SU
with open(OUT, "w") as f: json.dump(G, f, separators=(',', ':'))
print("wrote", OUT, os.path.getsize(OUT), "bytes; sim sha256", sh[:16], "; mutate", MUT)
for k in gv_keys: print(k, G[k]['totals'], G[k]['left']['drilled_m'], G[k]['right']['drilled_m'])
