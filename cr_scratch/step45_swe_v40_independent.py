"""Step 45 D1 (v3.8.0): the branch half-angle is the constant 15 deg in surface mode (SPlan theta_rows='fixed'; 'T' = the v3.7.7 bounding-box angle, 'surface' = the same from row 0, both kept as mutants); W1 to W3, G4 re-valued; compared with goldens_v41.json. Frozen: step45_swe_v39_independent.py.
Step 45.10b-9: v3.7.5 straight root (the SPlan.click root drills one segment, generation 1 forks); the section below is the 45.10b-4 text re-pointed at goldens_v41.json.
Step 45.10b-4: v3.7.2 surface branching (section v39_branching at the end, own SPlan, own R4, own stay-mask, own attribution, own pass 0, own pair reach, own cover cap, compared with
goldens_v41.json S keys); sections 45.10b-3 and below unchanged and run against the trunk-mode anchor (goldens_v41.json keeps every goldens_v37 key).
Step 45.10b-3: v3.7 speed model (spec 2d) on top of the v3.6 independent check below; section v37_speed at the end re-derives the speed and clock values
from the spec text and compares them with goldens_v37.json. Env S45_ZC=1 runs the zero control (R 10, legacy travel 50 m, v36 values).

Step 45.7 independent check of spec v3.6 and its sim (Software Engineer, 2026-10-15). Section 1 is step45_swe_v34_independent.py unchanged
(21 invariants, spec v3.5 content that v3.6 keeps: growth, coring, budget, Balrog, PLAN edits, both sensing pipelines, re-aim, hash, GV4m,
D20). Section 2 (function v36_checks) re-implements the v3.6 rules from the spec text: per-level cap and barren fields, the formation
generator and re-seed rule, rig schedule, per-side reserves and the re-aim cap against the remaining reserve, add hole, fixed tick,
rounding snap, readout half up, advisor P1 to P5, {spot}, cooldown, F-independence, brush discs, Back to paint. The sim is imported
only to read outputs for comparison; none of its rule functions is called to produce an expected value.
Run: python -I step45_swe_v36_independent.py          (about 3 min)   add --full for the 200-variant generator sweep."""
import math, json, os, sys, random
from decimal import Decimal, ROUND_HALF_UP, ROUND_HALF_EVEN

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = []
def check(name, zero, bad, note=""):
    OUT.append((name, bool(zero), bool(bad)))
    print(f"[{'PASS' if zero and bad else 'FAIL'}] {name}: zero={bool(zero)} mutant-caught={bool(bad)} {note}")

# ---------------- constants from spec section 2 (meters -> 5 m cells) ----------------
M = 5.0
GW, GH = 200, 100
CAP = round(2000 / M)                 # 400
R0 = 4.0 / M                          # 0.8 (Quinn ruling 2026-10-15; v3.3 used 6.25 m)
RANGE = round(50 / M)                 # 10
MINGAP = round(10 / M)                # 2
SPACINGS = [round(v / M) for v in (50, 25, 10, 5)]   # 10, 5, 2, 1
ZC = os.environ.get('S45_ZC') == '1'
RATIO = 10.0 if ZC else 3.4                                  # rig_speed_ratio R
TC = 2.5                                                      # real hours per game second (spec 2d)
V_BB = 2.5 / M                                                # borebot 0.5 cells per game s
V_DRILL = RATIO * V_BB                                        # rig: 1.7 cells per game s (5.0 in ZC)
V_TRAVEL = (50.0 if ZC else 1.0 * 3600.0 * TC) / M            # rig travel: 1.0 m/s real = 9,000 m per game s = 1,800 cells/s (10 in ZC)
HAND = dict(GV1=10.3, GV1b=13.3, GV2=55.3, GV3=88.2, GV3b=94.2, GV4=76.4, GV4m=97.6) if ZC else \
       dict(GV1=23.002778, GV1b=28.299118, GV2=152.420098, GV3=241.30634, GV3b=247.30634, GV4=178.957908, GV4m=214.294248)   # hand values, plan A.3 / R.2 row 6
LATE = {}
PAIR_S = 3.0
SEP = round(25 / M)                   # 5
MASK_RE = round(40 / M)               # 8

def hu(x):   # half up, x >= 0
    return int(Decimal(repr(round(x, 9))).quantize(Decimal(1), rounding=ROUND_HALF_UP))
def he(x): return round(x)            # half even (mutant)
def rcell(x, y): return (math.floor(round(x, 7) + 0.5), math.floor(round(y, 7) + 0.5))

# ---------------- G4: prune + coring along the whole path ----------------
def segment(x0, y0, deg, L, ok, A0, phase="carry"):
    """Returns (kept length, cored cells, end point, truncated). Prune samples at 0, 0.5, ... < L, and L.
    Coring at path arclength k + 0.5 (A0 = arclength at the segment start). phase='restart' is the defect-A mutant."""
    sn, cs = math.sin(math.radians(deg)), math.cos(math.radians(deg))
    pts = [i * 0.5 for i in range(int(L * 2) + 2) if i * 0.5 < L - 1e-9] + [L]
    kept, endp, cut = 0.0, (x0, y0), False
    for s in pts:
        if not ok(rcell(x0 + s * sn, y0 + s * cs)): cut = True; break
        kept, endp = s, (x0 + s * sn, y0 + s * cs)
    base = A0 if phase == "carry" else 0.0
    first = math.floor(base + 0.5 + 1e-9) + 0.5          # smallest k + 0.5 strictly above base
    cored = []; a = first
    while a - base <= kept + 1e-9:
        s = a - base; cored.append(rcell(x0 + s * sn, y0 + s * cs)); a += 1.0
    return kept, cored, endp, cut

def comps8(S):
    S = set(S); seen = set(); out = []
    for c in sorted(S):
        if c in seen: continue
        q = [c]; seen.add(c); comp = []
        while q:
            x, y = q.pop(); comp.append((x, y))
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if (nx, ny) in S and (nx, ny) not in seen: seen.add((nx, ny)); q.append((nx, ny))
        out.append(comp)
    return sorted(out, key=lambda c: (-len(c), min(c)))

class Plan:
    """Left network = f(S, portals, accepted clicks). Refusal order: range, ceiling, dead, cap."""
    def __init__(self, S, portals, cap, W=GW, H=GH, clamp1=True, phase="carry", check_trunks=True):
        self.S, self.cap, self.W, self.H, self.clamp1, self.phase = set(S), cap, W, H, clamp1, phase
        halo = {(x + i, y + j) for x, y in S for i in (-1, 0, 1) for j in (-1, 0, 1)}
        self.ok = lambda c: c in halo and 0 <= c[0] < W and 0 <= c[1] < H
        self.C = comps8(S); self.seg = []; self.front = {}; self.gen = {}; self.th = {}; self.clicks = []
        for p in sorted(portals):
            top = min(y for x, y in S if x == p); ci = [i for i, C in enumerate(self.C) if (p, top) in C][0]
            xs = [x for x, y in self.C[ci]]; ys = [y for x, y in self.C[ci]]
            self.th[p] = max(20.0, min(70.0, math.degrees(math.atan((max(xs) - min(xs) + 1) / (2.0 * (max(ys) - min(ys) + 1))))))
            self.seg.append(dict(p=p, ci=ci, g=0, L=float(top), d=0.0, e=(float(p), float(top)), cut=False, A=float(top),
                                 cells=[(p, r) for r in range(top)], t=top / V_BB, par=None, t0=0.0, x0=float(p), y0=0.0, A0=0.0))
            self.front[p] = [len(self.seg) - 1]; self.gen[p] = 0
        if check_trunks and self.total() > cap + 1e-9: raise ValueError("trunks over cap")
    def total(self): return sum(s['L'] for s in self.seg)
    def click(self, p, Dm):
        if not (20 - 1e-9 <= Dm <= 100 + 1e-9) or abs(Dm / 5 - round(Dm / 5)) > 1e-9: return 'range'
        if self.gen[p] >= 24: return 'ceiling'
        D = Dm / M; th = self.th[p]; sep = max(1.0, 0.9 * D * math.sin(math.radians(th))); new = []
        for i in self.front[p]:
            pa = self.seg[i]
            if pa['cut']: continue
            for sg in (-1, 1):
                d = sg * th if pa['g'] == 0 else 0.5 * pa['d'] + sg * th
                if pa['g'] > 0 or self.clamp1: d = max(-60.0, min(60.0, d))
                L, cells, e, cut = segment(pa['e'][0], pa['e'][1], d, D, self.ok, pa['A'], self.phase)
                if L <= 1e-9 or any(math.hypot(e[0] - q['e'][0], e[1] - q['e'][1]) < sep - 1e-9 for q in new): continue
                new.append(dict(p=p, ci=pa['ci'], g=pa['g'] + 1, L=L, d=d, e=e, cut=cut, A=pa['A'] + L, cells=cells,
                                t=pa['t'] + L / V_BB, par=i, t0=pa['t'], x0=pa['e'][0], y0=pa['e'][1], A0=pa['A']))
        if not new: return 'dead'
        if self.total() + sum(q['L'] for q in new) > self.cap + 1e-9: return 'cap'
        self.front[p] = list(range(len(self.seg), len(self.seg) + len(new))); self.seg += new; self.gen[p] += 1
        self.clicks.append((p, Dm)); return 'ok'

# ---------------- 4b PLAN edits ----------------
def snap(S, col):
    cs = sorted({x for x, y in S}); return min(cs, key=lambda c: (abs(c - col), c))
def trunk(S, p): return min(y for x, y in S if x == p)
def rebuild(S, portals, clicks, cap, W=GW, H=GH):
    n = Plan(S, portals, cap, W, H); stopped = set(); kept = []
    for p, D in clicks:
        if p not in stopped and n.click(p, D) == 'ok': kept.append((p, D))
        else: stopped.add(p)
    return n, kept
def add_portal(S, portals, clicks, col, cap, guard=True):
    c = snap(S, col)
    if len(portals) >= 3: return 'max', portals
    if any(abs(c - q) < SEP for q in portals): return 'sep', portals
    n, _ = rebuild(S, portals, clicks, cap)
    if guard and n.total() + trunk(S, c) > cap + 1e-9: return 'trunk', portals
    return 'ok', sorted(portals + [c])
def move_portal(S, portals, clicks, old, col, cap, replay=True):
    c = snap(S, col); rest = [q for q in portals if q != old]
    if any(abs(c - q) < SEP for q in rest): return 'sep', portals, clicks
    if sum(trunk(S, q) for q in rest + [c]) > cap + 1e-9: return 'trunk', portals, clicks
    cl = [((c if p == old else p), D) for p, D in clicks]
    if not replay: return 'ok', sorted(rest + [c]), clicks          # mutant: stale clicks keep the old column
    _, kept = rebuild(S, sorted(rest + [c]), cl, cap); return 'ok', sorted(rest + [c]), kept
def remove_portal(S, portals, clicks, old, cap, drop=True):
    rest = [q for q in portals if q != old]; cl = [(p, D) for p, D in clicks if (p != old or not drop)]
    cl = [(p, D) for p, D in cl if p in rest]
    _, kept = rebuild(S, rest, cl, cap); return rest, kept

# ---------------- 4d budget and Balrog ----------------
def budget(n, rnd=hu):
    per = [0.0] * len(n.C)
    for s in n.seg: per[s['ci']] += s['L']
    B = rnd(n.total()); b = [rnd(v) for v in per]; b[-1] = B - sum(b[:-1])
    res = math.ceil(0.25 * B - 1e-9)                      # v2.5 text: reserve_cells = ceil(0.25 * budget)
    return B, b, res, math.floor(0.4 * res + 1e-9)
def balrog(n, b, spacings=SPACINGS):
    pc = {}
    for s in n.seg:
        if s['g'] == 0: pc.setdefault(s['ci'], []).append(s['p'])
    holes = []; spent = []
    for i, C in enumerate(n.C):
        deep = {}
        for x, y in C: deep[x] = max(deep.get(x, -1), y + 1)
        ps = sorted(pc.get(i, [])); hs = []; left = b[i]; done = False
        def put(col):
            nonlocal left, done
            if deep[col] <= left: hs.append((col, deep[col])); left -= deep[col]; return True
            if left > 0: hs.append((col, left)); left = 0
            done = True; return False
        for p in ps:
            if done: break
            put(p)
        order = sorted(deep, key=lambda c: (min(abs(c - p) for p in ps), c))
        for sp in spacings:
            if done: break
            for col in order:
                if any(abs(col - h[0]) < sp for h in hs): continue
                if not put(col): break
        holes.append(hs); spent.append(b[i] - left)
    return holes, spent

# ---------------- 5 sensing ----------------
def u32(seed, x, y, side=None):
    m = (1 << 32) - 1
    h = (seed * 0x9E3779B1 + x * 0xC2B2AE3D + y * 0x27D4EB2F + (side * 0x165667B1 if side is not None else 0)) & m
    h ^= h >> 16; h = (h * 0x85EBCA6B) & m; h ^= h >> 13; h = (h * 0xC2B2AE35) & m; h ^= h >> 16
    return h / 4294967296.0
def window(rows, top, D):
    """v2.5 text: corner exclusion h = max(0, D - 1.19 d); cell at row y (from the window top), distance u <= d/2 from the
    nearer line is excluded if y < h(1 - 2u/d) or y > D - 1 - h(1 - 2u/d)."""
    got = set()
    for row, a, b in rows:
        d = b - a; h = max(0.0, D - 1.19 * d); y = row - top
        for c in range(a + 1, b):
            u = min(c - a, b - c); lim = h * (1 - 2.0 * u / d)
            if u <= d / 2 + 1e-9 and (y < lim - 1e-9 or y > D - 1 - lim + 1e-9): continue
            got.add((c, row))
    return got
def run_pairs(plist, tier1):
    """plist: (ready, imaged set, cored-at-ready set) in schedule order. Returns scheduled, skipped, scheduled ready times."""
    sch = skp = 0; times = []
    for rd, im, cored in plist:
        if not im: skp += 1; continue
        new = len([c for c in im if c not in cored and c not in tier1])
        if new / len(im) < 0.2: skp += 1; continue
        sch += 1; times.append(rd)
        for c in im:
            if c not in cored: tier1.add(c)
    return sch, skp, times
def single_line(cored, tier1, seed, W, H, side=None, pf=None, log=None):
    pf = pf or (lambda r: min(1.0, (R0 / r) ** 2)); near = {}
    ring = [(i, j, math.hypot(i, j)) for i in range(-RANGE, RANGE + 1) for j in range(-RANGE, RANGE + 1) if 0 < math.hypot(i, j) <= RANGE + 1e-9]
    for a, b in cored:
        for i, j, r in ring:
            c = (a + i, b + j)
            if 0 <= c[0] < W and 0 <= c[1] < H and c not in cored and r < near.get(c, 99): near[c] = r
    k = 0
    for c, r in near.items():
        if c in tier1: continue
        if u32(seed, c[0], c[1], side) < pf(r):
            tier1.add(c); k += 1
            if log is not None: log[c] = r
    return k
def queue_end(times, drill_end):
    free = 0.0
    for rd in sorted(times): free = max(free, rd) + PAIR_S
    return max(free, drill_end)
def sense_left(n, seed, W, H, log=None):
    cored = set(); rows_of = {}; at = {}
    for i, s in enumerate(n.seg):
        rows_of[i] = {y for x, y in s['cells']}
        for x, y in s['cells']: cored.add((x, y)); at.setdefault(y, {}).setdefault(x, set()).add(i)
    groups = {}
    for y, xs in at.items():
        ks = sorted(xs)
        for a, b in zip(ks, ks[1:]):
            if not (MINGAP <= b - a <= RANGE) or (xs[a] & xs[b]): continue
            i, j = min(xs[a]), min(xs[b]); groups.setdefault((min(i, j), max(i, j)), []).append((y, a, b))
    keys = sorted(groups, key=lambda k: (max(n.seg[k[0]]['t'], n.seg[k[1]]['t']), k))
    plist = []
    for k in keys:
        rd = max(n.seg[k[0]]['t'], n.seg[k[1]]['t']); com = rows_of[k[0]] & rows_of[k[1]]
        at_rd = {c for s in n.seg if s['t'] <= rd + 1e-9 for c in s['cells']}
        plist.append((rd, window(groups[k], min(com), max(com) - min(com) + 1), at_rd))
    t1 = set(); sch, skp, times = run_pairs(plist, t1); xh = set(t1)
    sp = single_line(cored, t1, seed, W, H, log=log)
    return cored, t1, xh, (sch, skp), sp, queue_end(times, max(s['t'] for s in n.seg))
def sense_right(holes, seed, W, H, log=None):
    seq = [h for hs in holes for h in hs]; t = 0.0; pos = seq[0][0]; done = {}
    for h in seq:
        st = max(t, h[2] if len(h) > 2 else 0.0); t = st + abs(h[0] - pos) / V_TRAVEL + h[1] / V_DRILL; pos = h[0]; done[h[0]] = t
    depth = {h[0]: h[1] for h in seq}; cored = {(c, r) for c in depth for r in range(depth[c])}
    plist = []; fin = []
    for c in sorted(done, key=lambda c: (done[c], c)):
        L = [x for x in fin if x < c]; R = [x for x in fin if x > c]
        for nb in ([max(L)] if L else []) + ([min(R)] if R else []):
            a, b = sorted((c, nb))
            if not (MINGAP <= b - a <= RANGE): continue
            D = min(depth[a], depth[b]); rd = done[c]
            plist.append((rd, window([(r, a, b) for r in range(D)], 0, D), {(q, r) for q in done if done[q] <= rd + 1e-9 for r in range(depth[q])}))
        fin.append(c)
    t1 = set(); sch, skp, times = run_pairs(plist, t1); xh = set(t1)
    sp = single_line(cored, t1, seed, W, H, log=log)
    return cored, t1, xh, (sch, skp), sp, queue_end(times, t)
def pct(a, n): return str(Decimal(repr(round(100.0 * a / n, 9))).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
def readout(F, cored, t1):
    c = len(F & cored); i = len((F & t1) - cored); return (c, i, len(F)), (pct(c, len(F)), pct(i, len(F)), pct(c + i, len(F)))

def play(F, S, ports, clicks, cap, W=GW, H=GH, seed=0, adds=(), rnd=hu):
    n = Plan(S, ports, cap, W, H); res = [n.click(p, D) for p, D in clicks]
    B, b, rs, rc = budget(n, rnd); holes, spent = balrog(n, b)
    holes = [list(h) for h in holes]
    for a in adds: holes[-1].append(a)
    lg = {}; rg = {}
    cL, tL, xL, pL, sL, eL = sense_left(n, seed, W, H, lg); cR, tR, xR, pR, sR, eR = sense_right(holes, seed, W, H, rg)
    return dict(n=n, res=res, B=B, b=b, reserve=rs, rcap=rc, holes=holes, spent=spent, L=readout(F, cL, tL), R=readout(F, cR, tR),
                pairs=(pL, pR), sparse=(sL, sR), end=(round(eL, 6), round(eR, 6)), cored=(cL, cR), t1=(tL, tR), xh=(xL, xR), logs=(lg, rg))

# ---------------- worlds from the spec text (meters) ----------------
def box(x0m, x1m, y0m, y1m):   # cells whose 5 m block lies inside [x0, x1) x [y0, y1)
    return {(x, y) for x in range(int(x0m // M), int(x1m // M)) for y in range(int(y0m // M), int(y1m // M))}
L1F, L1S = box(40, 90, 50, 90), box(25, 75, 40, 100)
PF, PS = box(475, 535, 75, 500), box(475, 565, 50, 500)
def main_world():
    d = json.load(open(os.path.join(HERE, "step45_storyboard", "main_fs.json")))
    def res(old):
        old = {tuple(c) for c in old}; out = set()
        for i in range(GW):
            for j in range(GH):
                if (int((i * M + M / 2) / 12.5), int((j * M + M / 2) / 12.5)) in old: out.add((i, j))
        return out
    return res(d["F"]), res(d["S"])
MF, MS = main_world()
def default_portal(C):
    xs = [x for x, y in C]; m = sum(xs) / len(xs); tgt = math.floor(m) if abs(m - math.floor(m) - 0.5) < 1e-9 else round(m)
    return min(set(xs), key=lambda c: (abs(c - tgt), c))

# ---------------- re-aim (v2.5 text + v3.2 section 6) ----------------
def reaim(n, t, idx, target, cap):
    sg = n.seg
    def prog(q): return 0.0 if q['L'] == 0 else min(1.0, max(0.0, (t - q['t0']) / (q['L'] / V_BB)))
    s = sg[idx]; f = prog(s); dead = {idx}; grow = True
    while grow:
        grow = False
        for i, q in enumerate(sg):
            if i not in dead and q['par'] in dead and prog(q) == 0: dead.add(i); grow = True
    refund = s['L'] * (1 - f) + sum(sg[i]['L'] for i in dead if i != idx)
    a = math.radians(s['d']); cx, cy = s['x0'] + f * s['L'] * math.sin(a), s['y0'] + f * s['L'] * math.cos(a); A = s['A0'] + f * s['L']
    ring = {(x + i, y + j) for x, y in n.S for i in range(-MASK_RE, MASK_RE + 1) for j in range(-MASK_RE, MASK_RE + 1)}
    grid = lambda c: 0 <= c[0] < n.W and 0 <= c[1] < n.H
    Ds = [D / M for p, D in n.clicks if p == s['p']]; th = n.th[s['p']]
    def build(tx, ty):
        """Returns (cost, new segments as dict(cells, t)). Segment time: start + length / 0.5 cells/s, the straight
        segment starting at the re-aim time t, each regrown child at its parent's end time."""
        L = math.hypot(tx - cx, ty - cy); d = math.degrees(math.atan2(tx - cx, ty - cy))
        kL, cl, e, _ = segment(cx, cy, d, L, grid, A); tot = kL; t1 = t + kL / V_BB
        segs = [dict(cells=cl, t=t1)]; layer = [(e, d, A + kL, False, t1)]
        for g in range(s['g'] + 1, len(Ds) + 1):
            D = Ds[g - 1]; sep = max(1.0, 0.9 * D * math.sin(math.radians(th))); nxt = []
            for e0, d0, A0, cut, tp in layer:
                if cut: continue
                for sgn in (-1, 1):
                    dd = max(-60.0, min(60.0, 0.5 * d0 + sgn * th))
                    L2, c2cells, e2, c2 = segment(e0[0], e0[1], dd, D, lambda c: c in ring and grid(c), A0)
                    if L2 <= 1e-9 or any(math.hypot(e2[0] - z[0][0], e2[1] - z[0][1]) < sep - 1e-9 for z in nxt): continue
                    nxt.append((e2, dd, A0 + L2, c2, tp + L2 / V_BB)); tot += L2; segs.append(dict(cells=c2cells, t=tp + L2 / V_BB))
            layer = nxt
        return tot - refund, segs
    want = build(*target)[0]
    for k in range(51):
        fr = 1 - 0.02 * k; tx, ty = cx + (target[0] - cx) * fr, cy + (target[1] - cy) * fr; c, nsegs = build(tx, ty)
        if c <= cap + 1e-9:
            # layout after the re-aim: killed segments removed; the re-aimed segment keeps the cells cored up to f x length
            # and completes at t; new segments appended
            kept = s['cells']
            nkeep = len([1 for a_ in [math.floor(s['A0'] + 0.5 + 1e-9) + 0.5 + k_ for k_ in range(len(kept))] if a_ - s['A0'] <= f * s['L'] + 1e-9])
            lay = [dict(cells=(kept[:nkeep] if i == idx else q['cells']), t=(t if i == idx else q['t'])) for i, q in enumerate(sg) if i not in dead or i == idx]
            return dict(cost=c, want=want, clamped=fr < 1, f=f, refund=refund, frm=(cx, cy), to=(tx, ty), layout=lay + nsegs)
    return None
def pick(n, t, comp=0):
    def prog(q): return 0.0 if q['L'] == 0 else min(1.0, max(0.0, (t - q['t0']) / (q['L'] / V_BB)))
    c = [(i, q) for i, q in enumerate(n.seg) if q['ci'] == comp and q['g'] > 0 and 0 < prog(q) < 1]
    return min(c, key=lambda z: z[1]['x0'] + prog(z[1]) * z[1]['L'] * math.sin(math.radians(z[1]['d'])))[0] if c else None

# ===================================================================================================
# v3.6 independent re-implementation (Software Engineer, step 45.7). Every rule below is typed from the spec v3.6 text
# (sections 2b, 4, 4b, 5, 6, 7, 8, 9). The sim is read only to obtain outputs for comparison. Each check has a zero control
# (real behaviour with a known answer) and a known-bad case (a named mutant of the independent code that must disagree).
# ===================================================================================================
import itertools, ast, inspect, textwrap, random, time
from fractions import Fraction

def tenths_hu(n, d):                      # spec 2b: tenths = floor((2000 n + d) / (2 d))
    return (2000 * n + d) // (2 * d)
def pct_s(n, d):
    if d == 0: return "no formation"
    t = tenths_hu(n, d); return "%d.%d" % (t // 10, t % 10)
def js_tofixed(x, f):                     # JS Number.prototype.toFixed: exact binary value, tie -> larger n (away from zero)
    q = Decimal(1).scaleb(-f); v = Decimal(abs(x))
    s = v.quantize(q, rounding=ROUND_HALF_UP); return ("-" if x < 0 else "") + str(s)
def meters_s(cells):                      # spec 9: cells x 5, 1 decimal half up, thousands comma
    v = Fraction(repr(round(float(cells), 6))) * 5
    t = int((v * 10 + Fraction(1, 2)).__floor__()); whole, dec = divmod(t, 10)
    return "{:,}.{}".format(whole, dec)
def snap_cell(v):                         # spec 2b: floor(round6(v) + 0.5); JS form Number(v.toFixed(6))
    r = float(js_tofixed(v, 6)); return math.floor(r + 0.5)
def snap_cell_py(v): return math.floor(round(v, 6) + 0.5)
def tick_n(t):                            # spec 2b: n ticks = floor(round6(t x 10))
    return math.floor(float(Decimal(repr(t * 10.0)).quantize(Decimal("1e-6"), rounding=ROUND_HALF_EVEN)))

# ---------------- spec 8a level table, typed from the spec ----------------
FLAT = dict(k='flat', t=(20, 30), w=(120, 160), y0=(20, 40)); LENS1 = dict(k='lens', a=(35, 35), b=(12, 13), cy=(20, 24))
SPEC_LV = {
    1: dict(bodies=[[FLAT, LENS1]], noise_m=0.0, n_comp=1),
    2: dict(bodies=[[dict(k='pipe', w=(12, 12), top=(15, 25))]], noise_m=0.0, n_comp=1),
    3: dict(bodies=[[dict(k='dip', t=(20, 26), w=(120, 120), y0=(5, 15))]], noise_m=6.25, n_comp=1),
    4: dict(bodies=[[dict(k='dip', t=(12, 13), w=(80, 80), y0=(10, 30))], [dict(k='lens', a=(35, 35), b=(12, 13), cy=(30, 45))]], noise_m=12.5, n_comp=2),
    5: dict(bodies=[[dict(k='cluster', a=(15, 15), b=(7, 8), gap=(20, 35), cy=(30, 50))]], noise_m=18.75, n_comp=3),
    6: dict(bodies=[[dict(k='thin', a=(45, 45), b=(5, 5), cy=(65, 75))], [dict(k='pipe', w=(12, 12), top=(15, 30))]], noise_m=25.0, n_comp=2),
}
SPEC_PRIOR = {1: (70, 70), 2: (100, 12), 3: (100, 120), 4: (85, 70), 5: (60, 30), 6: (100, 12)}   # spec 7: max_depth_rows, W_min cells
HALF_T = dict(lens=12, dip=6, pipe=6, cluster=7, thin=5, flat=6)                                    # spec 8: half-thickness (cells)
def gu36(seed, a, b=0): return u32(seed, 1000 + a, b)
def gint(seed, a, rng, b=0): return rng[0] + math.floor(gu36(seed, a, b) * (rng[1] - rng[0] + 1))
def ell(cx, cy, a, b):
    return {(x, y) for x in range(max(0, cx - a), min(GW, cx + a + 1)) for y in range(max(0, cy - b), min(GH, cy + b + 1))
            if (x - cx) ** 2 / a ** 2 + (y - cy) ** 2 / b ** 2 <= 1.0}
def draw_body(seed, k, sp):
    j = 16 * k; kd = sp['k']
    if kd in ('lens', 'thin'):
        a = gint(seed, j + 1, sp['a']); b = gint(seed, j + 2, sp['b']); cy = gint(seed, j + 3, sp['cy'])
        return dict(k=kd, build=lambda x0: ell(x0 + a, cy, a, b), simxs=2 * a + 1, simrows=(cy - b, cy + b))
    if kd == 'flat':
        t = gint(seed, j + 1, sp['t']); w = gint(seed, j + 2, sp['w']); y0 = gint(seed, j + 3, sp['y0'])
        return dict(k=kd, build=lambda x0: {(x, y) for x in range(x0, x0 + w) for y in range(y0, y0 + t)}, simxs=w, simrows=(y0, y0 + t - 1))
    if kd == 'dip':
        t = gint(seed, j + 1, sp['t']); w = gint(seed, j + 2, sp['w']); y0 = gint(seed, j + 3, sp['y0']); tn = math.tan(math.radians(25.0))
        return dict(k=kd, build=lambda x0: {(x, y) for x in range(x0, x0 + w) for y in range(GH) if 0 <= y - (y0 + (x - x0) * tn) < t},
                    simxs=w, simrows=(y0, min(GH - 1, y0 + math.ceil((w - 1) * tn) + t)))
    if kd == 'pipe':
        w = gint(seed, j + 1, sp['w']); top = gint(seed, j + 2, sp['top'])
        return dict(k=kd, build=lambda x0: {(x, y) for x in range(x0, x0 + w) for y in range(top, GH)}, simxs=w, simrows=(top, GH - 1))
    if kd == 'cluster':
        a = gint(seed, j + 1, sp['a']); b = gint(seed, j + 2, sp['b']); g1 = gint(seed, j + 3, sp['gap']); g2 = gint(seed, j + 4, sp['gap'])
        c3y = [gint(seed, j + 5 + q, sp['cy']) for q in range(3)]
        def build(x0):
            c1 = x0 + a; c2 = c1 + 2 * a + g1; c3 = c2 + 2 * a + g2
            return ell(c1, c3y[0], a, b) | ell(c2, c3y[1], a, b) | ell(c3, c3y[2], a, b)
        return dict(k=kd, build=build, simxs=3 * (2 * a + 1) + g1 + g2, simrows=(min(c3y) - b, max(c3y) + b))
    raise ValueError(kd)
def lat_noise(seed, k, N, form="lerp2"):
    cache = {}
    def v(i, j):
        if (i, j) not in cache: cache[(i, j)] = N * (2.0 * gu36(seed, 200 + k, 512 * i + j) - 1.0)
        return cache[(i, j)]
    def n(x, y):
        i, j = x // 8, y // 8; fx, fy = (x % 8) / 8.0, (y % 8) / 8.0
        sx, sy = fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy)
        if form == "lerp2": r = (v(i, j) * (1 - sx) + v(i + 1, j) * sx) * (1 - sy) + (v(i, j + 1) * (1 - sx) + v(i + 1, j + 1) * sx) * sy
        else:
            a = v(i, j) + (v(i + 1, j) - v(i, j)) * sx; b = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * sx; r = a + (b - a) * sy
        return math.floor(64.0 * r + 0.5) / 64.0
    return n
def disp_noise(body, N, nf, metric="euclid"):
    if N == 0: return set(body)
    def dd(dx, dy): return dx * dx + dy * dy if metric == "euclid" else max(abs(dx), abs(dy)) ** 2
    offs = [(dx, dy, dd(dx, dy)) for dx in range(-N, N + 1) for dy in range(-N, N + 1) if (dx or dy) and dx * dx + dy * dy <= N * N]
    out = set(); near = {}
    for c in body:
        n = nf(*c); keep = True
        dmin = None
        for dx, dy, q in offs:
            cc = (c[0] + dx, c[1] + dy)
            if cc not in body:
                if dmin is None or q < dmin: dmin = q
                if 0 <= cc[0] < GW and 0 <= cc[1] < GH and q < near.get(cc, 10 ** 9): near[cc] = q
        if n < 0 and dmin is not None and not (dmin > n * n): keep = False
        if keep: out.add(c)
    for cc, q in near.items():
        n = nf(*cc)
        if n > 0 and q <= n * n: out.add(cc)
    return out
def own_cap(kind): return hu(HALF_T[kind] / 2.0)
def own_attempt(lid, seed, noise_on=True, bbox="cells", form="lerp2", metric="euclid", capped=True, sep=15, xs_fix=0):
    sp = SPEC_LV[lid]; shapes = []
    for k, opts in enumerate(sp['bodies']):
        o = opts[math.floor(gu36(seed, 15, 0) * len(opts))] if len(opts) > 1 else opts[0]
        shapes.append(draw_body(seed, k, o))
    for s in shapes:
        cells0 = s['build'](0)
        if bbox == "cells": s['xs'] = max(x for x, y in cells0) - min(x for x, y in cells0) + 1; s['rows'] = (min(y for x, y in cells0), max(y for x, y in cells0))
        else: s['xs'] = s['simxs']; s['rows'] = s['simrows']
        s['xs'] += xs_fix
    def clear(A, B):
        dx = max(A[0] - B[1], B[0] - A[1]) - 1; dy = max(A[2] - B[3], B[2] - A[3]) - 1
        return max(dx, dy) >= sep
    def allowed(k, boxes):
        s = shapes[k]; out = []
        for x0 in range(5, 194 - s['xs'] + 2):
            bx = (x0, x0 + s['xs'] - 1, s['rows'][0], s['rows'][1])
            if all(clear(bx, o) for o in boxes) and (k + 1 == len(shapes) or allowed(k + 1, boxes + [bx])): out.append(x0)
        return out
    boxes = []; F = set()
    Nl = hu(sp['noise_m'] / 5.0)
    for k, s in enumerate(shapes):
        al = allowed(k, boxes)
        if not al: return None
        x0 = al[math.floor(gu36(seed, 16 * k + 8, 0) * len(al))]
        boxes.append((x0, x0 + s['xs'] - 1, s['rows'][0], s['rows'][1]))
        cells = s['build'](x0)
        N = (min(Nl, own_cap(s['k'])) if capped else Nl) if noise_on else 0
        F |= disp_noise(cells, N, lat_noise(seed, k, N, form), metric) if N else cells
    keep = set()
    for C in comps8(F):
        if len(C) >= 50: keep |= set(C)
    return keep
def own_gen(lid, variant, force_fail=None, **kw):
    """Spec 8b item 7: accept at |F| >= 500 and body count; otherwise seed + 1, up to 16 re-seeds; then first seed with noise 0."""
    for k in range(17):
        seed = lid * 7919 + variant + k; F = own_attempt(lid, seed, True, **kw)
        ok = F is not None and len(F) >= 500 and len(comps8(F)) == SPEC_LV[lid]['n_comp']
        if force_fail is not None: ok = ok and not force_fail(k)
        if ok: return dict(F=F, seed=seed, variant=variant + k, reseeds=k, noise0=False)
    seed = lid * 7919 + variant; F = own_attempt(lid, seed, False, **kw)
    return dict(F=F, seed=seed, variant=variant, reseeds=17, noise0=True)

# ---------------- rig schedule (spec 5, 6) ----------------
def rig_times(seq, click_ignore=False, free_ignore=False):
    t = 0.0; pos = seq[0][0]; out = []
    for h in seq:
        c = 0.0 if click_ignore else (h[2] if len(h) > 2 else 0.0)
        st = c if free_ignore else max(t, c)
        td = st + abs(h[0] - pos) / V_TRAVEL; t1 = td + h[1] / V_DRILL
        out.append((h[0], h[1], st, td, t1)); t = t1; pos = h[0]
    return out
def rig_pairs(seq, **kw):
    """Light copy of the rig pair queue without sparse radar: returns (scheduled, skipped, [(ready, end, imaged-new cells)], finish)."""
    tm = rig_times(seq, **kw); done = {h[0]: h[4] for h in tm}; depth = {h[0]: h[1] for h in tm}
    plist = []; fin = []
    for c in sorted(done, key=lambda c: (done[c], c)):
        L = [x for x in fin if x < c]; R = [x for x in fin if x > c]
        for nb in ([max(L)] if L else []) + ([min(R)] if R else []):
            a, b = sorted((c, nb))
            if not (MINGAP <= b - a <= RANGE): continue
            D = min(depth[a], depth[b]); rd = done[c]
            plist.append((rd, window([(r, a, b) for r in range(D)], 0, D), {(q, r) for q in done if done[q] <= rd + 1e-9 for r in range(depth[q])}))
        fin.append(c)
    t1 = set(); sch = skp = 0; sched = []
    for rd, im, cored in plist:
        if not im: skp += 1; continue
        new = {c for c in im if c not in cored and c not in t1}
        if len(new) / len(im) < 0.2: skp += 1; continue
        sch += 1; sched.append((rd, im)); t1 |= {c for c in im if c not in cored}
    free = 0.0; ends = []
    for rd, im in sorted(sched, key=lambda z: z[0]): free = max(free, rd) + PAIR_S; ends.append((rd, free, im))
    return sch, skp, ends, max(free, max(h[4] for h in tm))

# ---------------- advisor P1..P5 (spec 7) ----------------
P_LINES = {'P1': (3, 6, 7), 'P2': (2, 3, 8), 'P3': (4, 9), 'P4': (9, 11), 'P5': (5, 8, 12)}; ANY_LINES = (1, 10, 13, 14, 15)
def own_trig(kind, new_cells, existing, terminal, pairs, S, prior, mut=()):
    """prior = (barren_rows, max_depth_rows, w_min_cells); pairs = [(new, imaged)]."""
    out = []; R2 = 14 if 'wide' not in mut else 39                     # 3.75^2 = 14.0625 -> integer squared distance <= 14
    offs = [(dx, dy) for dx in range(-6, 7) for dy in range(-6, 7) if dx * dx + dy * dy <= R2]
    ex = set(existing); near = sum(1 for c in new_cells if any((c[0] + dx, c[1] + dy) in ex for dx, dy in offs))
    if new_cells and ((kind == 'add' and near >= 1) or (kind == 'reaim' and 2 * near >= len(new_cells))): out.append('P1')
    lim = 5 if 'p2_half' not in mut else 2
    if any(im > 0 and lim * nw < im for nw, im in pairs): out.append('P2')
    if terminal[1] < prior[0] or terminal[1] >= prior[1]: out.append('P3')
    if S and min((terminal[0] - x) ** 2 + (terminal[1] - y) ** 2 for x, y in S) * 4 > prior[2] ** 2: out.append('P4')
    if not any(im > 0 and 5 * nw >= im for nw, im in pairs): out.append('P5')
    return out
def own_popups(events, mut=()):
    """events: (t, side, triggers, has_spot). One pop-up per 12 game s per side, 4 per side per run, lowest unused line; suppression consumes no line."""
    used = set(); per = {}; out = []
    for t, side, trig, spot in events:
        if not trig: continue
        L = per.setdefault(side, [])
        if len(L) >= 4 and 'nocap' not in mut: continue
        if L and t - L[-1] < 12.0 and 'nocool' not in mut: continue
        ln = None
        for pool in (P_LINES[trig[0]], ANY_LINES):
            for x in pool:
                if x in used or (x in (13, 14, 15) and not spot): continue
                ln = x; break
            if ln: break
        if ln is None: continue
        used.add(ln); L.append(t); out.append((side, t, ln))
    return out

# ---------------- Back to paint (spec 4b item 11) ----------------
def own_repaint(Snew, portals, clicks, mut=()):
    cols = sorted({x for x, y in Snew})
    def snapc(p): return min(cols, key=lambda c: (abs(c - p), c))
    if 'keep' in mut: return list(portals), list(clicks)
    mp = {}; kept = []
    for p in sorted(portals):
        c = snapc(p)
        if kept and abs(c - kept[-1]) < 5:
            if 'keep_right' in mut:
                old = kept.pop(); mp = {k: v for k, v in mp.items() if v != old}
            else: continue
        mp[p] = c; kept.append(c)
    Cs = comps8(Snew)
    def comp_of(col):
        top = min(y for x, y in Snew if x == col); return [i for i, C in enumerate(Cs) if (col, top) in C][0]
    def mean_col(C):
        xs = [x for x, y in C]; m = Fraction(sum(xs), len(xs)); r = math.floor(m + Fraction(1, 2)) if (m - math.floor(m)) != Fraction(1, 2) else math.floor(m)
        return r
    for i, C in enumerate(Cs):
        if any(comp_of(q) == i for q in kept): continue
        d = mean_col(C); cc = sorted({x for x, y in C}, key=lambda x: (abs(x - d), x))
        kept.append(next((x for x in cc if all(abs(x - q) >= 5 for q in kept)), cc[0] if d not in cc else d))
    kept.sort()
    while len(kept) > 3:
        by = {}
        for q in kept: by.setdefault(comp_of(q), []).append(q)
        victim = max(max(v) for v in by.values() if len(v) > 1); kept.remove(victim)
    mp = {k: v for k, v in mp.items() if v in kept}
    return kept, [(mp[p], D) for p, D in clicks if p in mp]

def _gen_stat(lid, v, capped):
    g = own_gen(lid, v, bbox="sim", capped=capped); return (g['reseeds'], len(g['F']), g['noise0'])

# ---------------- v3.7 speed and clock (spec 2d), re-derived from the spec text ----------------
from fractions import Fraction
def own_clock(t, tc=Fraction(5, 2), mut=()):
    """'elapsed N.N h': hours = t x tc, tenths = floor(10 h + 1/2) in exact rational arithmetic, thousands comma from 1,000 h."""
    h = (t if isinstance(t, Fraction) else Fraction(repr(round(float(t), 9)))) * tc
    if 'seconds' in mut: h *= 3600
    tenths = (h * 10).__floor__() if 'trunc' in mut else (h * 10 + Fraction(1, 2)).__floor__()
    txt = f"{tenths // 10:,}.{tenths % 10}"
    return "elapsed " + (txt.replace(",", "") if 'nocomma' in mut else txt) + " h"
def own_clock_even(t): return "elapsed %.1f h" % (float(t) * 2.5)          # Python formatting, tie to even
def closed_end(seq, drill, travel):
    pos = seq[0][0]; d = tr = 0.0
    for h in seq: d += h[1]; tr += abs(h[0] - pos); pos = h[0]
    return d / drill + tr / travel + PAIR_S
def v37_speed(SIM, G):
    print("== v3.7 speed and clock (spec 2d)")
    R37, T37 = 3.4, 1800.0
    seqs = {k: [h for hs in G[k]['holes'] for h in hs] for k in ('GV1', 'GV2', 'GV4')}
    hand = dict(GV1=23.002778, GV2=152.420098, GV4=178.957908)
    chk = lambda R, T: {k: round(closed_end(seqs[k], R * V_BB, T), 6) for k in seqs}
    if not ZC:
        check("S1 rig end = own full run = closed form = hand value, GV1 GV2 GV4 (1e-6)",
              all(abs(G[k]['end'][1] - hand[k]) < 1e-6 and abs(closed_end(seqs[k], R37 * V_BB, T37) - hand[k]) < 1e-6 for k in seqs),
              all(abs(closed_end(seqs['GV2'], r * V_BB, T37) - hand['GV2']) > 1e-6 for r in (3.5, 3.3)) and round(closed_end(seqs['GV2'], 3.5 * V_BB, T37), 6) == 148.15119
              and round(100 / (3.57 * V_BB), 6) == 56.022409, f"R 3.5 -> {chk(3.5, T37)}, R 3.3 -> {chk(3.3, T37)}")
        check("S2 bot unchanged by R: left end GV1 46.0, GV2 211.0, GV4 192.0; spec vectors 100 / 1.7 = 58.823529, 10 / 0.5 = 20.0",
              (G['GV1']['end'][0], G['GV2']['end'][0], G['GV4']['end'][0]) == (46.0, 211.0, 192.0) and round(100 / (R37 * V_BB), 6) == 58.823529 and round(10 / V_BB, 6) == 20.0,
              round(10 / (R37 * V_BB), 6) == 5.882353, "mutant: ratio on the bot gives 5.882353 s")
    check("S3 zero arm: R 10 and travel 50 m reproduce the v36 rig ends 10.3 / 55.3 / 76.4", {k: round(closed_end(seqs[k], 10 * V_BB, 10.0), 6) for k in seqs} == dict(GV1=10.3, GV2=55.3, GV4=76.4),
          chk(10, 10.0) != chk(3.4, T37))
    inv = lambda tc: (V_BB * M / tc, RATIO * V_BB * M / tc, V_TRAVEL * M / (tc * 3600.0))
    ok_inv = all(abs(a - b) < 1e-9 for a, b in zip(inv(TC), (1.0, RATIO, 1.0 if not ZC else 1 / 180.0)))
    check("S4 TIME_COMP 2.5 real h per game s: bot 1.0 m/h, rig R m/h, travel 1.0 m/s real", ok_inv and TC == 2.5,
          all(max(abs(a - b) for a, b in zip(inv(tc), (1.0, RATIO, 1.0))) > 1e-9 for tc in (0.4, 2.4, 2.6)), "mutants: TC 0.4, 2.4, 2.6")
    T60 = [(0.0, "elapsed 0.0 h"), (46.0, "elapsed 115.0 h"), (211.0, "elapsed 527.5 h"), (192.0, "elapsed 480.0 h"), (23.002778, "elapsed 57.5 h"),
           (152.420098, "elapsed 381.1 h"), (0.02, "elapsed 0.1 h"), (192.1, "elapsed 480.3 h")]
    TK = [(1, "elapsed 0.3 h"), (2, "elapsed 0.5 h"), (3, "elapsed 0.8 h"), (1920, "elapsed 480.0 h"), (16000, "elapsed 4,000.0 h"), (3999, "elapsed 999.8 h"), (4000, "elapsed 1,000.0 h")]
    zero = all(own_clock(t) == e for t, e in T60) and all(own_clock(Fraction(n, 10)) == e for n, e in TK)
    bad = (any(own_clock(t, mut=('trunc',)) != e for t, e in T60) and any(own_clock(t, mut=('seconds',)) != e for t, e in T60) and own_clock(Fraction(16000, 10), mut=('nocomma',)) == "elapsed 4000.0 h"
           and own_clock_even(0.1) == "elapsed 0.2 h" and own_clock(Fraction(1, 10)) == "elapsed 0.3 h")
    check("S5 clock strings: hand table (8 times, 7 ticks); half up; comma from 1,000 h", zero, bad, "mutants: truncation, seconds, no comma, Python tie-to-even at tick 1")
    gp = os.environ.get('S45_GOLDENS', os.path.join(HERE, "..", "game45", "test", "goldens_v41.json"))
    J = json.load(open(gp)); E12 = J['E12']; mism = []
    for k in ('GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4'):
        for side, i in (('left', 0), ('right', 1)):
            if abs(J[k][side]['end_s'] - G[k]['end'][i]) > 1e-6: mism.append((k, side, J[k][side]['end_s'], G[k]['end'][i]))
            w = E12['worlds'][k]
            if w[side + '_clock']['str'] != own_clock(J[k][side]['end_s']): mism.append((k, side, 'clock', w[side + '_clock']['str'], own_clock(J[k][side]['end_s'])))
        if abs(J[k]['right']['end_s'] - HAND[k]) > 1e-6: mism.append((k, 'hand', J[k]['right']['end_s'], HAND[k]))
    for r in E12['ticks']:
        if r['str'] != own_clock(Fraction(r['n'], 10)): mism.append(('tick', r['n'], r['str'], own_clock(Fraction(r['n'], 10))))
    for r in E12['clock_cases']:
        if r['str'] != own_clock(r['t']): mism.append(('clock_case', r))
    late = E12['gv4m_late']
    if not ZC and (abs(late['endR'] - LATE['end'][1]) > 1e-3 or abs(late['endL'] - LATE['end'][0]) > 1e-3): mism.append(('late', late['endR'], LATE.get('end')))
    check("S6 own results agree with goldens_v37.json: end times of 6 worlds (1e-6), hand values, clock strings, 8 ticks, 6 clock cases, GV4m_late",
          not mism, own_clock(J['GV2']['right']['end_s'], mut=('trunc',)) != E12['worlds']['GV2']['right_clock']['str'] and abs(J['GV2']['right']['end_s'] - G['GV2']['end'][1] - 0.5) > 1e-6,
          f"mismatches {mism[:4]}")

def v36_checks(SIM, G, FULL=False):
    t0 = time.time(); rnd = random.Random(36)
    print("== v3.6 independent checks")
    # ---------- V1 per-level cap and barren fields (M1) ----------
    fields = all(SIM.LEVELS[i]['drill_cap_m'] == 2000.0 and SIM.LEVELS[i]['barren_rows'] == 5 for i in range(1, 7))
    prior_ok = all((SIM.LEVELS[i]['max_depth_rows'], SIM.LEVELS[i]['w_min_cells']) == SPEC_PRIOR[i] for i in range(1, 7))
    tl = SIM.TEST_LEVELS
    test_ok = (tl['gv1']['drill_cap_m'], tl['gv1']['barren_rows'], tl['gv1']['max_depth_rows'], tl['gv1']['w_min_cells']) == (375.0, 5, 25, 10) and \
        (tl['pipe']['drill_cap_m'], tl['pipe']['max_depth_rows'], tl['pipe']['w_min_cells']) == (2000.0, 100, 12) and \
        (tl['main']['drill_cap_m'], tl['main']['max_depth_rows'], tl['main']['w_min_cells']) == (2000.0, 85, 70)
    noise_ok = all(SIM.LEVELS[i]['edge_noise_cells'] == hu(SPEC_LV[i]['noise_m'] / 5.0) for i in range(1, 7)) and [hu(m / 5.0) for m in (6.25, 12.5, 18.75, 25.0)] == [1, 3, 4, 5]
    def own_p3(barren, maxd, row): return row < barren or row >= maxd
    p3_ok = all(own_p3(b, m, r) == ('P3' in SIM.advisor_triggers('add', [(50, r)], set(), (50, r), [(5, 5)], {(50, 40)}, dict(barren_rows=b, max_depth_rows=m, w_min_cells=200)))
                for b, m in ((5, 100), (8, 85), (0, 25)) for r in range(0, 100))
    p3_bad = any(own_p3(5, 100, r) != own_p3(8, 100, r) for r in range(100))     # hard-coded 5 differs from barren_rows 8 on rows 5..7
    check("V1 level table: drill_cap_m 2,000 / barren_rows 5 / priors / test worlds / noise cells; P3 reads the level fields", fields and prior_ok and test_ok and noise_ok and p3_ok and 400 == round(2000 / M), p3_bad)
    # ---------- V2 generator: own implementation from section 8 text, F equality with the sim ----------
    caps_ok = {k: own_cap(k) for k in HALF_T} == dict(lens=6, dip=3, pipe=3, cluster=4, thin=3, flat=3)
    variants = [0, 1, 2, 3, 17, 34, 51]
    diffs_lit = {}; diffs_sim = {}; own_cache = {}
    for lid in range(1, 7):
        for v in variants:
            simg = SIM.gen_level(SIM.LEVELS[lid], v)
            lit = own_gen(lid, v, bbox="cells"); own_cache[(lid, v)] = lit
            if lit['F'] != simg['F'] or lit['seed'] != simg['seed'] or lit['reseeds'] != simg['reseeds']: diffs_lit[(lid, v)] = (len(lit['F']), len(simg['F']))
            ss = own_gen(lid, v, bbox="sim")
            if ss['F'] != simg['F'] or ss['seed'] != simg['seed'] or ss['reseeds'] != simg['reseeds']: diffs_sim[(lid, v)] = (len(ss['F']), len(simg['F']))
    print("   V2 F equality, bbox from the true cells (spec-literal):", len(variants) * 6 - len(diffs_lit), "of", len(variants) * 6, "; differing", diffs_lit)
    print("   V2 F equality, bbox/xs as the sim derives them (cluster xs = 3(2a+1)+g1+g2):", len(variants) * 6 - len(diffs_sim), "of", len(variants) * 6, "; differing", diffs_sim)
    saved = gu36
    def bad_gu(seed, a, b=0): return u32(seed, 1000 + (9 if a == 8 else a), b)
    globals()['gu36'] = bad_gu
    try: badF = [own_gen(lid, 0, bbox="sim")['F'] != own_cache[(lid, 0)]['F'] for lid in (4, 5, 6)]
    finally: globals()['gu36'] = saved
    check("V2 generator: own section 8b implementation (draws, placement, noise, specks, accept) equals sim F on 6 levels x 7 variants once the bbox/xs are fixed as the sim has them; noise caps 6/3/3/4/3/3",
          not diffs_sim and caps_ok, any(badF), "corrupted placement salt changes F")
    check("V2b DEFECT demonstrated: from the spec text alone (bbox = extent of the built cells) the cluster level F differs from the sim; levels 1 to 4 and 6 equal",
          all(k[0] == 5 for k in diffs_lit) and len(diffs_lit) >= 1 and all((lid, v) not in diffs_lit for lid in (1, 2, 3, 4, 6) for v in variants), len(diffs_lit) >= 1,
          f"{len(diffs_lit)} of {len(variants)} cluster variants differ")
    # ---------- V3 re-seed rule (8b item 7) ----------
    f3 = own_gen(4, 0, force_fail=lambda k: k < 3); f17 = own_gen(4, 0, force_fail=lambda k: True)
    s3 = SIM.gen_level(SIM.LEVELS[4], 0, accept=lambda F_, k: k >= 3); s17 = SIM.gen_level(SIM.LEVELS[4], 0, accept=lambda F_, k: False)
    z3 = f3['variant'] == 3 and f3['seed'] == 4 * 7919 + 3 and f3['F'] == s3['F'] and not f3['noise0']
    z17 = f17['noise0'] and f17['variant'] == 0 and f17['seed'] == 4 * 7919 and f17['F'] == s17['F'] and f17['reseeds'] == 17
    bad_early = own_gen(4, 0, force_fail=lambda k: True) ; bad2 = [own_attempt(4, 4 * 7919 + k, True) for k in range(3)]
    check("V3 re-seed: forced failures 0..2 give variant + 3 (seed 31,679); 17 failed attempts give first seed, noise 0; both equal sim F", z3 and z17,
          own_gen(4, 0, force_fail=lambda k: k < 3)['variant'] != 2)
    # ---------- V4 spec ambiguity probes: how far do the unstated choices move F? ----------
    amb = {}
    probe = [(lid, v) for lid in (4, 5, 6) for v in (0, 1, 2, 3)]
    for name, kw in (("bbox from true cells", dict(bbox="cells")), ("bbox sim-style", dict(bbox="sim")), ("lerp form 2", dict(bbox="sim", form="lerp1")),
                     ("Chebyshev distance", dict(bbox="sim", metric="cheb"))):
        base = {}
        for lid, v in probe:
            F = own_attempt(lid, lid * 7919 + v, True, **kw); base[(lid, v)] = F
        amb[name] = base
    ref = amb["bbox sim-style"]
    amb_diff = {name: sum(1 for k in probe if amb[name][k] != ref[k]) for name in amb}
    print("   V4 unstated-choice probes (differing attempts out of %d vs the sim-style reading):" % len(probe), amb_diff)
    check("V4 spec leaves bbox/xs, lattice-lerp form and distance metric unstated: report how many attempts change (info; PASS when the sim-style reading equals the sim)",
          all(ref[k] == (SIM.build_attempt(SIM.LEVELS[k[0]], k[0] * 7919 + k[1], True)[0]) for k in probe), True,
          f"true-cell bbox changes {amb_diff['bbox from true cells']}, lerp form {amb_diff['lerp form 2']}, Chebyshev {amb_diff['Chebyshev distance']}")
    # ---------- V5 rig schedule (M5) ----------
    gv1 = G['GV1']; seq1 = [(9, 20), (14, 14)]
    t_first = rig_times(seq1)[0]; t1b = rig_times([(9, 20), (14, 14), (18, 9, 5.0)])
    H5 = (4.0, 7.3, 7.3, 9.5) if ZC else (20 / 1.7, 20 / 1.7 + 5 / 1800 + 14 / 1.7, 20 / 1.7 + 5 / 1800 + 14 / 1.7, 20 / 1.7 + 5 / 1800 + 14 / 1.7 + 4 / 1800 + 9 / 1.7)
    z5 = abs(t_first[3] - 0.0) < 1e-12 and abs(t_first[4] - H5[0]) < 1e-9 and abs(t1b[1][4] - H5[1]) < 1e-9 and abs(t1b[2][2] - H5[2]) < 1e-9 and abs(t1b[2][4] - H5[3]) < 1e-9
    gseq = [h for hs in G['GV4']['holes'] for h in hs]; gseq = gseq + [(80, 60, 75.0 if ZC else 177.0)]
    sch, skp, ends, fin = rig_pairs(gseq); fin_ci = rig_pairs(gseq, click_ignore=True)[3]; fin_free = rig_pairs(gseq, free_ignore=True)[3]
    fin_story = rig_pairs([h for hs in G['GV4']['holes'] for h in hs] + [(80, 60, 75.0)])[3]
    simtm = SIM.rig_timeline([list(gseq)])
    tm_ok = all(abs(a[4] - b['t1']) < 1e-9 and abs(a[2] - b['start']) < 1e-9 for a, b in zip(rig_times(gseq), simtm))
    rnd_ok = True
    for _ in range(300):
        sq = [(rnd.randrange(0, 200), rnd.randrange(2, 100), (rnd.random() * 60 if rnd.random() < 0.5 else 0.0)) for _ in range(rnd.randrange(1, 7))]
        if any(abs(a[4] - b['t1']) > 1e-9 or abs(a[3] - b['td']) > 1e-9 for a, b in zip(rig_times(sq), SIM.rig_timeline([list(sq)]))): rnd_ok = False
    check("V5 rig schedule: no travel to hole 1; added hole starts at max(click, rig free); GV1b 7.3 to 9.5 s; GV4m right finish 97.6 s (ZC) / 214.294 s at the 75.0 s add and 215.336 s at the 177.0 s add (R 3.4); sim timeline equal on 300 random queues",
          z5 and (abs(fin - 97.6) < 0.05 if ZC else (abs(fin - 215.336) < 1e-3 and abs(fin_story - 214.294) < 1e-3)) and tm_ok and rnd_ok,
          (abs(fin_ci - 96.0) < 0.05 if ZC else abs(fin_ci - 214.294) < 1e-3) and fin_ci != fin, f"finish {fin:.3f}, click ignored {fin_ci:.3f}, free-time ignored {fin_free:.3f}")
    # ---------- V6 per-side reserves and re-aim cap vs remaining reserve (M3, M4) ----------
    n4 = G['GV4']['n']; B4 = G['GV4']['B']
    class Ledger:
        def __init__(s, B, mut=()):
            s.R0 = math.ceil(0.25 * B - 1e-9); s.res = float(s.R0); s.cap0 = math.floor(0.4 * s.R0 + 1e-9); s.mut = mut
        def cap(s): return s.cap0 if 'initial' in s.mut else min(s.cap0, s.res)
        def pay(s, cost): s.res = min(s.R0, s.res - cost)
    LL, LR = Ledger(B4), Ledger(B4)
    r1 = reaim(n4, 90.0, 6, (20.0, 20.0), LL.cap()); LL.pay(r1['cost']); LR.pay(60)
    z6a = LL.R0 == 75 and LL.cap0 == 30 and abs(r1['cost'] - 29.389) < 5e-4 and abs(LL.res - 45.611) < 5e-4 and LR.res == 15 and abs(r1['want'] - 56.352) < 5e-4 and r1['clamped']
    shared_bad = 75 - 60 - r1['cost'] < 0
    ra = reaim(n4, 90.0, 6, (20.0, 30.0), 30); rb = reaim(n4, 95.0, 8, (40.0, 30.0), 30)
    Rg = SIM.Round(SIM.TEST_LEVELS['main'], *SIM.main_world(), [60, 146], [(p, D) for D in SIM.MAIN_M for p in (60, 146)], SIM.SEED_MAIN)
    sc = []
    for t_, i_, tg in [(90.0, 6, (20.0, 30.0)), (95.0, 8, (40.0, 30.0)), (100.0, 31, (10.0, 10.0))]:
        sc.append(Rg.reaim(t_, i_, tg))
    costs = [x['ra']['cost'] for x in sc if x['status'] == 'ok']
    L1_, L2_ = Ledger(B4), Ledger(B4, ('initial',))
    for c in costs[:2]: L1_.pay(c); L2_.pay(c)
    third_ok = costs[2] <= L1_.cap() + 1e-9 if len(costs) > 2 else False
    if len(costs) > 2: L1_.pay(costs[2])
    mut_third_cost = 29.475                                   # spec 9d: the cost a third re-aim would take under the initial-only cap
    L2_.pay(mut_third_cost)
    z6b = abs(costs[0] - 29.847) < 5e-4 and abs(costs[1] - 29.755) < 5e-4 and abs(costs[2] - 14.814) < 5e-4 and L1_.res >= 0 and abs(L1_.res - 0.585) < 2e-3 and third_ok
    own_match = abs(ra['cost'] - costs[0]) < 1e-6 and abs(rb['cost'] - costs[1]) < 1e-6
    print(f"   V6 own re-aim costs on the planned network: {ra['cost']:.3f}, {rb['cost']:.3f}; sim Round costs {[round(c, 3) for c in costs]}; reserve left {L1_.res:.3f}; initial-cap mutant {L2_.res:.3f}")
    check("V6 reserves per side (left 45.611, right 15); re-aim cap = min(floor(0.4 x initial), remaining): costs 29.847 / 29.755 / 14.814, final reserve 0.585, own re-aim equals sim on the first two",
          z6a and z6b and own_match and abs(LL.cap0 - 30) < 1e-9, shared_bad and L2_.res < -14)
    # refund cap: negative cost never lifts the reserve above the initial
    Lr = Ledger(B4); Lr.pay(-72.059)
    check("V6b negative cost (refund) leaves the reserve at its initial 75", Lr.res == 75.0, min(75.0 + 72.059, 1e9) != 75.0)
    # ---------- V7 add hole (M4, M5) ----------
    Fp, Sp = SIM.pipe_world(); pp_ = SIM.default_portal(SIM.comps(Sp)[0]); lvp = SIM.TEST_LEVELS['pipe']
    mk = lambda: SIM.Round(lvp, Fp, Sp, [pp_], [(pp_, D) for D in SIM.PIPE6_M], SIM.SEED_PIPE)
    def own_add_default(S, col, res):
        ys = [y for x, y in S if x == col]
        return min((max(ys) + 1 + 5) if ys else 50, math.floor(res), GH)
    def own_add(st, S, t, col, depth=None, mut=()):
        if t >= rig_pairs(st['seq'])[3] - 1e-9: return ('side_finished', None)
        if st['n'] >= 6 and 'nolimit' not in mut: return ('limit', None)
        if not (0 <= col < GW): return ('outside', None)
        if any(h[0] == col for h in st['seq']): return ('sep', None)
        if math.floor(st['res']) < 2: return ('reserve', None)
        dd = own_add_default(S, col, st['res']) if depth is None else max(2, min(depth, math.floor(st['res']), GH))
        if 'noclamp' in mut: dd = 50 if depth is None else depth
        st['seq'] = st['seq'] + [(col, dd, t)]; st['res'] -= dd; st['n'] += 1; return ('ok', dd)
    scen = [(1.0, 120, None), (2.0, 130, None), (3.0, 140, None), (4.0, 130, None), (5.0, 300, None), (6.0, 150, 2)]
    Rr = mk(); st = dict(seq=[h for hs in Rr.holes for h in hs], res=float(Rr.reserve0), n=0)
    same7 = True; logs = []
    for t_, c_, d_ in scen:
        o = own_add(st, Sp, t_, c_, d_); s_ = Rr.add_hole(t_, c_, d_); logs.append((o[0], s_['status'], o[1], s_.get('depth')))
        if o[0] != s_['status'] or (o[0] == 'ok' and o[1] != s_['depth']): same7 = False
    Rr = mk(); st = dict(seq=[h for hs in Rr.holes for h in hs], res=float(Rr.reserve0), n=0); six = []
    for k, c_ in enumerate([20, 30, 40, 50, 60, 70, 80]):
        o = own_add(st, Sp, 1.0 + k, c_, 2); s_ = Rr.add_hole(1.0 + k, c_, 2); six.append((o[0], s_['status']))
        if o[0] != s_['status']: same7 = False
    Rr = mk(); st = dict(seq=[h for hs in Rr.holes for h in hs], res=float(Rr.reserve0), n=0); fin_t = rig_pairs(st['seq'])[3]
    late = [(own_add(dict(st, seq=list(st['seq'])), Sp, fin_t + dt, 150)[0], mk().add_hole(fin_t + dt, 150)['status']) for dt in (-0.2, 0.0, 0.2)]
    print("   V7 add-hole scenarios (own, sim, depth):", logs, "; six + limit:", six, "; around the finish time", round(fin_t, 3), late)
    z7 = same7 and logs[0][2] == 50 and logs[1][2] == 14 and logs[2][0] == 'reserve' and logs[3][0] == 'sep' and logs[4][0] == 'outside' and six[-1] == ('limit', 'limit') \
        and late[0][0] == late[0][1] == 'ok' and late[2][0] == late[2][1] == 'side_finished'
    st2 = dict(seq=[(103, 100), (98, 100), (108, 54)], res=64.0, n=0)
    check("V7 add hole: default depth (25 m below deepest S cell, 250 m if none), clamp to reserve, refusal order, limit 6, side lock; own == sim on 6 + 7 + 3 scenarios", z7,
          own_add(dict(st2, res=9.0, seq=list(st2['seq'])), Sp, 1.0, 18, None, ('noclamp',))[1] == 50 and own_add(dict(st2, res=9.0, seq=list(st2['seq'])), Sp, 1.0, 18, None)[1] == 9)
    print(f"   V7 note: at t equal to the finish time the sim refuses; spec says 'accepts actions until its own finish time' (equality unstated): own {late[1][0]} / sim {late[1][1]}")
    # ---------- V8 fixed tick (M6) ----------
    sweep_ok = all(tick_n(k / 10) == k and SIM.to_tick(k / 10) == k for k in range(0, 3001))
    acc = 0.0; float_gap = []
    for k in range(1, 3001):
        acc += 0.1
        if math.floor(acc * 10) != k: float_gap.append(k)
        if tick_n(acc) != k: raise AssertionError(("tick_n on accumulated clock", k, acc))
    fl_ok = all(tick_n(t) == SIM.to_tick(t) for t in [x / 1000 for x in range(0, 200001, 7)] + [75.04, 74.999999, 90.03, 0.0999, 75.06])
    zt = (tick_n(75.04) == 750 and tick_n(90.03) == 900 and tick_n(75.06) == 750 and tick_n(0.0) == 0)
    rn = lambda t: int(round(t * 10))
    # pacing formula as printed in spec section 6 versus the stated 1x rate
    spec_formula = lambda wall, speed: math.floor(wall * speed * 10)
    ticks_192 = 1920; wall_192 = 19.2
    check("V8 fixed tick: n = floor(round6(10 t)); every k/10 maps to k; 28,572 sweep values equal the sim", sweep_ok and fl_ok and zt, rn(75.06) == 751 and len(float_gap) > 0, f"a clock accumulated in 0.1 steps: naive floor(10 t) is wrong at {len(float_gap)} of 3000 steps (first {float_gap[:1]}), round6 is wrong at 0")
    pace_bad = spec_formula(wall_192, 1) != ticks_192
    print(f"   V8 pacing: spec section 6 'Ticks due = floor(wall elapsed x speed x 10)' gives {spec_formula(wall_192, 1)} ticks at 1x after 19.2 wall s; 192 game s needs {ticks_192} (factor 100)")
    # ---------- V9 rounding snap (M11) ----------
    k0 = 7
    vec = [k0 + 0.5 - 1e-7, k0 + 0.5, k0 + 0.5 + 1e-7, k0 + 0.5 - 1e-6, k0 + 0.5 + 1e-6, -0.5, -0.5 + 1e-7, -1.4999999, 0.0, -0.0, 2.4999995]
    own_v = [snap_cell(v) for v in vec]; py_v = [snap_cell_py(v) for v in vec]; sim_v = [SIM.rh(v) for v in vec]; simu = [SIM.rhu(v) for v in vec]
    zero9 = own_v == py_v == sim_v == simu and own_v[:3] == [8, 8, 8] and own_v[3] == 7 and own_v[4] == 8
    ties = [m / 128.0 for m in range(-4000, 4001)]; tie_diff_round = sum(1 for v in ties if float(js_tofixed(v, 6)) != round(v, 6))
    tie_diff_cell = sum(1 for v in ties if snap_cell(v) != snap_cell_py(v))
    rr = [rnd.uniform(-300, 300) for _ in range(20000)]; rand_diff = sum(1 for v in rr if snap_cell(v) != snap_cell_py(v))
    bad9 = [v for v in vec if math.floor(v + 0.5) != snap_cell(v)]
    check("V9 rounding snap: cell(v) = floor(round6(v) + 0.5); JS form Number(v.toFixed(6)) equals Python round on 20,000 random and 8,001 dyadic values", zero9 and tie_diff_cell == 0 and rand_diff == 0, len(bad9) >= 1,
          f"round6 values differ on {tie_diff_round} dyadic ties (v = m/128), cell index differs on {tie_diff_cell}; unsnapped floor(v+0.5) is wrong on {len(bad9)} of {len(vec)} vectors")
    # ---------- V9b rounding-boundary audit (T1.3): every argument the sim passes to rh / rhu across the goldens ----------
    rec = []; o_rh, o_rhu = SIM.rh, SIM.rhu
    SIM.rh = lambda v: (rec.append(v), o_rh(v))[1]; SIM.rhu = lambda v: (rec.append(v), o_rhu(v))[1]
    try:
        F_, S_ = SIM.l1_world(); p_ = SIM.default_portal(SIM.comps(S_)[0]); SIM.play(F_, S_, [p_], [(p_, D) for D in SIM.L1_CLICKS_M], SIM.L1_CAP, 25, 25, seed=SIM.SEED_L1, adds=[(18, 9, 5.0)])
        F_, S_ = SIM.pipe_world(); q_ = SIM.default_portal(SIM.comps(S_)[0])
        SIM.play(F_, S_, [q_], [(q_, D) for D in SIM.PIPE6_M], SIM.DRILL_CAP, seed=SIM.SEED_PIPE)
        SIM.play(F_, S_, [q_], [(q_, float(D)) for D in SIM.PIPE24_M], SIM.DRILL_CAP, seed=SIM.SEED_PIPE)
        F_, S_ = SIM.main_world(); dq = [SIM.default_portal(C) for C in SIM.comps(S_)]; cq = [(q, D) for D in SIM.MAIN_M for q in dq]
        SIM.play(F_, S_, dq, cq, SIM.DRILL_CAP, seed=SIM.SEED_MAIN); SIM.play_moves(F_, S_, dq, cq, SIM.DRILL_CAP, (80, 60, 75.0), 90.0, (20.0, 20.0), seed=SIM.SEED_MAIN)
    finally: SIM.rh, SIM.rhu = o_rh, o_rhu
    def d_half(v): r = round(v, 6); return abs((r - math.floor(r)) - 0.5)
    near = [v for v in rec if 0 < d_half(v) < 1e-6]
    ties7 = [v for v in rec if (Decimal(v) * 10 ** 7) % 10 == 5]
    exact = sum(1 for v in rec if d_half(v) == 0)
    check("V9b boundary audit: no argument of rh / rhu across GV1 to GV4m lies within 1e-6 of a .5 boundary except exactly on it, and none is a 7th-decimal tie", len(rec) > 20000 and not near and not ties7 and 3.4999999 != 3.5 and snap_cell(3.4999999) == snap_cell(3.5000001) == 4,
          math.floor(3.4999999 + 0.5) == 3, f"{len(rec)} arguments, {exact} exactly on .5, 0 near, 0 ties")
    # ---------- V10 readout half up (M12) ----------
    ok10 = all(pct_s(n, d) == SIM.pct1(n, d) for d in (80, 1020, 2036) for n in range(d + 1))
    ok10b = all(pct_s(n, d) == SIM.pct1(n, d) for d in [rnd.randrange(1, 20001) for _ in range(300)] for n in range(0, d + 1, max(1, d // 40)))
    gv = [(14, 24, 80, '17.5', '30.0', '47.5'), (12, 23, 80, '15.0', '28.8', '43.8'), (139, 353, 2036, '6.8', '17.3', '24.2'), (75, 194, 2036, '3.7', '9.5', '13.2')]
    gok = all((pct_s(c, d), pct_s(i, d), pct_s(c + i, d)) == (a, b, t) for c, i, d, a, b, t in gv)
    mtr = [(327.889, '1,639.4'), (359, '1,795.0'), (400, '2,000.0'), (1.0, '5.0'), (0.01, '0.1'), (0.0, '0.0'), (199.99, '1,000.0')]
    mok = all(meters_s(c) == e and SIM.fmt_m(c) == e for c, e in mtr)
    sec = [(43.75, '43.8'), (45.25, '45.3'), (0.05, '0.1'), (0.049, '0.0')]
    sok = all(str(Decimal(repr(round(x, 9))).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) == e == SIM.fmt1(x) for x, e in sec)
    trunc_first = next(((n, d) for d in (80,) for n in range(d + 1) if (1000 * n) // d != tenths_hu(n, d)), None)
    dlist = [80, 1020, 2036, 2000, 4000, 200, 400, 800] + [rnd.randrange(1, 20001) for _ in range(300)]
    js_first = next(((n, d) for d in dlist for n in range(d + 1) if js_tofixed(100.0 * n / d, 1) != pct_s(n, d)), None)
    jsr_first = next(((n, d) for d in dlist for n in range(d + 1) if "%.1f" % (math.floor(1000.0 * n / d + 0.5) / 10.0) != pct_s(n, d)), None)
    print(f"   V10 first disagreement: truncation {trunc_first}; (100n/d).toFixed(1) {js_first}; Math.round(1000n/d)/10 {jsr_first}")
    check("V10 readout: integer half up equals the sim for every n at d = 80, 1,020, 2,036 and 300 random d; GV totals from summed counts; drilled meters; seconds",
          ok10 and ok10b and gok and mok and sok, trunc_first is not None and js_first is not None, f"toFixed form first fails at {js_first}")
    # ---------- V11 advisor P1..P5 (M13) ----------
    pri = lambda lv: (lv['barren_rows'], lv['max_depth_rows'], lv['w_min_cells'])
    Sbox = {(x, y) for x in range(40, 61) for y in range(20, 61)}
    fz = random.Random(11); mism = 0; mism_mut = {'wide': 0, 'p2_half': 0}; cnt = {}
    for it in range(4000):
        kind = fz.choice(('add', 'reaim'))
        lv = dict(barren_rows=fz.choice((5, 8)), max_depth_rows=fz.choice((25, 60, 100)), w_min_cells=fz.choice((10, 12, 30, 70)))
        nc = [(fz.randrange(30, 70), fz.randrange(0, 100))] if kind == 'add' else [(fz.randrange(30, 70), fz.randrange(0, 100)) for _ in range(fz.randrange(1, 9))]
        ex = {(fz.randrange(30, 70), fz.randrange(0, 100)) for _ in range(fz.randrange(0, 60))} | {(c[0] + fz.randint(-5, 5), c[1] + fz.randint(-5, 5)) for c in nc if fz.random() < 0.4}
        prs = [(fz.randrange(0, 11), fz.randrange(0, 11)) for _ in range(fz.randrange(0, 4))]; prs = [(min(a, b), max(a, b)) for a, b in prs]
        if fz.random() < 0.3 and prs: prs[0] = (fz.choice((1, 2, 3)), fz.choice((5, 10, 15)))               # exact 20 percent ties
        term = (fz.randrange(0, 200), fz.randrange(0, 100)) if fz.random() < 0.5 else nc[-1]
        Sx = Sbox if fz.random() < 0.9 else set()
        a = own_trig(kind, nc, ex, term, prs, Sx, pri(lv)); b = SIM.advisor_triggers(kind, nc, ex, term, prs, Sx, lv)
        for t_ in a: cnt[t_] = cnt.get(t_, 0) + 1
        if a != b: mism += 1
        for m in ('wide', 'p2_half'):
            if own_trig(kind, nc, ex, term, prs, Sx, pri(lv), (m,)) != b: mism_mut[m] += 1
    print("   V11 4000 fuzz cases: mismatches", mism, "; trigger counts", dict(sorted(cnt.items())), "; mutants differ from sim on", mism_mut)
    gv1b = ('P1' not in own_trig('add', [(18, y) for y in range(9)], {(9, y) for y in range(20)} | {(14, y) for y in range(14)}, (18, 8), [(10, 20)], SIM.l1_world()[1], (5, 25, 10)))
    check("V11 advisor P1 to P5 from the section 7 text equals the sim on 4,000 fuzz cases (all five triggers exercised); GV1b P1 silent at 20 m", mism == 0 and gv1b and all(cnt.get(p, 0) > 100 for p in P_LINES),
          mism_mut['wide'] > 0 and mism_mut['p2_half'] > 0)
    # ---------- V12 advisor cooldown, cap, line pick ----------
    gl = SIM.Round(SIM.TEST_LEVELS['gv1'], *SIM.l1_world(), [9], [(9, 25.0), (9, 20.0)], SIM.SEED_L1)
    evs = [(1.0, 'R', ['P1'], True), (5.0, 'R', ['P2'], True), (13.0, 'R', ['P1'], True), (13.0, 'L', ['P3'], True), (14.0, 'L', ['P4'], True), (25.0, 'R', ['P5'], False),
           (26.0, 'R', ['P1'], True), (38.0, 'R', ['P2'], True), (50.0, 'R', ['P3'], True), (62.0, 'R', ['P4'], True), (74.0, 'R', ['P1'], True), (60.0, 'L', [], True), (80.0, 'L', ['P5'], True)]
    def sim_pop(events, mut=()):
        r = SIM.Round(SIM.TEST_LEVELS['gv1'], *SIM.l1_world(), [9], [(9, 25.0), (9, 20.0)], SIM.SEED_L1, mut); out = []
        for t, side, trig, spot in events:
            p = r._popup(side, t, trig, 7, dict(text='SPOT') if spot else None)
            if p: out.append((side, t, p['line']))
        return out
    mine = own_popups(evs); sims = sim_pop(evs)
    long_evs = [(1.0 + 13.0 * k, 'R', ['P1'], True) for k in range(8)]
    c_ok = len(own_popups(long_evs)) == 4 and len(sim_pop(long_evs)) == 4
    exact12 = own_popups([(0.0, 'R', ['P1'], True), (12.0, 'R', ['P2'], True), (23.9, 'R', ['P3'], True)]) == sim_pop([(0.0, 'R', ['P1'], True), (12.0, 'R', ['P2'], True), (23.9, 'R', ['P3'], True)])
    print("   V12 scripted events: own", mine, "\n        sim", sims)
    check("V12 advisor gates: 12 game s per side, 4 per side per run, lowest unused line (spot lines need a spot), suppression consumes no line; own == sim", mine == sims and c_ok and exact12 and len(mine) >= 6,
          own_popups(evs, ('nocool',)) != sims and own_popups(long_evs, ('nocap',)) != sim_pop(long_evs))
    # ---------- V13 spot rule at GV4m 74.0 s (spec 7) ----------
    mw = SIM.main_world(); Fm_, Sm_ = mw
    seq = [h for hs in G['GV4']['holes'] for h in hs]; tm = rig_times(seq); t = 74.0
    seen = set(); done_cells = set()
    for col, dep, st_, td, t1 in tm:
        if t >= td: seen |= {(col, y) for y in range(min(dep, int((t - td) * V_DRILL + 1e-9)))}
        if t >= t1 - 1e-9: done_cells |= {(col, y) for y in range(dep)}
    sch, skp, ends, fin = rig_pairs(seq); base_sch = sch
    for rd, e_, im in ends:
        if e_ <= t + 1e-9: seen |= im
    sp_t1 = set(); single_line(done_cells, sp_t1, SIM.SEED_MAIN, GW, GH); seen |= sp_t1
    unseen = {c for c in Sm_ if c not in seen}
    def region4(U):
        left = set(U); best = []
        while left:
            c0 = min(left); st_ = [c0]; left.discard(c0); comp = []
            while st_:
                q = st_.pop(); comp.append(q)
                for nb in ((q[0] + 1, q[1]), (q[0] - 1, q[1]), (q[0], q[1] + 1), (q[0], q[1] - 1)):
                    if nb in left: left.discard(nb); st_.append(nb)
            if len(comp) > len(best): best = comp
        return best
    reg = region4(unseen); cx = sum(c[0] for c in reg) / len(reg); cy = sum(c[1] for c in reg) / len(reg)
    def own_spot_col(reg, cx, holes_cols, res_left, S, seq_, skip_pair_check=False):
        for c in sorted({x for x, y in S}, key=lambda x: (abs(x - cx), x)):
            if any(abs(c - q) < 2 for q in holes_cols): continue
            ys = [y for x, y in S if x == c]; dep = min(max(ys) + 1 + 5, res_left)
            if dep < 2: continue
            if skip_pair_check or rig_pairs(seq_ + [(c, dep, t)])[0] > base_sch: return c
        return None
    col = own_spot_col(reg, cx, [h[0] for h in seq], 75, Sm_, seq)
    col_nopair = own_spot_col(reg, cx, [h[0] for h in seq], 75, Sm_, seq, True)
    simspot = SIM.advisor_spot('R', Sm_, seen, [list(seq)], 75)
    print(f"   V13 unseen S at 74.0 s: {len(unseen)}; region {len(reg)}; centroid ({cx:.2f}, {cy:.2f}); own spot column {col}; no-pair-check column {col_nopair}; sim {simspot and simspot['col']}")
    V13 = (829, 86.16, 45.55, 80) if ZC else (1147, 145.64, 63.80, 144)   # region cells, centroid, spot column (R 3.4: A-SIM3)
    check("V13 {spot} rule at GV4m 74.0 s: unseen region 829 cells at R 10 (1,147 at R 3.4: 2,836 unseen S cells, centroid (145.64, 63.80), right spot column 144); own observed state and own rule equal the sim", len(reg) == V13[0] and abs(cx - V13[1]) < 0.006 and abs(cy - V13[2]) < 0.006 and col == V13[3] and simspot['col'] == V13[3] and simspot['n_region'] == len(reg),
          abs(sum(c[0] for c in unseen) / len(unseen) - cx) > 0.006, f"column nearest the centroid without the pair test: {col_nopair}")
    # left spot: nearest region cell to centroid, ties lower (x, y)
    lcell = min(reg, key=lambda c: (math.hypot(c[0] - cx, c[1] - cy), c[0], c[1])); ls = SIM.advisor_spot('L', Sm_, seen)
    check("V13b left spot = region cell nearest the centroid (ties lower (x, y)); text 'x = 5x m, 5y m deep'", ls['cell'] == lcell and ls['text'] == "x = %d m, %d m deep" % (5 * lcell[0], 5 * lcell[1]),
          min(reg) != lcell)
    # ---------- V14 F-independence of the advisor (P4 changed from v2; {spot} = nearest cell of the unseen region) ----------
    def names_in(fn):
        src = textwrap.dedent(inspect.getsource(fn)); tree = ast.parse(src); hits = set()
        for nd in ast.walk(tree):
            if isinstance(nd, ast.Name) and nd.id in ('F', 'F0', 'Fm', 'Fm_'): hits.add(nd.id)
            if isinstance(nd, ast.Attribute) and nd.attr in ('F', 'F0'): hits.add('.' + nd.attr)
            if isinstance(nd, ast.arg) and nd.arg in ('F', 'F0'): hits.add('arg ' + nd.arg)
        return hits
    adv = [SIM.advisor_triggers, SIM.advisor_spot, SIM.observed_right, SIM.observed_left, SIM.unseen_region, SIM.vex_line, SIM.rig_sense, SIM.left_sense, SIM.sparse,
           SIM.frozen_pairs, SIM.reaim, SIM.reaim_check, SIM.apply_reaim, SIM.add_hole_depth, SIM.kill_set, SIM.pick_tip, SIM.Round.add_hole, SIM.Round.reaim, SIM.Round._popup,
           SIM.Round.right_end, SIM.Round.left_end]
    leaks = {fn.__qualname__: names_in(fn) for fn in adv if names_in(fn)}
    ctrl = names_in(SIM.Round.result)
    mut_src = textwrap.dedent(inspect.getsource(SIM.advisor_triggers)).replace("out = []", "out = []; _leak = len(F)", 1)
    mut_hits = {nd.id for nd in ast.walk(ast.parse(mut_src)) if isinstance(nd, ast.Name) and nd.id == 'F'}
    # metamorphic: four different F under one S, portals, clicks, actions
    def run_actions(Fx):
        R_ = SIM.Round(SIM.TEST_LEVELS['main'], Fx, Sm_, [60, 146], [(p, D) for D in SIM.MAIN_M for p in (60, 146)], SIM.SEED_MAIN); out = []
        for t_, c_ in ((74.0, 61), (76.0, 196), (78.0, 80)):
            r_ = R_.add_hole(t_, c_); out.append((r_['status'], r_.get('depth'), tuple(r_.get('triggers', [])), r_.get('popup') and r_['popup']['text'], r_.get('spot') and r_['spot']['text'],
                                                    tuple((tuple(p) if not isinstance(p, dict) else None) for p in r_.get('pairs', []))))
        i_ = SIM.reaim_pick(R_.net, 90.0, segs=R_.layout); r_ = R_.reaim(90.0, i_, SIM.REAIM_TARGET)
        out.append((r_['status'], tuple(r_.get('triggers', [])), r_.get('popup') and r_['popup']['text'], r_.get('spot') and r_['spot']['text']))
        i_ = SIM.reaim_pick(R_.net, 100.0, segs=R_.layout); r_ = R_.reaim(100.0, i_, (190.0, 99.0)) if i_ is not None else dict(status='none')
        out.append((r_['status'], tuple(r_.get('triggers', [])), r_.get('popup') and r_['popup']['text'], r_.get('spot') and r_['spot']['text']))
        return out, R_.log
    base_out, base_log = run_actions(Fm_)
    alts = {"F empty": set(), "F = S": set(Sm_), "F shifted 1": {(x + 1, y) for x, y in Fm_}, "F = complement of S": {(x, y) for x in range(GW) for y in range(GH) if (x, y) not in Sm_}}
    same = {k: run_actions(v) == (base_out, base_log) for k, v in alts.items()}
    p4_fired = any('P4' in o[2] for o in base_out[:3] if len(o) > 2 and isinstance(o[2], tuple))
    print("   V14 static F references in advisor paths:", leaks or "none", "; control (Round.result):", ctrl, "; metamorphic equal:", same, "; P4 fired in the scenario:", p4_fired, "; actions:", [o[:3] for o in base_out[:3]])
    check("V14 advisor is F-independent: no F reference in 21 advisor-path functions (AST); 4 different F give identical statuses, depths, triggers, texts, spots; P4 exercised",
          not leaks and all(same.values()) and p4_fired, bool(ctrl) and bool(mut_hits))
    # ---------- V15 paint disc counts, cap, Done painting (M10) ----------
    cnt_disc = {r: sum(1 for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy <= r * r) for r in (2, 5, 8, 12, 20)}
    cnt_excl = {r: sum(1 for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy < r * r) for r in (2, 5, 8, 12, 20)}
    sim_cnt = {r: len(SIM.brush_cells(100, 50, r)) for r in (2, 5, 8, 12, 20)}
    check("V15 brush disc sizes (inclusive r^2) 13 / 81 / 197 / 441 / 1,257 equal the sim; exclusive disc gives 69 at r 5", cnt_disc == sim_cnt == {2: 13, 5: 81, 8: 197, 12: 441, 20: 1257}, cnt_excl[5] == 69 and cnt_excl != cnt_disc)
    # ---------- V16 Back to paint (M9): own implementation vs sim on 400 random scenarios + G31 ----------
    def rect_(c0, c1, r0, r1): return {(x, y) for x in range(c0, c1 + 1) for y in range(r0, r1 + 1)}
    sc31 = [(rect_(24, 46, 10, 30), [22, 30, 38], [(22, 50.0), (30, 40.0), (38, 30.0)]), (rect_(30, 33, 10, 30), [22, 30, 38], [(22, 50.0), (30, 40.0), (38, 30.0)]),
            (rect_(26, 36, 10, 30) | rect_(60, 70, 10, 30), [30], [(30, 40.0)]), (rect_(20, 70, 10, 30), [30, 60], [(30, 40.0), (60, 30.0)])]
    want31 = [([24, 30, 38], [(24, 50.0), (30, 40.0), (38, 30.0)]), ([30], [(30, 50.0)]), ([30, 65], [(30, 40.0)]), ([30, 60], [(30, 40.0), (60, 30.0)])]
    z31 = all(own_repaint(*s) == w for s, w in zip(sc31, want31))
    fr = random.Random(16); bad16 = 0; bad_mut = {'keep': 0, 'keep_right': 0}; n16 = 0
    for _ in range(400):
        nb = fr.randrange(1, 4); Sn = set(); x0 = fr.randrange(0, 20)
        for _b in range(nb):
            w = fr.randrange(4, 30); Sn |= rect_(x0, x0 + w, fr.randrange(0, 20), fr.randrange(21, 40)); x0 += w + fr.randrange(3, 20)
        if len(comps8(Sn)) > 3: continue
        npt = fr.randrange(1, 4); ps = sorted({fr.randrange(0, 90) for _ in range(npt)}); ck = [(fr.choice(ps), float(fr.choice((20, 50, 100)))) for _ in range(fr.randrange(0, 5))]
        n16 += 1
        if own_repaint(Sn, ps, ck) != tuple(SIM.repaint_portals(Sn, ps, ck)[:2]): bad16 += 1
        for m in bad_mut:
            if own_repaint(Sn, ps, ck, (m,)) != tuple(SIM.repaint_portals(Sn, ps, ck)[:2]): bad_mut[m] += 1
    print(f"   V16 {n16} random scenarios: mismatches {bad16}; mutants differ: {bad_mut}")
    check("V16 Back to paint: own section 4b item 11 equals the sim on the G31 cases and %d random scenarios" % n16, z31 and bad16 == 0, bad_mut['keep'] > 0 and bad_mut['keep_right'] > 0)
    if FULL:
        from multiprocessing import Pool
        vs = [v * 17 for v in range(200)]
        with Pool(10) as pool:
            res = {lid: pool.starmap(_gen_stat, [(lid, v, True) for v in vs]) for lid in range(1, 7)}
            unc = {lid: pool.starmap(_gen_stat, [(lid, v, False) for v in vs[:100]]) for lid in (3, 4, 5, 6)}
        print("   FULL 200 variants spaced 17: re-seeds / fallbacks / smallest F per level:", {l: (sum(1 for r in R if r[0] > 0), sum(1 for r in R if r[2]), min(r[1] for r in R)) for l, R in res.items()})
        print("   FULL uncapped noise, 100 variants: first-seed failures per level:", {l: sum(1 for r in R if r[0] > 0) for l, R in unc.items()})
    print(f"   v3.6 block time {time.time() - t0:.1f} s")
    return dict(pace_bad=pace_bad, amb=amb_diff, diffs=diffs_lit)


# =====================================================================================================
# v3.7.2 surface branching (Step 45.10b-4). Re-derived from the spec text (sections 2d, 4b, 4c, 4d, 5, 6, 8a): own class SPlan, own R4 ray, own stay-mask,
# own attribution, own pass 0, own pair-reach filter, own cover cap. The sim is read only for outputs; worlds (F, S, seeds, click lists) come from goldens_v41.json.
# =====================================================================================================
class SPlan:
    """Uniform surface fork. Root (p, 0), no trunk. Children: heading 0.5 x parent + s x theta (root: s x theta), clamp 60, length D. Stay-mask, R4, tip spacing.
    ties='share': portals tied at the smallest column distance all serve a component (D29); 'lower' is the spec's literal text."""
    def __init__(self, S, portals, cap, W=GW, H=GH, ties='share', theta_rows='fixed', mask='stay', r4=True, rev=False, ob_free=False):
        self.S = set(S); self.cap = cap; self.W = W; self.H = H; self.mask = mask; self.r4 = r4; self.rev = rev; self.ob_free = ob_free
        self.halo = {(x + i, y + j) for x, y in self.S for i in (-1, 0, 1) for j in (-1, 0, 1)}
        self.C = comps8(S); self.ports = sorted(portals); self.serve = {p: [] for p in self.ports}
        for ci, C in enumerate(self.C):
            cols = {x for x, y in C}; dd = {p: min(abs(p - c) for c in cols) for p in self.ports}; m = min(dd.values())
            owners = [p for p in self.ports if dd[p] == m]
            for p in (owners[:1] if ties == 'lower' else owners): self.serve[p].append(ci)
        self.th = {}; self.haloT = {}; self.near = {}
        for p in self.ports:
            T = [c for ci in self.serve[p] for c in self.C[ci]]
            if not T: self.th[p] = None; self.haloT[p] = set(); self.near[p] = {}; continue
            xs = [x for x, y in T]; ys = [y for x, y in T]; top = 0 if theta_rows == 'surface' else min(ys)
            self.th[p] = 15.0 if theta_rows == 'fixed' else max(20.0, min(70.0, math.degrees(math.atan((max(xs) - min(xs) + 1) / (2.0 * (max(ys) - top + 1))))))
            self.haloT[p] = {(x + i, y + j) for x, y in T for i in (-1, 0, 1) for j in (-1, 0, 1)}
            nm = {}
            for ci in self.serve[p]:
                for x, y in self.C[ci]:
                    for i in (-1, 0, 1):
                        for j in (-1, 0, 1):
                            c = (x + i, y + j); k = (i * i + j * j, ci)
                            if c not in nm or k < nm[c]: nm[c] = k
            self.near[p] = {c: v[1] for c, v in nm.items()}
        self.seg = []; self.front = {p: [None] for p in self.ports}; self.gen = {p: 0 for p in self.ports}; self.clicks = []
        self.root = {p: dict(e=(float(p), 0.0), g=0, d=0.0, A=0.0, t=0.0, cut=False) for p in self.ports}
        self.th_all = self.th
    def total(self): return sum(s['L'] for s in self.seg)
    def inside(self, c): return 0 <= c[0] < self.W and 0 <= c[1] < self.H
    def ray_first(self, p, e, d, limit=None, back=False):
        a = math.radians(d + (180.0 if back else 0.0)); sn, cs = math.sin(a), math.cos(a); q = 0.5
        while True:
            if limit is not None and q > limit + 1e-9: return None
            c = rcell(e[0] + q * sn, e[1] + q * cs)
            if not self.inside(c): return None
            if c in self.haloT[p]: return c
            q += 0.5
    def keep_r4(self, p, e, d):
        return (not self.r4) or rcell(*e) in self.haloT[p] or self.ray_first(p, e, d) is not None
    def comp_of(self, p, e, d):
        c = rcell(*e)
        if c in self.near[p]: return self.near[p][c]
        h = self.ray_first(p, e, d)
        return self.near[p][h] if h is not None else self.serve[p][0]
    def make_ok(self, entered=False):
        st = {'in': entered}
        def ok(c):
            if not self.inside(c): return False
            if self.mask == 'margin': return c in self.halo
            if self.mask == 'grid': return True
            if c in self.halo: st['in'] = True; return True
            return not st['in']
        return ok, st
    def click(self, p, Dm):
        if not (20 - 1e-9 <= Dm <= 100 + 1e-9) or abs(Dm / 5 - round(Dm / 5)) > 1e-9: return 'range'
        if self.gen[p] >= 24: return 'ceiling'
        th = self.th[p]
        if th is None: return 'dead'
        D = Dm / M; sep = max(1.0, 0.9 * D * math.sin(math.radians(th))); cand = []
        for i in self.front[p]:
            pa = self.root[p] if i is None else self.seg[i]
            if pa['cut']: continue
            for sg in ((0,) if i is None else (-1, 1)):       # v3.7.5: the root drills one straight segment at its heading; every segment of generation 1 or more forks
                d = pa['d'] if sg == 0 else 0.5 * pa['d'] + sg * th
                d = max(-60.0, min(60.0, d)); ok, st = self.make_ok()
                L, cells, e, cut = segment(pa['e'][0], pa['e'][1], d, D, ok, pa['A'])
                if L <= 1e-9 or not self.keep_r4(p, e, d): continue
                cand.append(dict(p=p, ci=self.comp_of(p, e, d), g=pa['g'] + 1, L=L, d=d, e=e, cut=cut, A=pa['A'] + L, cells=cells, t=pa['t'] + L / V_BB,
                                 par=i, t0=pa['t'], x0=pa['e'][0], y0=pa['e'][1], A0=pa['A'], ent=st['in']))
        new = []
        for q in (cand[::-1] if self.rev else cand):
            if any(math.hypot(q['e'][0] - z['e'][0], q['e'][1] - z['e'][1]) < sep - 1e-9 for z in new): continue
            new.append(q)
        if not new: return 'dead'
        if self.total() + sum(q['L'] for q in new) > self.cap + 1e-9: return 'cap'
        self.front[p] = list(range(len(self.seg), len(self.seg) + len(new))); self.seg += new; self.gen[p] += 0 if (self.ob_free and not any(q['ent'] for q in new)) else 1; self.clicks.append((p, Dm)); return 'ok'
def balrog_s(n, b, spacings=SPACINGS, snap=True):
    """4d pass 0 (surface): for every portal that serves a component, a hole at the S column of that component nearest the portal (ties lower); one hole per column."""
    holes = []; spent = []
    for i, C in enumerate(n.C):
        deep = {}
        for x, y in C: deep[x] = max(deep.get(x, -1), y + 1)
        ps = sorted(p for p in n.ports if i in n.serve[p]); hs = []; left = b[i]; done = False
        def put(col):
            nonlocal left, done
            need = deep.get(col, 0)
            if need <= left: hs.append((col, need)); left -= need; return True
            if left > 0: hs.append((col, left)); left = 0
            done = True; return False
        for p in ps:
            if done: break
            col = min(sorted(deep), key=lambda c: (abs(c - p), c)) if snap else p
            if any(h[0] == col for h in hs): continue
            put(col)
        order = sorted(deep, key=lambda c: (min(abs(c - p) for p in ps), c))
        for sp in spacings:
            if done: break
            for col in order:
                if any(abs(col - h[0]) < sp for h in hs): continue
                if not put(col): break
        holes.append(hs); spent.append(b[i] - left)
    return holes, spent
def near_margin(c, halo, metric='euclid', R=RANGE):
    for i in range(-R, R + 1):
        for j in range(-R, R + 1):
            ok = (i * i + j * j <= R * R) if metric == 'euclid' else (max(abs(i), abs(j)) <= R if metric == 'cheb' else (abs(i) + abs(j) <= R if metric == 'manh' else i * i + j * j < R * R))
            if ok and (c[0] + i, c[1] + j) in halo: return True
    return False
def sense_left_s(n, seed, W, H, halo, log=None, metric='euclid', R=RANGE, drop=True):
    cored = set(); rows_of = {}; at = {}
    for i, s in enumerate(n.seg):
        rows_of[i] = {y for x, y in s['cells']}
        for x, y in s['cells']: cored.add((x, y)); at.setdefault(y, {}).setdefault(x, set()).add(i)
    groups = {}
    for y, xs in at.items():
        ks = sorted(xs)
        for a, b in zip(ks, ks[1:]):
            if not (MINGAP <= b - a <= RANGE) or (xs[a] & xs[b]): continue
            i, j = min(xs[a]), min(xs[b]); groups.setdefault((min(i, j), max(i, j)), []).append((y, a, b))
    if drop: groups = {k: v for k, v in groups.items() if any(near_margin((a, y), halo, metric, R) or near_margin((b, y), halo, metric, R) for y, a, b in v)}
    keys = sorted(groups, key=lambda k: (max(n.seg[k[0]]['t'], n.seg[k[1]]['t']), k))
    plist = []
    for k in keys:
        rd = max(n.seg[k[0]]['t'], n.seg[k[1]]['t']); com = rows_of[k[0]] & rows_of[k[1]]
        at_rd = {c for s in n.seg if s['t'] <= rd + 1e-9 for c in s['cells']}
        plist.append((rd, window(groups[k], min(com), max(com) - min(com) + 1), at_rd))
    t1 = set(); sch, skp, times = run_pairs(plist, t1); xh = set(t1)
    sp = single_line(cored, t1, seed, W, H, log=log)
    return cored, t1, xh, (sch, skp), sp, queue_end(times, max(s['t'] for s in n.seg))
def play_s(F, S, ports, clicks, cap, W=GW, H=GH, seed=0, adds=(), **kw):
    n = SPlan(S, ports, cap, W, H, **kw); res = [n.click(p, D) for p, D in clicks]
    B, b, rs, rc = budget(n); holes, spent = balrog_s(n, b); holes = [list(h) for h in holes]
    for a in adds: holes[-1].append(tuple(a))
    cL, tL, xL, pL, sL, eL = sense_left_s(n, seed, W, H, n.halo); cR, tR, xR, pR, sR, eR = sense_right(holes, seed, W, H)
    return dict(n=n, res=res, B=B, b=b, reserve=rs, rcap=rc, holes=holes, spent=spent, L=readout(F, cL, tL), R=readout(F, cR, tR), pairs=(pL, pR), sparse=(sL, sR),
                end=(round(eL, 6), round(eR, 6)), cored=(cL, cR), t1=(tL, tR))
def policy_s(n, p, da, na, db):
    res = []; st = 'ok'; i = 0
    while st == 'ok':
        D = da if i < na else db; st = n.click(p, float(D)); res.append([D, st]); i += 1
    if st == 'cap':
        for d2 in range(db, 19, -5):
            while True:
                s2 = n.click(p, float(d2)); res.append([d2, s2])
                if s2 != 'ok': break
    return res
def reaim_s(n, t, idx, target, cap):
    """Surface re-aim (spec 6, 4c): the regrown generations use the stay-mask (fresh at the cut or parent end) and R4, not the 8-cell mask."""
    sg = n.seg
    def prog(q): return 0.0 if q['L'] == 0 else min(1.0, max(0.0, (t - q['t0']) / (q['L'] / V_BB)))
    s = sg[idx]; f = prog(s); dead = {idx}; grow = True
    while grow:
        grow = False
        for i, q in enumerate(sg):
            if i not in dead and q['par'] in dead and prog(q) == 0: dead.add(i); grow = True
    refund = s['L'] * (1 - f) + sum(sg[i]['L'] for i in dead if i != idx)
    a = math.radians(s['d']); cx, cy = s['x0'] + f * s['L'] * math.sin(a), s['y0'] + f * s['L'] * math.cos(a); A = s['A0'] + f * s['L']
    grid = n.inside; Ds = [D / M for p, D in n.clicks if p == s['p']]; th = n.th[s['p']]; p = s['p']
    def build(tx, ty):
        L = math.hypot(tx - cx, ty - cy); d = math.degrees(math.atan2(tx - cx, ty - cy))
        kL, cl, e, _ = segment(cx, cy, d, L, grid, A); tot = kL
        layer = [(e, d, A + kL, False)]
        for g in range(s['g'] + 1, len(Ds) + 1):
            D = Ds[g - 1]; sep = max(1.0, 0.9 * D * math.sin(math.radians(th))); nxt = []
            for e0, d0, A0, cut in layer:
                if cut: continue
                for sgn in (-1, 1):
                    dd = max(-60.0, min(60.0, 0.5 * d0 + sgn * th)); ok, st = n.make_ok()
                    L2, c2cells, e2, c2 = segment(e0[0], e0[1], dd, D, ok, A0)
                    if L2 <= 1e-9 or not n.keep_r4(p, e2, dd) or any(math.hypot(e2[0] - z[0][0], e2[1] - z[0][1]) < sep - 1e-9 for z in nxt): continue
                    nxt.append((e2, dd, A0 + L2, c2)); tot += L2
            layer = nxt
        return tot - refund
    want = build(*target)
    for k in range(51):
        fr = 1 - 0.02 * k; tx, ty = cx + (target[0] - cx) * fr, cy + (target[1] - cy) * fr; c = build(tx, ty)
        if c <= cap + 1e-9: return dict(cost=c, want=want, clamped=fr < 1, f=f)
    return None

def v39_branching(SIM):
    t0 = time.time()
    print("== v3.7.2 surface branching (spec 4c), independent")
    gp = os.environ.get('S45_GOLDENS', os.path.join(HERE, "..", "game45", "test", "goldens_v41.json"))
    J = json.load(open(gp)); cellset = lambda L: {tuple(c) for c in L}
    # ---- hand worlds: SW-A etc., values typed from the plan / spec ----
    def rect(c0, c1, r0, r1): return {(x, y) for x in range(c0, c1 + 1) for y in range(r0, r1 + 1)}
    SWA, SWD, SWD5 = rect(90, 109, 20, 39), rect(100, 103, 6, 29), rect(100, 104, 6, 29); TH = 15.0
    nA = SPlan(SWA, [100], CAP); st1 = nA.click(100, 20.0)
    nA2 = SPlan(SWA, [100], CAP); nA2.click(100, 20.0); st2 = nA2.click(100, 20.0)
    z = (st1 == 'ok' and len(nA.seg) == 1 and abs(nA.th[100] - TH) < 1e-9 and [round(s['d'], 3) for s in nA.seg] == [0.0] and abs(nA.seg[0]['L'] - 4.0) < 1e-12 and abs(nA.seg[0]['t'] - 8.0) < 1e-12
         and [rcell(*s['e']) for s in nA.seg] == [(100, 4)] and nA.seg[0]['par'] is None and nA.seg[0]['g'] == 1 and abs(nA.total() * M - 20.0) < 1e-12
         and st2 == 'ok' and len(nA2.seg) == 3 and [round(s['d'], 3) for s in nA2.seg] == [0.0, -15.0, 15.0] and [s['par'] for s in nA2.seg] == [None, 0, 0] and [s['g'] for s in nA2.seg] == [1, 2, 2]
         and [rcell(*s['e']) for s in nA2.seg] == [(100, 4), (99, 8), (101, 8)] and all(abs(s['L'] - 4.0) < 1e-12 for s in nA2.seg) and [round(s['t'], 9) for s in nA2.seg] == [8.0, 16.0, 16.0]
         and abs(nA2.total() * M - 60.0) < 1e-12)
    bad = len(SPlan(SWA, [100], CAP, mask='margin').seg) == 0 and SPlan(SWA, [100], CAP, mask='margin').click(100, 20.0) == 'dead'
    check("W1 surface root: click 1 is ONE straight segment from (100, 0), length 4.0, t 8.0, meter 20.0 m; click 2 forks its tip at -/+ 15 (t 16.0, meter 60.0 m); the legacy margin-only mask is dead on click 1", z, bad)
    ok, _ = SPlan(SWD, [100], CAP).make_ok(); l13 = segment(100.0, 0.0, 20.0, 20.0, ok, 0.0); ok5, _ = SPlan(SWD5, [100], CAP).make_ok(); l16 = segment(100.0, 0.0, 20.0, 20.0, ok5, 0.0)
    okg, _ = SPlan(SWD, [100], CAP, mask='grid').make_ok(); lg = segment(100.0, 0.0, 20.0, 20.0, okg, 0.0)
    nD = SPlan(SWD, [100], CAP); nD.click(100, 20.0); nD.click(100, 100.0)
    l15 = segment(100.0, 0.0, 15.0, 20.0, SPlan(SWD, [100], CAP).make_ok()[0], 0.0); l15w = segment(100.0, 0.0, 15.0, 20.0, SPlan(SWD5, [100], CAP).make_ok()[0], 0.0)
    check("W2 stay-mask: SW-D 20 deg segment 13.0 truncated at cell (104, 12) from the surface, SW-D5 16.0; at 15 deg SW-D 17.0 truncated at (104, 16), SW-D5 20.0 whole at (105, 19); the click-2 pair is [-15, +15] after the straight root, the +15 child 17.0 long ending in cell (104, 20)", l13[0] == 13.0 and l13[3] and rcell(*l13[2]) == (104, 12) and l16[0] == 16.0 and l15[0] == 17.0 and l15[3] and rcell(*l15[2]) == (104, 16) and l15w[0] == 20.0 and not l15w[3] and rcell(*l15w[2]) == (105, 19) and [s['d'] for s in nD.seg] == [0.0, -15.0, 15.0] and rcell(*nD.seg[2]['e']) == (104, 20) and abs(nD.seg[2]['L'] - 17.0) < 1e-12,
          lg[0] == 20.0, "mask never ends the segment: 20.0")
    SW49 = rect(96, 103, 20, 39); n49 = SPlan(SW49, [100], CAP)
    for _ in range(3): n49.click(100, 20.0)
    g2 = sorted(round(s['d'], 3) for s in n49.seg if s['g'] == 3)
    eo = (102.566, 11.5592)
    nA.click(100, 20.0); nA.click(100, 20.0)
    thr = [h for h in (x / 10 for x in range(0, 300)) if not n49.keep_r4(100, eo, h)][0]
    z = (g2 == [-7.5, 7.5] and not n49.keep_r4(100, eo, 22.5) and not n49.keep_r4(100, eo, 21.5) and not n49.keep_r4(100, eo, 15.0) and n49.keep_r4(100, eo, 14.5) and n49.keep_r4(100, eo, 7.5) and not nA.keep_r4(100, (111.0, 3.0), 0.0)
         and nA.keep_r4(100, (110.0, 3.0), 0.0) and 14.5 < thr <= 15.0)
    nO = SPlan(SW49, [100], CAP, r4=False); nO.click(100, 20.0); nO.click(100, 20.0); nO.click(100, 20.0)
    check("W3 R4 on an 8 wide body: after the straight root the click-3 children keep -7.5 and +7.5 and prune the outward +-22.5 (threshold heading 14.5 to 15.0 deg), tolerance 0; ray at column 111 pruned, 110 kept", z, len([s for s in nO.seg if s['g'] == 3]) == 4
          and nA.ray_first(100, (101.7895, 3.5777), 0.0, limit=4.0) is None and nA.ray_first(100, (101.7895, 3.5777), 0.0, back=True) is None, f"outward threshold {thr}")
    n8 = SPlan(SWA, [100], 4); n7 = SPlan(SWA, [100], 3)
    SWC = rect(75, 124, 20, 99); nC = SPlan(SWC, [100], 10 ** 9); rc_ = [nC.click(100, 20.0) for _ in range(25)]
    ob = [any(s['ent'] for s in nC.seg if s['g'] == g) for g in range(1, 6)]
    check("W4 cap counts overburden (cap 4 ok, cap 3 cap); ceiling world SW-C: 24 ok then ceiling, clicks 1 to 4 all overburden", n8.click(100, 20.0) == 'ok' and n7.click(100, 20.0) == 'cap' and rc_[:24] == ['ok'] * 24 and rc_[24] == 'ceiling' and ob == [False, False, False, False, True],
          (lambda nf: [nf.click(100, 20.0) for _ in range(25)][24])(SPlan(SWC, [100], 10 ** 9, ob_free=True)) != 'ceiling', "a ceiling that skipped overburden clicks would answer ok at 25")
    # attribution and target sets
    S2k = rect(70, 89, 20, 39) | rect(110, 139, 20, 39) | rect(99, 101, 38, 39)
    nq = SPlan(S2k, [100], CAP); nq.click(100, 20.0); nq.click(100, 20.0)
    lens = lambda n: [round(sum(s['L'] for s in n.seg if s['ci'] == k), 9) for k in range(len(n.C))]
    S2t = rect(20, 39, 20, 39) | rect(60, 79, 20, 39); sv = lambda S_, ps, **kw: SPlan(S_, ps, CAP, **kw).serve
    check("W5 attribution to the component the ray meets (S2k: sliver under the portal, larger right body, smaller left body: segments [2, 1, 0], lengths [4, 4, 4], sum = total); target sets: tie shares, one nearer portal serves alone",
          [s['ci'] for s in nq.seg] == [2, 1, 0] and lens(nq) == [4.0, 4.0, 4.0] and abs(sum(lens(nq)) - nq.total()) < 1e-9 and sv(rect(90, 109, 20, 39), [100, 104]) == {100: [0], 104: [0]}
          and sv(S2t, [10, 49]) == {10: [0], 49: [0, 1]} and sv(S2t, [10, 50]) == {10: [0], 50: [1]},
          sv(rect(90, 109, 20, 39), [100, 104], ties='lower') == {100: [0], 104: []})
    # pair reach table (Euclidean, centre to centre)
    dot = {(x + i, y + j) for x, y in [(50, 50)] for i in (-1, 0, 1) for j in (-1, 0, 1)}
    offs = [(0, 10), (6, 8), (7, 7), (1, 10), (0, 11), (8, 8), (10, 10)]; tb = lambda metric, R=RANGE: [near_margin((51 + a, 51 + b), dot, metric, R) for a, b in offs]
    check("W6 pair reach: (0,10) (6,8) (7,7) kept; (1,10) (0,11) (8,8) (10,10) dropped; chebyshev, manhattan, strict and range 11 each change the table",
          tb('euclid') == [True, True, True, False, False, False, False], all(tb(m) != tb('euclid') for m in ('cheb', 'manh', 'strict')) and tb('euclid', 11) != tb('euclid'))
    nP = SPlan(SWA, [100], CAP); nP.click(100, 20.0); nP.click(100, 20.0)
    drop_c = sense_left_s(nP, 0, GW, GH, nP.halo)[3]; keep_c = sense_left_s(nP, 0, GW, GH, nP.halo, drop=False)[3]
    check("W7 SW-A click 2: 0 pairs in surface mode, 1 pair when every pair is kept (legacy rule)", drop_c == (0, 0) and keep_c[0] + keep_c[1] >= 1, keep_c != drop_c)
    # pass 0 at a free column
    CsA = comps8(SWA); p0 = lambda col: balrog_s(type('N', (), dict(C=CsA, ports=[col], serve={col: [0]}))(), [8])[0][0][0]
    check("W8 pass 0 at a free portal column: column 50 and 89 give hole 90, 91 gives 91, 100 gives 100", [p0(c)[0] for c in (50, 89, 91, 100)] == [90, 90, 91, 100] and p0(89) == (90, 8),
          balrog_s(type('N', (), dict(C=CsA, ports=[50], serve={50: [0]}))(), [8], snap=False)[0][0][0][0] == 50)

    # ---- compare with goldens_v41 (S keys) ----
    def cmp_rec(rec, own, tag):
        n = own['n']; bad = []
        if rec['results'] != own['res']: bad.append('results')
        for k_, v in (('budget', own['B']), ('b', own['b']), ('reserve', own['reserve']), ('reaim_cap', own['rcap'])):
            if rec[k_] != v: bad.append(k_)
        hs = [[tuple(h) for h in hh] for hh in rec['holes']]
        if hs != [[tuple(h) for h in hh] for hh in own['holes']]: bad.append('holes')
        if rec['theta'] != {str(p): n.th[p] for p in n.ports}: bad.append('theta')
        if rec['target_sets'] != {str(p): n.serve[p] for p in n.ports}: bad.append('target_sets')
        if abs(rec['length_cells'] - round(n.total(), 6)) > 1e-9: bad.append('length')
        if len(rec['segs']) != len(n.seg): bad.append('nsegs'); return bad
        for a, s in zip(rec['segs'], n.seg):
            if (a['gen'], a['comp'], a['parent'], a['trunc'], a['ent']) != (s['g'], s['ci'], s['par'], s['cut'], s['ent']) or [tuple(c) for c in a['cells']] != s['cells'] \
               or abs(a['len'] - s['L']) > 1e-9 or abs(a['dir'] - s['d']) > 1e-9 or abs(a['t'] - s['t']) > 1e-9 or abs(a['A1'] - s['A']) > 1e-9 or abs(a['A0'] - s['A0']) > 1e-9 \
               or abs(a['end'][0] - s['e'][0]) > 1e-9 or abs(a['end'][1] - s['e'][1]) > 1e-9: bad.append('seg%d' % a['id']); break
        for side, i in (('left', 0), ('right', 1)):
            if rec[side]['score'] != list(own['L'][0] if i == 0 else own['R'][0]) or rec[side]['pairs'] != list(own['pairs'][i]) or abs(rec[side]['end_s'] - own['end'][i]) > 1e-6: bad.append(side)
            if cellset(rec[side]['cored']) != own['cored'][i] or cellset(rec[side]['revealed']) != own['t1'][i]: bad.append(side + '_cells')
        return bad
    mism = {}
    for nm_, rec in J['S_P'].items():
        F = cellset(rec['F']); S = cellset(rec['S']); n = SPlan(S, rec['portals'], rec['cap'], rec['W'], rec['H'])
        att = {p: policy_s(n, p, *rec['policy']) for p in n.ports}; assert rec['portals'] == [list(att)[0]]
        if att[rec['portals'][0]] != rec['attempts']: mism[nm_ + ':attempts'] = True; continue
        o = play_s(F, S, rec['portals'], [tuple(c) for c in rec['clicks']], rec['cap'], rec['W'], rec['H'], rec['seed'])
        b_ = cmp_rec(rec, o, nm_)
        if b_: mism[nm_] = b_
    check("G1 nine policy worlds (GV2, GV3, GV4, L1 to L6): attempts, results, budget, holes, every segment (cells, dir, len, t, comp), cored and revealed cells, scores, pairs, finish times equal goldens_v41 S_P",
          not mism and len(J['S_P']) == 9,
          any(len(SPlan(cellset(r['S']), r['portals'], r['cap'], theta_rows='surface').seg) >= 0 and policy_s(SPlan(cellset(r['S']), r['portals'], r['cap'], theta_rows='surface'), r['portals'][0], *r['policy']) != r['attempts']
              for r in J['S_P'].values()), f"mismatch {mism}; mutant: theta from row 0 changes the policy run on at least one world")
    mut_rev = 0
    for nm_, rec in J['S_P'].items():
        S = cellset(rec['S']); a = SPlan(S, rec['portals'], rec['cap']); b2 = SPlan(S, rec['portals'], rec['cap'], rev=True)
        policy_s(a, rec['portals'][0], *rec['policy']); policy_s(b2, rec['portals'][0], *rec['policy'])
        mut_rev += [(s['g'], s['d'], tuple(s['cells'])) for s in a.seg] != [(s['g'], s['d'], tuple(s['cells'])) for s in b2.seg]
    check("G2 tip-spacing order: the reversed prune order changes the network on %d of 9 worlds (G56 mutant unordered_prune)" % mut_rev, mut_rev >= 1, mut_rev >= 1)
    mism = {}
    for nm_ in ('S_GV1', 'S_GV1b', 'S_GV2', 'S_GV3', 'S_GV3b', 'S_GV4'):
        rec = J[nm_]; F = cellset(rec['F']); S = cellset(rec['S'])
        o = play_s(F, S, rec['portals'], [tuple(c) for c in rec['clicks']], rec['cap'], rec['W'], rec['H'], rec['seed'], adds=[tuple(a) for a in rec['adds']])
        b_ = cmp_rec(rec, o, nm_)
        if b_: mism[nm_] = b_
    gv4 = J['S_GV4']; o = play_s(cellset(gv4['F']), cellset(gv4['S']), gv4['portals'], [tuple(c) for c in gv4['clicks']], gv4['cap'], 200, 100, gv4['seed'])
    check("G3 spec click lists in surface mode (GV1, GV1b, GV2, GV3, GV3b, GV4 with two free portals) equal goldens_v41 S_GV*", not mism, play_s(cellset(gv4['F']), cellset(gv4['S']), gv4['portals'], [tuple(c) for c in gv4['clicks']], gv4['cap'], 200, 100, gv4['seed'] + 1)['sparse'] != o['sparse'], f"mismatch {mism}; mutant: seed + 1")
    # ---- hand vectors in S_E ----
    E = J['S_E']; sw = lambda s: [round(x, 9) for x in (s['dir'], s['len'], s['t'])]
    nA1 = SPlan(SWA, [100], CAP); nA1.click(100, 20.0)
    z = [sw(dict(dir=s['d'], len=s['L'], t=s['t'])) for s in nA1.seg] == [sw(s) for s in E['swa_click1']['segs']] and E['swa_click1']['results'] == ['ok'] and len(E['swa_click1']['segs']) == 1 \
        and len(E['swa_click2']['segs']) == 3 and len(E['swa_bad']['root_forks']['segs']) == 2
    ok_, _ = SPlan(SWD, [100], CAP).make_ok(); sd = segment(100.0, 0.0, 15.0, 20.0, ok_, 0.0)
    z = z and E['stay_mask']['swd'][0] == sd[0] == 17.0 and E['stay_mask']['swd5'][0] == 20.0 and E['stay_mask']['mask_never_swd'][0] == 20.0 and E['stay_mask']['mask_always_swd'][0] == 0.0
    z = z and E['cap']['cap4'] == ['ok'] and E['cap']['cap3'] == ['cap'] and E['cap']['cap3_skip_ob'] == ['ok'] and E['ceiling_world']['results'] == rc_ and E['ceiling_world']['ob_gen_free'][24] != 'ceiling'
    z = z and E['swa_bad']['ray_back']['results'] == ['dead'] and E['swa_bad']['ray_short']['results'] == ['dead'] and E['swa_bad']['trunk_resurrect']['results'] == ['ok'] and len(E['swa_bad']['trunk_resurrect']['segs']) == 3
    rays = all((n49 if w_ == 'sw49' else nA).keep_r4(100, tuple(e), h) == r for e, h, D, r, w_ in E['ray_cases']) and E['ray49_gen3'] == g2
    att = E['attribution']; z = z and att['S2k']['comp'] == [2, 1, 0] and att['comp_first']['comp'] == [0, 0, 0] and att['S2k']['comp_lengths'] == [4.0, 4.0, 4.0] and att['comp_first']['comp_lengths'] == [12.0, 0.0, 0.0]
    rt = E['reach_table']; z = z and [r for o_, r in rt['zero']] == tb('euclid') and [r for o_, r in rt['pair_range_11']] == tb('euclid', 11) and [r for o_, r in rt['range_cheb']] == tb('cheb') \
        and [r for o_, r in rt['range_manh']] == tb('manh') and [r for o_, r in rt['range_lt']] == tb('strict')
    p0t = E['pass0']['first_hole']; z = z and {k: v[0] for k, v in p0t.items()} == {'50': 90, '89': 90, '91': 91, '100': 100} and E['pass0']['no_snap']['50'][0] == 50
    ts = E['target_sets']; z = z and ts['same_body_100_104'] == {'100': [0], '104': [0]} and ts['two_bodies_10_49'] == {'10': [0], '49': [0, 1]} and ts['two_bodies_10_50'] == {'10': [0], '50': [1]}
    check("G4 hand vectors S_E (SW-A, SW-D, ray cases, cap, ceiling world, attribution, reach table, pass 0, target sets) and their named mutants equal the independent values", z and rays and E['stay_mask']['swd_click']['results'] == ['ok', 'ok'],
          E['ceiling_world']['results'][24] == 'ceiling' and E['ceiling_world']['ob_gen_free'][24] != 'ceiling' and E['cap']['cap3_skip_ob'] != E['cap']['cap3'])
    # ---- cover cap (spec 8a) from the golden level F (E8) and the GV paintings ----
    def dil2(F): return {(x + i, y + j) for x, y in F for i in range(-2, 3) for j in range(-2, 3) if 0 <= x + i < GW and 0 <= y + j < GH}
    def keep50(S_): return {c for C in comps8(S_) if len(C) >= 50 for c in C}
    def cover(S_):
        cols = sorted({x for x, y in S_}); c = math.floor((cols[0] + cols[-1]) / 2.0 + 0.5)
        if c not in cols: c = min(cols, key=lambda x: (abs(x - c), x))
        return c, 5.0 * min(y for x, y in S_ if x == c)
    mine = {}
    for i in range(1, 7): mine['L%d' % i] = cover(keep50(dil2(cellset(J['E8']['levels'][str(i)]['F']))))
    for k in ('GV2', 'GV3', 'GV4'): mine[k] = cover(cellset(J[k]['S']))
    got = {k: (v['col'], v['cover_m']) for k, v in J['S_cover'].items()}
    L3 = keep50(dil2(cellset(J['E8']['levels']['3']['F']))); l3 = (5.0 * min(y for x, y in L3 if x == 120), 5.0 * min(y for x, y in L3 if x == 121))
    okf = lambda k, m_: (m_ <= 150.0 + 1e-9) or not k.startswith('L')
    check("G5 cover cap: c_d and cover per world equal goldens_v41 S_cover (L1 110, L2 80, L3 155 at 121 / 150 at 120, L4 285 at 93, L5 170, L6 330, GV2 50, GV3 50, GV4 185); verdicts L3 to L6 rejected",
          mine == got and l3 == (150.0, 155.0) and {k: v['ok'] for k, v in J['S_cover'].items()} == {k: okf(k, mine[k][1]) for k in mine} and not okf('L3', 155.0),
          cover(keep50(dil2(cellset(J['E8']['levels']['3']['F']))))[0] == 121 != 120)
    # ---- mid-run scenario ----
    M_ = J['S_MID']; rec = J['S_P']['GV4']; F = cellset(rec['F']); S = cellset(rec['S']); n = SPlan(S, rec['portals'], rec['cap'])
    for p, D in rec['clicks']: n.click(p, D)
    B, b, rs, rc = budget(n); rcase = M_['reaim_case']
    okc = refc = None
    for t in range(40, 400, 10):
        i = pick(n, float(t))
        if i is None: continue
        q = reaim_s(n, float(t), i, (20.0, 20.0), rc)
        if q is not None and q['clamped'] and okc is None: okc = [t, i, round(q['cost'], 3), round(q['want'], 3)]
        if refc is None and reaim_s(n, float(t), i, tuple(rcase['refusal_target']), rc) is None: refc = [t, i]
    r150 = reaim_s(n, 100.0, pick(n, 100.0), (20.0, 20.0), rc)
    depth80 = min((max(y for x, y in S if x == 80) + 1 + round(25 / M)), rs)
    check("G6 mid-run, surface GV4 world (policy 50 m x 3, then 75 m): first clamped re-aim 70 s seg 7 cost 19.207 (wanted 54.293), first refusal toward (175, 40) at 70 s seg 7, re-aim at 100 s, add hole column 80 depth 20, reserves 53 / 33 / 33, cap 21",
          okc == rcase['first_clamped'] and refc == rcase['first_refusal'] and rcase['refusal_target'] == [175.0, 40.0] and okc == [70, 7, 19.207, 54.293] and refc == [70, 7] and abs(r150['cost'] - M_['reaim']['cost']) < 1e-6 and M_['reaim']['t'] == 100.0
          and M_['add']['req_depth'] == 20 and M_['add']['depth'] == min(20, depth80, rs) == 20 and M_['reserves']['right'] == rs - 20 and abs(M_['reserves']['left'] - (rs - r150['cost'])) < 1e-6 and (rs, rc) == (53, 21),
          reaim_s(n, 70.0, pick(n, 70.0), tuple(rcase['refusal_target']), 10 ** 9) is not None, "mutant: infinite cap accepts the refused re-aim")
    print(f"   v3.7.2 block time {time.time() - t0:.1f} s")


# =====================================================================================================
if __name__ == "__main__":
    P6 = [100.0, 75, 50, 50, 35, 25]; P24 = [100.0, 75, 50, 50, 40, 40, 30, 30, 25, 25] + [20.0] * 14; MC = [75.0, 50, 35, 25]
    pL1 = default_portal(comps8(L1S)[0]); pP = default_portal(comps8(PS)[0]); pM = [default_portal(C) for C in comps8(MS)]
    print("worlds: L1 |F|", len(L1F), "|S|", len(L1S), "portal", pL1, "; pipe |F|", len(PF), "portal", pP, "; main |F|", len(MF),
          "S comps", [len(C) for C in comps8(MS)], "portals", pM, "trunks", [trunk(MS, p) for p in pM])
    G = {}
    G['GV1'] = play(L1F, L1S, [pL1], [(pL1, 25.0), (pL1, 20.0)], 75, 25, 25, seed=7919)
    G['GV1b'] = play(L1F, L1S, [pL1], [(pL1, 25.0), (pL1, 20.0)], 75, 25, 25, seed=7919, adds=[(18, min(50, G['GV1']['reserve']), 5.0)])
    G['GV2'] = play(PF, PS, [pP], [(pP, D) for D in P6], CAP, seed=15838)
    G['GV3'] = play(PF, PS, [pP], [(pP, D) for D in P24], CAP, seed=15838)
    G['GV3b'] = play(PF, PS, [pP], [(pP, D) for D in P24], 2 * CAP, seed=15838)
    G['GV4'] = play(MF, MS, pM, [(p, D) for D in MC for p in pM], CAP, seed=31678)
    for k, r in G.items():
        n = r['n']
        print(f"== {k}: {r['res'].count('ok')} ok {[x for x in set(r['res']) if x != 'ok']}; segs {len(n.seg)}; len {n.total():.1f}; B {r['B']} b {r['b']} "
              f"reserve {r['reserve']} rcap {r['rcap']}; holes {r['holes']} spent {r['spent']}\n   L {r['L']}  R {r['R']}  pairs {r['pairs']} "
              f"sparse {r['sparse']} end {r['end']} cored {len(r['cored'][0])}/{len(r['cored'][1])} deepest L row {max(y for x, y in r['cored'][0])}")
    g2 = G['GV2']['n']
    for g in range(1, 7):
        print(f"   GV2 gen {g}: dirs {[round(s['d'], 2) for s in g2.seg if s['g'] == g]} lens {[s['L'] for s in g2.seg if s['g'] == g]}")
    cR, tR = G['GV2']['cored'][1], G['GV2']['t1'][1]
    print("   GV2 right revealed F by column:", {c: len([1 for (x, y) in PF if x == c and (x, y) in tR and (x, y) not in cR]) for c in range(95, 107)})
    g1 = G['GV1']['n']; print("   GV1 ends:", [tuple(round(v, 3) for v in s['e']) for s in g1.seg if s['g'] > 0], "theta", round(g1.th[pL1], 2),
                              "; main theta", [round(G['GV4']['n'].th[p], 2) for p in pM])

    # ---------------- compare with the sim's printed goldens ----------------
    sys.path.insert(0, HERE); import step45_reference_sim_v3 as SIM
    SIM.set_mode(SIM.MODE_TRUNK)       # the v3.6 and v3.7 blocks compare the trunk-mode anchor; the surface block reads goldens_v41.json
    simgold = SIM.GOLD; mism = []
    def cmp(k, field, mine):
        if field in ('endL', 'endR'): mine = round(mine, 3)
        if field in simgold[k] and simgold[k][field] != mine: mism.append((k, field, mine, simgold[k][field]))
    for k in ('GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4'):
        r = G[k]
        for field, v in dict(results=r['res'], segs=len(r['n'].seg), length=round(r['n'].total(), 3), budget=r['B'], b=r['b'], reserve=r['reserve'],
                             reaim_cap=r['rcap'], holes=r['holes'], spent=r['spent'], L=r['L'][0], R=r['R'][0], pairsL=r['pairs'][0],
                             pairsR=r['pairs'][1], sparse=r['sparse'], endL=r['end'][0], endR=r['end'][1]).items():
            cmp(k, field, v)
    print("golden mismatches own vs sim GOLD:", mism or "none")
    check("P0 parity own end-to-end = sim GOLD (GV1, GV1b, GV2, GV3, GV3b, GV4)", not mism,
          play(PF, PS, [pP], [(pP, D) for D in P6], CAP, seed=15838 + 1)['sparse'] != tuple(simgold['GV2']['sparse']), "mutant: seed + 1")
    # cross-check sim's main_world resample against mine (shared-helper test for the Toymaker port)
    sF, sS = SIM.main_world(); print("   main world resample equal to sim:", sF == MF and sS == MS)

    # ---------------- 2. rules with mutants ----------------
    # coring: vertical rate per dBranch, angle table, carried phase after a re-aim fraction
    def chain(Ds, deg, phase, n=20):
        tot = N = 0; a = math.radians(deg)
        for i in range(n):
            for j in range(n):
                x0, y0 = 60 + (i + 0.5) / n, 3 + (j + 0.5) / n; A = 0.0; cs = set()
                for L in Ds:
                    _, c, _, _ = segment(x0 + A * math.sin(a), y0 + A * math.cos(a), deg, L, lambda c: True, A, phase); cs |= set(c); A += L
                tot += len(cs); N += A
        return tot / N
    vert = {D: chain([D] * 10, 0, "carry", 10) for D in range(4, 21)}
    angs = {d: round(chain([4] * 25, d, "carry"), 3) for d in (0, 15, 30, 45, 60)}
    angs20 = {d: round(chain([20] * 5, d, "carry"), 3) for d in (30, 45)}
    reaimchain = [2.5] + [4] * 10
    rc, rr = chain(reaimchain, 0, "carry", 10), chain(reaimchain, 0, "restart", 10)
    print(f"   coring vertical by D: {sorted(set(round(v, 6) for v in vert.values()))}; by angle (D 4): {angs}; (D 20): {angs20}; "
          f"after 2.5-cell re-aim: carry {rc:.4f} restart {rr:.4f}")
    # mutant on a real network: GV4 with the restart rule gives identical cells (integer D), so the mutant is run on a re-aim-shifted chain
    check("C1 coring along the path: 1.000 vertical at every D; 0.934 at 30, 0.915 at 45 deg", all(abs(v - 1) < 1e-9 for v in vert.values())
          and abs(angs[30] - 0.934) <= 0.002 and abs(angs[45] - 0.915) <= 0.002 and abs(rc - 1) < 0.02, abs(rr - 1) > 0.05 or rr != rc, f"restart mutant {rr:.4f}")
    # phase on actual coring points
    def phase_err(phase):
        A = 0.0; bad = 0
        for L in reaimchain:
            sn = 0.0; _, cells, _, _ = segment(70.0, 2.0 + A, 0.0, L, lambda c: True, A, phase)
            for k, c in enumerate(cells): pass
            base = A if phase == "carry" else 0.0; first = math.floor(base + 0.5 + 1e-9) + 0.5
            bad += sum(1 for k in range(len(cells)) if abs(((A + first - base + k) % 1) - 0.5) > 1e-9); A += L
        return bad
    check("C2 coring points at arclength k + 0.5 after a fractional parent", phase_err("carry") == 0, phase_err("restart") > 0)
    # half-up tie golden
    n4 = G['GV4']['n']
    check("C3 half-up budget, GV4 298.5 -> 299", n4.total() == 298.5 and budget(n4)[0] == 299, budget(n4, he)[0] == 298, f"half-even {budget(n4, he)[0]}")
    # generation-1 clamp
    Sf = box(125, 875, 200, 300)
    a = Plan(Sf, [100], 10 ** 9); a.click(100, 50.0); b_ = Plan(Sf, [100], 10 ** 9, clamp1=False); b_.click(100, 50.0)
    da = sorted(s['d'] for s in a.seg if s['g'] == 1); db = sorted(s['d'] for s in b_.seg if s['g'] == 1)
    check("C4 generation-1 clamp (theta 70 on a 750 x 100 m flat SROI)", a.th[100] == 70.0 and da == [-60.0, 60.0], db == [-70.0, 70.0], f"mutant {db}")
    # portal move / remove / add refusal
    cl = [(pP, D) for D in P6]
    st, newp, kept = move_portal(PS, [pP], cl, pP, 99, CAP)
    fresh = Plan(PS, newp, CAP)
    for p, D in kept: fresh.click(p, D)
    st_m, newp_m, kept_m = move_portal(PS, [pP], cl, pP, 99, CAP, replay=False)
    stale_ok = all(p in newp_m for p, D in kept_m)
    check("C5a portal move replays clicks at the new column", st == 'ok' and newp == [99] and len(kept) == 6 and fresh.total() > 0
          and all(s['p'] == 99 for s in fresh.seg), not stale_ok, f"moved net {len(fresh.seg)} segs, {fresh.total()} cells")
    two = [pP, 97]; cl2 = [(pP, 100.0), (97, 100.0), (pP, 75.0), (97, 75.0)]
    rest, kp = remove_portal(PS, two, cl2, 97, CAP)
    after = Plan(PS, rest, CAP)
    for p, D in kp: after.click(p, D)
    stale, _ = rebuild(PS, two, cl2, CAP)                      # mutant: no replay after the removal
    gone = lambda n: all(s_['p'] != 97 for s_ in n.seg)
    check("C5b portal remove drops that portal's clicks and replays", rest == [pP] and kp == [(pP, 100.0), (pP, 75.0)] and gone(after),
          not gone(stale), "stale-network mutant keeps portal 97 segments")
    # sep refusal, max, trunk-over-cap refusal, replay drop rule
    Sx = box(50, 155, 300, 500) | box(300, 405, 25, 155)    # deep comp (trunk 60) + shallow comp (trunk 5)
    stA, pa = add_portal(Sx, [70], [(70, 100.0)] * 3, 20, 50)
    try: Plan(Sx, [20, 70], 50); crash = False
    except ValueError: crash = True
    stB, pb = add_portal(Sx, [70], [(70, 100.0)] * 3, 20, 50, guard=False)
    check("C5c add portal: trunk over cap refused, nothing changes", stA == 'trunk' and pa == [70] and trunk(Sx, 70) == 5, stB == 'ok' and crash,
          "unguarded add accepts, then the network constructor fails")
    nR, keptR = rebuild(PS, [pP], [(pP, 100.0), (pP, 100.0), (pP, 100.0), (pP, 20.0), (pP, 20.0)], 70)
    nm = Plan(PS, [pP], 70); km = [(p, D) for p, D in [(pP, 100.0), (pP, 100.0), (pP, 100.0), (pP, 20.0), (pP, 20.0)] if nm.click(p, D) == 'ok']
    check("C5d replay drops a refused click and every later click of that portal", keptR == [(pP, 100.0)] and len(nR.clicks) == 1,
          len(km) > 1, f"kept {keptR}; no-drop mutant keeps {km}")
    # shared draw
    def eq_r(side_mut):
        lgL, lgR = {}, {}
        single_line(G['GV2']['cored'][0], set(), 15838, GW, GH, side=(0 if side_mut else None), log=lgL)
        single_line(G['GV2']['cored'][1], set(), 15838, GW, GH, side=(1 if side_mut else None), log=lgR)
        def dist(cored):
            o = {}
            for x, y in cored:
                for i in range(-RANGE, RANGE + 1):
                    for j in range(-RANGE, RANGE + 1):
                        r = math.hypot(i, j); c = (x + i, y + j)
                        if 0 < r <= RANGE and c not in cored and 0 <= c[0] < GW and 0 <= c[1] < GH and r < o.get(c, 99): o[c] = r
            return o
        dL, dR = dist(G['GV2']['cored'][0]), dist(G['GV2']['cored'][1])
        com = [c for c in dL if c in dR and abs(dL[c] - dR[c]) < 1e-9]
        return all((c in lgL) == (c in lgR) for c in com), len(com)
    z, ncom = eq_r(False); bmut, _ = eq_r(True)
    vec = [round(u32(*v), 6) for v in [(7919, 5, 4), (7919, 4, 6), (7919, 6, 4), (15838, 40, 20)]]
    check("C6 shared seed draw (equal-r cells agree across sides) + hash vectors", z and vec == [0.062413, 0.136708, 0.081696, 0.83714], not bmut, f"{ncom} equal-r cells")
    # budget equality
    eq = []; bad = []
    for k in ('GV1', 'GV2', 'GV3', 'GV3b', 'GV4'):
        r = G[k]; eq.append(sum(r['spent']) == r['B'] == sum(r['b']) and abs(r['n'].total() - r['B']) <= 0.5)
        _, sp_bad = balrog(r['n'], r['b'], spacings=SPACINGS[:2]); bad.append(sum(sp_bad) != r['B'])
    check("C7 budget equality left = right within 0.5 cell, all goldens", all(eq), any(bad), f"mutant (no densify below 25 m) misses on {sum(bad)} of 5")

    # ---------------- 3. changed goldens ----------------
    rm = G['GV4']; ok_t = ref_t = None; okv = None
    for t in range(40, 400, 10):
        i = pick(rm['n'], float(t))
        if i is None: continue
        v = reaim(rm['n'], float(t), i, (20.0, 20.0), rm['rcap'])
        if v is None and ref_t is None: ref_t = t
        if v is not None and v['clamped'] and ok_t is None: ok_t, okv, oki = t, v, i
    print(f"   re-aim: success t {ok_t} seg {oki} cost {okv['cost']:.3f} ({okv['cost'] * M:.1f} m) wanted {okv['want']:.3f} ({okv['want'] * M:.1f} m) "
          f"cap {rm['rcap']} ({rm['rcap'] * M:.0f} m); refused t {ref_t}")
    check("C8 re-aim golden (90 s, seg 6, 146.9 m vs cap 150 m, wanted 281.8 m, refused 60 s)",
          (ok_t, oki, round(okv['cost'], 3), round(okv['want'], 3), ref_t) == (90, 6, 29.389, 56.352, 60),
          reaim(rm['n'], 60.0, pick(rm['n'], 60.0), (20.0, 20.0), 10 ** 9) is not None, "mutant: uncapped re-aim accepts at 60 s")
    # spec v3.4 text (sections 9a to 9d, 13, 15); my code above is the derivation these are compared against
    want = {'GV1': (('17.5', '30.0', '47.5'), ('15.0', '28.8', '43.8')), 'GV2': (('13.4', '36.3', '49.7'), ('16.7', '43.2', '59.9')),
            'GV3': (('20.0', '55.7', '75.7'), ('25.0', '47.9', '72.9')), 'GV3b': (('20.2', '55.8', '76.0'), ('25.0', '47.9', '72.9')),
            'GV4': (('6.7', '17.0', '23.8'), ('3.2', '8.3', '11.5'))}
    got = {k: (G[k]['L'][1], G[k]['R'][1]) for k in want}
    print("   readouts:", got)
    pe = lambda a, n: f"{math.floor(1000.0 * a / n + 1e-9) / 10:.1f}"     # mutant: truncate to 0.1 instead of half up
    mut = {k: tuple(tuple(pe(c, s_[2]) for c in (s_[0], s_[1], s_[0] + s_[1])) for s_ in (G[k]['L'][0], G[k]['R'][0])) for k in want}
    check("C9 readouts in the spec v3.4 (9a to 9d, 13, 15)", got == want, any(mut[k] != want[k] for k in want),
          f"truncation mutant: GV1 right {mut['GV1'][1]}")
    pbe = play(MF, MS, pM, [(p, D) for D in MC for p in pM], CAP, seed=31678, rnd=he)
    print("   GV4 under half-even budget: B", pbe['B'], "holes", pbe['holes'], "R", pbe['R'][1], "(readout unchanged; holes differ)")

    # ---------------- 4. v3.4: GV4m, both mid-run moves applied to the layout ----------------
    print("== GV4m")
    n4 = G['GV4']['n']; ri = pick(n4, 90.0); ra = reaim(n4, 90.0, ri, (20.0, 20.0), G['GV4']['rcap'])
    ys80 = [y for x, y in MS if x == 80]
    dflt80 = min((max(ys80) + 1 + round(25 / M)) if ys80 else round(250 / M), G['GV4']['reserve'])
    class Lay: pass
    LAY = Lay(); LAY.seg = ra['layout']
    def gv4m(add=(80, 60, 75.0), re=True):
        holes = [list(h) for h in G['GV4']['holes']]
        if add: holes[-1].append(add)
        cL, tL, xL, pL, sL, eL = sense_left(LAY if re else n4, 31678, GW, GH)
        cR, tR, xR, pR, sR, eR = sense_right(holes, 31678, GW, GH)
        return dict(L=readout(MF, cL, tL), R=readout(MF, cR, tR), pairs=(pL[0], pR[0]), end=(round(eL, 3), round(eR, 3)))
    gm = gv4m()
    left_drilled = n4.total() + ra['cost']; right_drilled = G['GV4']['B'] + 60
    print(f"   re-aim seg {ri} f {ra['f']:.4f} refund {ra['refund']:.3f} from {tuple(round(v, 3) for v in ra['frm'])} to {tuple(round(v, 3) for v in ra['to'])} "
          f"cost {ra['cost']:.3f}; add-hole default depth at column 80 by the spec rule: {dflt80} cells (export uses 60)")
    print(f"   GV4m: L {gm['L']} R {gm['R']} pairs {gm['pairs']} end {gm['end']}; drilled L {left_drilled:.3f} cells ({left_drilled * M:.1f} m), "
          f"R {right_drilled} cells ({right_drilled * M:.0f} m)")
    spec_m = ((139, 353, 2036), ('6.8', '17.3', '24.2'), (75, 194, 2036), ('3.7', '9.5', '13.2'), (28, 5), (192.0, 97.6 if ZC else 214.294), 6, 29.389)
    mine_m = (gm['L'][0], gm['L'][1], gm['R'][0], gm['R'][1], gm['pairs'], gm['end'], ri, round(ra['cost'], 3))
    muts = {'no moves': gv4m(add=None, re=False), 'add only': gv4m(re=False), 're-aim only': gv4m(add=None),
            'add at 0 s (click time ignored)': gv4m(add=(80, 60, 0.0))}
    caught = {k: (v['L'], v['R'], v['pairs'], v['end']) != (gm['L'], gm['R'], gm['pairs'], gm['end']) for k, v in muts.items()}
    if not ZC:   # the 75.0 s add queues behind the busy rig, so a click-time-ignored add returns the golden there; the 177.0 s add separates them
        gm_late = gv4m(add=(80, 60, 177.0)); LATE['end'] = gm_late['end']
        caught['add at 0 s (click time ignored)'] = gv4m(add=(80, 60, 0.0))['end'] != gm_late['end']
        print("   GV4m late add 177.0 s:", gm_late['end'], "; click time ignored:", gv4m(add=(80, 60, 0.0))['end'])
        assert gm_late['end'] == (192.0, 215.336) and gm_late['L'] == gm['L'] and gm_late['R'] == gm['R'] and gm_late['pairs'] == gm['pairs']
    print("   GV4m mutants differ from the golden:", caught, {k: (v['L'][1], v['R'][1], v['end']) for k, v in muts.items()})
    check("C10 GV4m golden (own add hole + own re-aim layout) = spec 9d / 13", mine_m == spec_m and dflt80 == 60, all(caught.values()),
          f"mine {mine_m}")
    simgm = simgold['GV4m']
    check("P1 parity own GV4m = sim GOLD GV4m", (gm['L'][0], gm['R'][0], gm['pairs'][0], gm['pairs'][1], gm['end'][0], gm['end'][1], ri, round(ra['cost'], 3))
          == (simgm['L'], simgm['R'], simgm['pairsL'], simgm['pairsR'], simgm['endL'], simgm['endR'], simgm['seg'], simgm['cost']),
          muts['no moves']['L'][0] != simgm['L'] or muts['no moves']['R'][0] != simgm['R'], "mutant: no-move round")

    # ---------------- 5. v3.4: reveal probability min(1, (4 m / r)^2) ----------------
    print("== single-line reveal probability")
    pf_spec = lambda r: min(1.0, (R0 / r) ** 2)
    pmuts = {'exponent 1': lambda r: min(1.0, R0 / r), 'r0 inverted (r / r0)^2': lambda r: min(1.0, (r / R0) ** 2),
             'r0 6.25 m (v3.3)': lambda r: min(1.0, (1.25 / r) ** 2), 'r0 5 m': lambda r: min(1.0, (1.0 / r) ** 2)}
    table = {'5 m': (1.0, 0.64), '7.07 m': (math.sqrt(2), 0.32), '10 m': (2.0, 0.16), '25 m': (5.0, 0.026), '50 m': (10.0, 0.0064)}
    ptab = {k: round(pf_spec(r), 4) for k, (r, _) in table.items()}
    print("   p by distance:", ptab, "; 1 in", round(1 / pf_spec(2.0), 2), "at 10 m; 2 in 3 =", round(2 / 3, 3), "vs p(5 m)", pf_spec(1.0))
    def ring_frac(pf, seed=15838):
        hole = {(100, y) for y in range(100)}; lg = {}; t1 = set()
        single_line(hole, t1, seed, 200, 100, pf=pf, log=lg)
        return {d: round(sum(1 for y in range(100) for x in (100 - d, 100 + d) if (x, y) in t1) / 200, 3) for d in range(1, 12)}, t1
    fr_spec, t1_iso = ring_frac(None)
    spec_frac = {1: 0.645, 2: 0.16, 3: 0.08, 4: 0.035, 5: 0.02, 6: 0.035, 7: 0.01, 8: 0.015, 9: 0.0, 10: 0.01, 11: 0.0}
    zs = {d: round((fr_spec[d] - pf_spec(d)) / math.sqrt(pf_spec(d) * (1 - pf_spec(d)) / 200), 2) for d in range(1, 11)}
    print("   isolated hole fractions (own):", fr_spec, "; z vs p:", zs)
    fr_m = {k: ring_frac(f)[0] for k, f in pmuts.items()}
    print("   mutant fractions at 1, 2, 5, 10 cells:", {k: (v[1], v[2], v[5], v[10]) for k, v in fr_m.items()})
    def readouts_with(pf):
        """Cored sets and cross-hole tier 1 from the golden runs; the sparse step re-run with p = pf (None = spec rule)."""
        out = {}
        for k, F, sd, W_, H_ in (('GV1', L1F, 7919, 25, 25), ('GV2', PF, 15838, GW, GH)):
            res = []
            for side in (0, 1):
                c = G[k]['cored'][side]; t = set(G[k]['xh'][side]); single_line(c, t, sd, W_, H_, pf=pf); res.append(readout(F, c, t)[1])
            out[k] = tuple(res)
        return out
    ro_spec = readouts_with(None); print("   readouts re-derived with the spec p (GV1, GV2):", ro_spec)
    ro_m = {k: readouts_with(f) for k, f in pmuts.items()}
    print("   readouts under mutants (GV1, GV2):", ro_m)
    check("C11 p(r) = min(1, (0.8 / r)^2): 0.64, 0.32, 0.16, 0.026, 0.0064; isolated-hole fractions = spec section 5; |z| < 3",
          all(abs(ptab[k] - v) < 5e-4 for k, (_, v) in table.items()) and fr_spec == spec_frac and all(abs(z) < 3 for z in zs.values()),
          all(fr_m[k] != spec_frac and (ro_m[k]['GV1'] != (want['GV1']) or ro_m[k]['GV2'] != want['GV2']) for k in pmuts),
          "mutants: exponent 1, r0 inverted, r0 6.25 m, r0 5 m")
    adj = [(101, y) for y in range(100)] + [(99, y) for y in range(100)]
    n_adj_hidden = sum(1 for c in adj if c not in t1_iso)
    _, t1_old = ring_frac(pmuts['r0 6.25 m (v3.3)'])
    check("C12 panel 11b: no cell beside a lone line is certain (only the cored column is solid)",
          all(pf_spec(math.hypot(i, j)) < 1 for i in range(-10, 11) for j in range(-10, 11) if (i, j) != (0, 0)) and n_adj_hidden > 0,
          all(c in t1_old for c in adj), f"{n_adj_hidden} of 200 adjacent cells unrevealed; r0 6.25 m mutant reveals all 200")
    # shared draw on GV1 and GV4 as well as GV2: a cell at equal nearest distance on both sides gets the same outcome
    def side_agree(k, seed):
        lgL, lgR = {}, {}
        single_line(G[k]['cored'][0], set(), seed, GW if k != 'GV1' else 25, GH if k != 'GV1' else 25, log=lgL)
        single_line(G[k]['cored'][1], set(), seed, GW if k != 'GV1' else 25, GH if k != 'GV1' else 25, log=lgR)
        return lgL, lgR
    agree = {}
    for k, sd in (('GV1', 7919), ('GV2', 15838), ('GV4', 31678)):
        a1, b1 = side_agree(k, sd); a2, b2 = side_agree(k, sd)
        agree[k] = (a1 == a2 and b1 == b2, len(set(a1) & set(b1)))
    print("   repeat-run identical and cells revealed on both sides:", agree)

    # ---------------- 6. v3.4: D20 edge-noise cap ----------------
    print("== D20 edge-noise cap")
    def ell(cx, cy, a, b): return {(x, y) for x in range(GW) for y in range(GH) if ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1.0}
    cos25, tan25 = math.cos(math.radians(25)), math.tan(math.radians(25))
    ARCH = {   # spec section 8 table at minimum size; my own placement
        'lens': ell(100, 35, 35, 12),
        'dipping layer': {(x, y) for x in range(40, 161) for y in range(GH) if 0 <= (y - 20 - (x - 40) * tan25) * cos25 < 12},
        'pipe': {(x, y) for x in range(95, 107) for y in range(15, 100)},
        'cluster': ell(55, 40, 15, 7) | ell(105, 50, 15, 7) | ell(155, 40, 15, 7),     # edge gaps 20 cells (spec minimum)
        'buried thin lens': ell(100, 70, 45, 5),
        'flat layer': {(x, y) for x in range(40, 160) for y in range(30, 42)}}
    HT = {'lens': 12, 'dipping layer': 6, 'pipe': 6, 'cluster': 7, 'buried thin lens': 5, 'flat layer': 6}
    caps = {k: hu(v / 2) for k, v in HT.items()}
    LEVEL = [0, 0, 1, 3, 4, 5]
    def dist_out(F):
        """Euclidean distance (cell centers) from each F cell to the nearest non-F cell (off-grid counts as non-F)."""
        offs = sorted(((i, j) for i in range(-14, 15) for j in range(-14, 15) if (i, j) != (0, 0)), key=lambda o: o[0] ** 2 + o[1] ** 2)
        dmap = {}
        for x, y in F:
            for i, j in offs:
                if (x + i, y + j) not in F: dmap[(x, y)] = math.hypot(i, j); break
            else: dmap[(x, y)] = 99.0
        return dmap
    def squeeze(F, r, dm=None):
        dm = dm or dist_out(F); return {c for c, d in dm.items() if d > r + 1e-9}
    def grow(F, r):
        return {(x + i, y + j) for x, y in F for i in range(-r, r + 1) for j in range(-r, r + 1) if i * i + j * j <= r * r}
    res20 = {}
    for k, F in ARCH.items():
        dm = dist_out(F); r = caps[k]; sq = squeeze(F, r, dm); nc = len(comps8(sq)) if sq else 0
        thick = max(dm.values()) - r                     # inscribed radius left after the squeeze, cells
        cols = sorted({x for x, y in sq}); minrun = min(len({y for x_, y in sq if x_ == c}) for c in cols) if cols else 0
        grown_nc = len(comps8(grow(F, r)))
        res20[k] = dict(area=len(F), cap=r, cap_m=r * M, left=len(sq), comps=nc, inscribed_left=round(thick, 2), min_col_rows=minrun,
                        grown_comps=grown_nc, by_level=[min(L_, r) for L_ in LEVEL])
        print(f"   {k}: area {len(F)}, cap {r} ({r * M:.0f} m), after squeeze {len(sq)} cells in {nc} body(ies), inscribed radius left {thick:.2f}, "
              f"min rows per column {minrun}; dilated by cap: {grown_nc} body(ies); noise by level {res20[k]['by_level']}")
    want_bodies = {k: (3 if k == 'cluster' else 1) for k in ARCH}
    whole = lambda k, r, F=None: (lambda sq: bool(sq) and len(comps8(sq)) == want_bodies[k] and len(squeeze(F or ARCH[k], r + 1)) > 0)(squeeze(F or ARCH[k], r))
    thin5 = squeeze(ARCH['buried thin lens'], 5)
    print(f"   cap-free L6 noise (5 cells) on the thin lens: {len(thin5)} cells left; whole: {whole('buried thin lens', 5)}")
    check("C13 D20 caps 6/3/3/4/3/3 cells (30/15/15/20/15/15 m); worst squeeze leaves every archetype one body (cluster 3), > 2 cells thick",
          [caps[k] for k in ARCH] == [6, 3, 3, 4, 3, 3] and all(whole(k, caps[k]) for k in ARCH) and all(res20[k]['grown_comps'] == want_bodies[k] for k in ARCH),
          not whole('buried thin lens', 5), f"thin lens keeps {res20['buried thin lens']['left']} cells; uncapped keeps {len(thin5)}")
    # same test on the sim's builders (G22 parity) and the sim's cluster gap
    sarch = SIM.archetypes(); my_on_sim = {k: len(squeeze(v, caps[k])) for k, v in sarch.items()}
    sim_er = {k: len(SIM.eroded(v, caps[k])) for k, v in sarch.items()}
    lenses = comps8(sarch['cluster'])
    gap = min(math.hypot(a[0] - b[0], a[1] - b[1]) for i in range(3) for j in range(i + 1, 3) for a in lenses[i] for b in lenses[j]) - 1
    print(f"   squeeze on the sim's builders, own vs sim eroded(): {my_on_sim} vs {sim_er}; sim thin lens at 5: {len(SIM.eroded(sarch['buried thin lens'], 5))}; "
          f"sim cluster min edge gap {gap:.2f} cells ({gap * M:.1f} m) vs spec 20 to 35 cells")
    check("P2 parity own squeeze = sim eroded() on the sim builders (G22 numbers 185 and 1)", my_on_sim == sim_er and sim_er['buried thin lens'] == 185
          and len(SIM.eroded(sarch['buried thin lens'], 5)) == 1, len(squeeze(sarch['buried thin lens'], 2)) != 185, "mutant: cap 2 instead of 3")

    # ---------------- 7. prose numbers in the spec that the readouts do not cover ----------------
    print("== spec prose counts")
    def fcnt(k, F, side): return len(F & G[k]['cored'][side]), len((F & G[k]['t1'][side]) - G[k]['cored'][side])
    prose = {
        '9a left cored / F cored / F revealed / pairs / sparse': ((len(G['GV1']['cored'][0]),) + fcnt('GV1', L1F, 0) + (G['GV1']['pairs'][0][0], G['GV1']['sparse'][0]), (31, 14, 24, 5, 43)),
        '9a right cored / F cored / F revealed / pairs / sparse': ((len(G['GV1']['cored'][1]),) + fcnt('GV1', L1F, 1) + (G['GV1']['pairs'][1][0], G['GV1']['sparse'][1]), (34, 12, 23, 1, 59)),
        '9a GV1b right sparse / readout / finish': ((G['GV1b']['sparse'][1], G['GV1b']['R'][1][2], G['GV1b']['end'][1]), (66, '43.8', HAND['GV1b'])),
        '9b left cored / F cored / F revealed / pairs / skipped / sparse / finish': ((len(G['GV2']['cored'][0]),) + fcnt('GV2', PF, 0) + G['GV2']['pairs'][0] + (G['GV2']['sparse'][0], G['GV2']['end'][0]), (234, 137, 370, 34, 1, 250, 211.0)),
        '9b right F cored / F revealed / sparse / finish': (fcnt('GV2', PF, 1) + (G['GV2']['sparse'][1], G['GV2']['end'][1]), (170, 441, 403, HAND['GV2'])),
        '9b right revealed F by column': ({c: v for c, v in {c: len([1 for (x, y) in PF if x == c and (x, y) in G['GV2']['t1'][1] and (x, y) not in G['GV2']['cored'][1]]) for c in range(95, 107)}.items() if v},
                                          {95: 6, 96: 18, 97: 56, 99: 57, 100: 66, 101: 65, 102: 54, 104: 46, 105: 38, 106: 35}),
        '9c GV3 counts L / R / finish': ((G['GV3']['L'][0][:2], G['GV3']['R'][0][:2], G['GV3']['end']), ((204, 568), (255, 489), (310.0, HAND['GV3']))),
        '9c GV3b counts L / R': ((G['GV3b']['L'][0][:2], G['GV3b']['R'][0][:2]), ((206, 569), (255, 489))),
        '9d GV4 counts L / R / pairs / finish': ((G['GV4']['L'][0][:2], G['GV4']['R'][0][:2], (G['GV4']['pairs'][0][0], G['GV4']['pairs'][1][0]), G['GV4']['end']), ((137, 347), (65, 170), (21, 4), (192.0, HAND['GV4']))),
        '15 inferred share of total, GV1 and GV2 (63 to 73 %)': (sorted(round(100 * G[k]['L' if s == 0 else 'R'][0][1] / sum(G[k]['L' if s == 0 else 'R'][0][:2])) for k in ('GV1', 'GV2') for s in (0, 1)), [63, 66, 72, 73]),
        '12 confirmed range (3 to 25 %)': ((min(float(G[k][s][1][0]) for k in ('GV1', 'GV2', 'GV3', 'GV4') for s in 'LR'), max(float(G[k][s][1][0]) for k in ('GV1', 'GV2', 'GV3', 'GV4') for s in 'LR')), (3.2, 25.0)),
    }
    bad_prose = {k: v for k, v in prose.items() if v[0] != v[1]}
    for k, (m_, s_) in prose.items(): print(f"   {'ok ' if m_ == s_ else 'BAD'} {k}: own {m_} spec {s_}")
    # gap column: spec rule unstated; compare with the difference of the printed totals
    gaps_spec = {'GV1': 3.8, 'GV2': -10.2, 'GV3': 2.7, 'GV3b': 3.0, 'GV4': 12.2}
    gaps_print = {k: round(float(G[k]['L'][1][2]) - float(G[k]['R'][1][2]), 1) for k in gaps_spec}
    gaps_raw = {k: float(Decimal(repr(round(100 * (sum(G[k]['L'][0][:2]) - sum(G[k]['R'][0][:2])) / G[k]['L'][0][2], 9))).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) for k in gaps_spec}
    gm_gap = (round(float(gm['L'][1][2]) - float(gm['R'][1][2]), 1), 11.0)
    print("   gap: spec", gaps_spec, "; printed-total difference", gaps_print, "; unrounded difference", gaps_raw, "; GV4m", gm_gap)
    check("C14 spec prose counts trace to own run", not bad_prose, any(prose[k][0] != tuple(x + 1 for x in prose[k][1]) for k in list(prose)[:2]), f"bad {list(bad_prose)}")

    # ---------------- 8. panel 11b / 12: what a cross-hole pair images ----------------
    print("== cross-hole image shape")
    def pair_fill(a, b, D):
        im = window([(r, a, b) for r in range(D)], 0, D); return len(im), (b - a - 1) * D
    for (a, b, D, lab) in ((60, 70, 100, 'full depth 500 m, gap 50 m'), (50, 60, 42, 'GV4 holes 50-60'), (60, 70, 39, 'GV4 holes 60-70'),
                           (70, 80, 39, 'GV4m add pair 70-80'), (98, 103, 100, 'GV2 98-103'), (9, 14, 14, 'GV1 9-14'), (60, 62, 100, 'gap 10 m, 500 m')):
        n_im, n_all = pair_fill(a, b, D); print(f"   {lab}: imaged {n_im} of {n_all} cells between the lines ({100 * n_im / n_all:.0f} %)")
    simim = len(SIM.imaged([(r, 60, 70) for r in range(100)], 0, 100))
    check("C15 cross-hole window parity (own window() = sim imaged(), 284 at gap 10, D 100)", pair_fill(60, 70, 100)[0] == simim == 284,
          len(window([(r, 60, 70) for r in range(100)], 0, 100)) != len([1 for r in range(100) for c in range(61, 70)]), "mutant: no corner exclusion (900)")

    v36_checks(SIM, G, FULL="--full" in sys.argv)
    v37_speed(SIM, G)
    v39_branching(SIM)
    print("SUMMARY", sum(1 for r in OUT if r[1] and r[2]), "of", len(OUT), "checks pass")
