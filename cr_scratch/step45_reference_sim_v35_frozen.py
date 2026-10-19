"""Step 45 reference sim v3.2 (spec cr_scratch/step45_toymaker_spec_v3.md, v3.2).

v3.2 (2026-10-15): 5 m cells (Quinn), grid 200 columns x 100 rows = 1,000 m wide x 500 m deep. Every constant is set in
meters and converted to cells here (section 2 of the spec). SWE v3.1 check fixes A to J:
  A coring phase carried along the whole path: a line cores the cell at every cumulative arclength k + 0.5 cells from the
    surface (one cell per 5 m of path);
  B budget and per-component split round half up (rhu);
  C every direction, generation 1 included, is clamped to +/-60 deg;
  D worst case measured, the drill cap is the binding bound;
  E portal add / move / remove rules with replay; trunks count toward the cap; the meter starts at the trunk sum;
  F JS hash note (Math.imul, >>> 0) and test vectors; G every gate runs a mutant; H constants and tie rules stated;
  I equal length to within 0.5 cell (2.5 m); J left pairs use the final layout (stated).
The v3.1 sim (12.5 m cells) is frozen as cr_scratch/step45_reference_sim_v31.py for the old-vs-new table.
All numbers printed in spec v3.2 sections 4, 6, 9 and 13 come from running this file.
"""
import math, os, json, random
from decimal import Decimal, ROUND_HALF_UP

# ---------------- constants: meters first, then cells (spec v3.2 section 2) ----------------
CELL_M = 5.0
W_GRID, H_GRID = 200, 100
def cells_of(m): return m / CELL_M
DBRANCH_MIN_M, DBRANCH_MAX_M, DBRANCH_STEP_M = 20.0, 100.0, 5.0        # 4..20 cells, 1-cell steps
NUMBRANCH_DEFAULT, NUMBRANCH_MAX = 12, 24
MAX_PORTALS = 3
PORTAL_MIN_SEP = int(cells_of(25.0))            # 5 cells
THETA_MIN, THETA_MAX, DIR_CLAMP = 20.0, 70.0, 60.0
TIP_SEP_FRAC, TIP_SEP_FLOOR = 0.9, 1.0          # cells
MARGIN = 1                                      # S prune margin, cells (5 m)
SPEED_L = cells_of(2.5)                         # borebot 2.5 m per game s = 0.5 cells/s (1 game s ~ 25 real h at 0.1 m/h)
RIG_DRILL, RIG_TRAVEL = cells_of(25.0), cells_of(50.0)   # 5 and 10 cells/s (rig 1 m/h)
RADAR_SECONDS = 3.0
RADAR_MIN_GAP = 2                               # cells (10 m): one cell between the lines
RADAR_RANGE = int(cells_of(50.0))               # 10 cells
GAP_L = GAP_R = RADAR_RANGE
R0_M = 4.0; R0_FULL = cells_of(R0_M)           # Quinn ruling 2026-10-15: r0 = 4 m (0.8 cell); v3.3 used 6.25 m
HOLE_SPACING_R = int(cells_of(50.0))            # 10 cells; densify 5, 2, 1
LABEL_FORMATION = 0.35                          # tier-1 cells carry value 1.0; threshold kept for the score test only
RESERVE_FRAC, REAIM_FRAC = 0.25, 0.4
REAIM_MASK = 8                                  # cells (40 m)
ADD_MIN_SEP = 1                                 # cells (5 m)
P1_RADIUS = cells_of(18.75)                     # 3.75 cells
STRAY_MIN_AREA = 50                             # cells (1,250 m2)
DRILL_CAP = int(cells_of(2000.0))               # 400 cells

def rh(v): return math.floor(round(v, 6) + 0.5)
def rhu(v): return math.floor(round(v, 6) + 0.5)          # B: half up; equals JS Math.round for v >= 0

def comps(S):
    """8-connected components, descending area, ties by the smallest (x, y) cell."""
    seen = set(); out = []
    for (x, y) in sorted(S):
        if (x, y) in seen: continue
        st = [(x, y)]; seen.add((x, y)); c = []
        while st:
            p = st.pop(); c.append(p)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (p[0]+dx, p[1]+dy)
                    if q in S and q not in seen: seen.add(q); st.append(q)
        out.append(c)
    out.sort(key=lambda c: (-len(c), min(c)))
    return out

# ---------------- portals ----------------
def default_portal(C):
    cols = [x for x, y in C]; m = sum(cols) / len(cols); xe = math.ceil(round(m, 6) - 0.5)
    if xe not in cols: xe = sorted(set(cols), key=lambda c: (abs(c - xe), c))[0]
    return xe
def snap_portal(S, col, tie="low"):
    cols = sorted(set(x for x, y in S))
    if not cols: return None
    best = min(abs(c - col) for c in cols); cand = [c for c in cols if abs(c - col) == best]
    return cand[0] if tie == "low" else cand[-1]
def portal_comp(Cs, S, col):
    r0 = min(y for x, y in S if x == col)
    for i, C in enumerate(Cs):
        if (col, r0) in C: return i, r0
    raise ValueError("portal not over S")
def trunk_len(S, col): return min(y for x, y in S if x == col)
def start_ok(Cs, S, portals, n_clicks, mut=()):
    if not Cs or not (1 <= len(portals) <= MAX_PORTALS): return False
    ps = sorted(portals)
    if any(b - a < PORTAL_MIN_SEP for a, b in zip(ps, ps[1:])): return False
    if 'no_served' not in mut and {portal_comp(Cs, S, p)[0] for p in portals} != set(range(len(Cs))): return False
    return 'no_click_check' in mut or n_clicks >= 1

# ---------------- left: rasterizer and click-by-click growth ----------------
def theta_of(C):
    cols = [x for x, y in C]; rows = [y for x, y in C]
    return min(THETA_MAX, max(THETA_MIN, math.degrees(math.atan((max(cols)-min(cols)+1) / (2*(max(rows)-min(rows)+1))))))

def sample(sx, sy, d, L, ok, A0=0.0, rule="carry"):
    """Prune/length: samples at s = 0, 0.5, 1.0, ... and L (cells); the segment ends at the last sample before the first
    sample whose cell fails ok(). Coring (A): points at cumulative arclength A0 + s = k + 0.5, 0 < s <= kept length.
    rule 'restart' (mutant) ignores A0; rule 'half' (v3.0 mutant) cores every 0.5-step sample."""
    ang = math.radians(d); ss = []; s = 0.0
    while s < L - 1e-9: ss.append(s); s += 0.5
    ss.append(L)
    trunc, endpt, elen, kept = False, (sx, sy), 0.0, []
    for q in ss:
        x = sx + q*math.sin(ang); y = sy + q*math.cos(ang); c = (rh(x), rh(y))
        if not ok(c): trunc = True; break
        endpt = (x, y); elen = q; kept.append((q, c))
    if rule == "half":
        cells = [c for q, c in kept]; svals = [q for q, c in kept]
    else:
        a0 = 0.0 if rule == "restart" else A0
        q = math.ceil(round(a0 - 0.5, 9)) + 0.5 - a0
        if q <= 1e-9: q += 1.0
        cells, svals = [], []
        while q <= elen + 1e-9:
            cells.append((rh(sx + q*math.sin(ang)), rh(sy + q*math.cos(ang)))); svals.append(q); q += 1.0
    sample.svals = svals
    return cells, elen, endpt, trunc

def margin_ok(S, W, H):
    near = {(x+dx, y+dy) for (x, y) in S for dx in range(-MARGIN, MARGIN+1) for dy in range(-MARGIN, MARGIN+1)}
    return lambda c: c in near and 0 <= c[0] < W and 0 <= c[1] < H

class Network:
    """Left network: pure function of (S, portals, accepted click stack). mut = mutant switches for the gates."""
    def __init__(self, S, portals, cap_cells, W=W_GRID, H=H_GRID, tip_prune=True, mut=()):
        self.S, self.W, self.H, self.cap, self.tip_prune, self.mut = S, W, H, cap_cells, tip_prune, set(mut)
        self.Cs = comps(S); self.ok = margin_ok(S, W, H)
        self.portals = sorted(portals); self.segs = []; self.front = {}; self.gens = {}; self.clicks = []; self.theta = {}
        for p in self.portals:
            ci, r0 = portal_comp(self.Cs, S, p)
            self.segs.append(dict(id=len(self.segs), portal=p, comp=ci, gen=0, cells=[(p, r) for r in range(r0)], len=float(r0),
                                  dir=0.0, parent=None, end=(p, r0), trunc=False, t=r0/SPEED_L, D=None,
                                  s=[r + 0.5 for r in range(r0)], sx=p, sy=0.0, start=0.0, A0=0.0, A1=float(r0)))
            self.front[p] = [len(self.segs)-1]; self.gens[p] = 0; self.theta[p] = theta_of(self.Cs[ci])
        if self.length() > cap_cells + 1e-9: raise ValueError("trunks exceed drill cap")
    def length(self): return sum(s['len'] for s in self.segs)
    def candidates(self, p, D_m):
        D = cells_of(D_m); th = self.theta[p]; kept = []; ends = []
        tip_sep = max(TIP_SEP_FLOOR, TIP_SEP_FRAC * D * math.sin(math.radians(th)))
        rule = "restart" if 'restart_phase' in self.mut else ("half" if 'half_coring' in self.mut else "carry")
        for pid in self.front[p]:
            par = self.segs[pid]
            if par['trunc']: continue
            for sgn in (-1, 1):
                d = sgn*th if par['gen'] == 0 else 0.5*par['dir'] + sgn*th
                if not ('no_gen1_clamp' in self.mut and par['gen'] == 0): d = max(-DIR_CLAMP, min(DIR_CLAMP, d))
                L = D * (0.7 ** par['gen'] if 'rho' in self.mut else 1.0)
                cells, elen, endpt, trunc = sample(par['end'][0], par['end'][1], d, L, self.ok, par['A1'], rule); sv = sample.svals
                if elen <= 1e-9: continue
                if self.tip_prune and any(math.hypot(endpt[0]-e[0], endpt[1]-e[1]) < tip_sep - 1e-9 for e in ends): continue
                ends.append(endpt)
                kept.append(dict(portal=p, comp=par['comp'], gen=par['gen']+1, cells=cells, len=elen, dir=d, parent=pid,
                                 end=endpt, trunc=trunc, t=par['t']+elen/SPEED_L, D=D, s=sv, sx=par['end'][0],
                                 sy=par['end'][1], start=par['t'], A0=par['A1'], A1=par['A1']+elen))
        return kept
    def next_gen(self, p, D_m):
        """Refusals in order: range, ceiling, dead, cap. A refused click changes nothing."""
        on_grid = abs(D_m/DBRANCH_STEP_M - round(D_m/DBRANCH_STEP_M)) < 1e-9
        if 'no_range' not in self.mut and not (DBRANCH_MIN_M - 1e-9 <= D_m <= DBRANCH_MAX_M + 1e-9 and on_grid): return 'range'
        if 'no_ceiling' not in self.mut and self.gens[p] >= NUMBRANCH_MAX: return 'ceiling'
        kept = self.candidates(p, D_m)
        if not kept: return 'dead'
        if 'no_cap' not in self.mut and self.length() + sum(k['len'] for k in kept) > self.cap + 1e-9: return 'cap'
        ids = []
        for k in kept:
            k['id'] = len(self.segs); self.segs.append(k); ids.append(k['id'])
        self.front[p] = ids; self.gens[p] += 1; self.clicks.append((p, D_m))
        return 'ok'
    def undo(self):
        if not self.clicks: return False
        fresh = Network(self.S, self.portals, self.cap, self.W, self.H, self.tip_prune, self.mut)
        for p, D in self.clicks[:-1]: fresh.next_gen(p, D)
        self.__dict__.update(fresh.__dict__); return True
    def dlist(self, p): return [cells_of(D) for q, D in self.clicks if q == p]
    def comp_lengths(self):
        out = [0.0]*len(self.Cs)
        for s in self.segs: out[s['comp']] += s['len']
        return out
    def tips(self): return [s for s in self.segs if s['gen'] > 0 and not any(q['parent'] == s['id'] for q in self.segs)]

# ---------------- PLAN edits (E) ----------------
def replay(S, portals, clicks, cap, W=W_GRID, H=H_GRID):
    """Rebuild from the click stack. A refused click is dropped with every later click of its portal."""
    net = Network(S, portals, cap, W, H); dead = set(); acc = []; drop = []
    for p, D in clicks:
        if p in dead or net.next_gen(p, D) != 'ok': dead.add(p); drop.append((p, D))
        else: acc.append((p, D))
    return net, acc, drop
def meter_start(S, portals): return sum(trunk_len(S, q) for q in portals)
def plan_add_portal(S, portals, clicks, drop_col, cap, W=W_GRID, H=H_GRID):
    c = snap_portal(S, drop_col)
    if len(portals) >= MAX_PORTALS: return 'max', portals, clicks
    if any(abs(c - q) < PORTAL_MIN_SEP for q in portals): return 'sep', portals, clicks
    net, _, _ = replay(S, portals, clicks, cap, W, H)
    if net.length() + trunk_len(S, c) > cap + 1e-9: return 'trunk_cap', portals, clicks
    return 'ok', sorted(portals + [c]), clicks
def plan_move_portal(S, portals, clicks, old, drop_col, cap, W=W_GRID, H=H_GRID):
    c = snap_portal(S, drop_col); others = [q for q in portals if q != old]
    if any(abs(c - q) < PORTAL_MIN_SEP for q in others): return 'sep', portals, clicks
    if sum(trunk_len(S, q) for q in others + [c]) > cap + 1e-9: return 'trunk_cap', portals, clicks
    newp = sorted(others + [c]); _, acc, _ = replay(S, newp, [(c if p == old else p, D) for p, D in clicks], cap, W, H)
    return 'ok', newp, acc
def plan_remove_portal(S, portals, clicks, old, cap, W=W_GRID, H=H_GRID):
    newp = [q for q in portals if q != old]
    _, acc, _ = replay(S, newp, [(p, D) for p, D in clicks if p != old], cap, W, H)
    return 'ok', newp, acc

def budgets(net, rnd=rhu):
    """B: budget = half-up(left length); b_k = half-up(l_k); last component takes the remainder. |left - right| <= 0.5 cell."""
    ls = net.comp_lengths(); budget = rnd(net.length())
    b = [rnd(l) for l in ls]; b[-1] = budget - sum(b[:-1])
    reserve = math.ceil(RESERVE_FRAC * budget)
    return budget, b, reserve, math.floor(REAIM_FRAC * reserve)

# ---------------- right: Balrog plan ----------------
def rig_plan(Cs, portals_by_comp, b, hole_spacing=HOLE_SPACING_R, floor=1):
    """Pass 0 at every portal column; spacing 10, then halving 5, 2, 1; the last hole takes the remainder."""
    holes = [[] for _ in Cs]; spent = [0]*len(Cs); closed = [False]*len(Cs); info = []
    for i, C in enumerate(Cs):
        cols = sorted(set(x for x, y in C)); deep = {c: max(y for x, y in C if x == c)+1 for c in cols}
        ps = portals_by_comp.get(i, [])
        info.append((deep, sorted(cols, key=lambda c: (min(abs(c-p) for p in ps), c)), ps))
    def try_add(i, col):
        need = info[i][0][col]; rem = b[i] - spent[i]
        if need <= rem: holes[i].append((col, need)); spent[i] += need; return True
        if rem > 0: holes[i].append((col, rem)); spent[i] += rem
        closed[i] = True; return False
    for i in range(len(Cs)):
        for p in info[i][2]:
            if closed[i]: break
            try_add(i, p)
    s = hole_spacing
    while s >= floor:
        for i in range(len(Cs)):
            if closed[i]: continue
            for col in info[i][1]:
                if any(abs(col-h[0]) < s for h in holes[i]): continue
                if not try_add(i, col): break
        s //= 2
    return holes, spent

# ---------------- sensing ----------------
M32 = 0xFFFFFFFF
def u01(seed, x, y, side=None):
    """murmur3 fmix32 of (seed, x, y); no side term (side only for the G15 mutant).
    JS: h = (Math.imul(seed,0x9E3779B1) + Math.imul(x,0xC2B2AE3D) + Math.imul(y,0x27D4EB2F)) >>> 0; then
    h ^= h >>> 16; h = Math.imul(h,0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h,0xC2B2AE35) >>> 0; h ^= h >>> 16;
    u = (h >>> 0) / 4294967296."""
    h = (seed*0x9E3779B1 + x*0xC2B2AE3D + y*0x27D4EB2F + (0 if side is None else side*0x165667B1)) & M32
    h ^= h >> 16; h = (h*0x85EBCA6B) & M32; h ^= h >> 13; h = (h*0xC2B2AE35) & M32; h ^= h >> 16
    return h / 4294967296.0
def p_reveal(r, r0=R0_FULL): return min(1.0, (r0/r)**2)
def sparse(tier2, tier1, seed, W, H, rng=RADAR_RANGE, r0=R0_FULL, pfun=None, side=None):
    """Single-line radar, both sides: a non-cored cell within rng cells of the side's nearest cored cell (Euclidean,
    cell centers) is revealed if u01(seed, x, y) < p(r) = min(1, (r0 / r)^2)."""
    pf = pfun or (lambda r: p_reveal(r, r0)); dist = {}
    offs = [(dx, dy, math.hypot(dx, dy)) for dx in range(-rng, rng+1) for dy in range(-rng, rng+1) if 0 < math.hypot(dx, dy) <= rng + 1e-9]
    for (a, b) in tier2:
        for dx, dy, r in offs:
            c = (a+dx, b+dy)
            if 0 <= c[0] < W and 0 <= c[1] < H and c not in tier2 and r < dist.get(c, 1e9): dist[c] = r
    n = 0
    for c in sorted(dist):
        if c in tier1: continue
        if u01(seed, c[0], c[1], side) < pf(dist[c]): tier1[c] = 1.0; n += 1
    return n
def imaged(pairrows, r0, D, slope=1.19):
    out = {}
    for (row, a, b) in pairrows:
        d = b - a; h = max(0, D - slope*d); y = row - r0
        for c in range(a+1, b):
            u = min(c-a, b-c)
            if u <= d/2 + 1e-9:
                thr = h*(1 - 2*u/d)
                if y < thr - 1e-9 or y > D - 1 - thr + 1e-9: continue
            out[(c, row)] = 1.0
    return out
def apply_pairs(pairs, tier1, frac=0.2, flags=None, snaps=None, keep=None):
    sch = skp = 0
    for i, im in enumerate(pairs):
        tier2 = snaps[i]
        if flags is not None: flags.append(False)
        if not im: skp += 1; continue
        new = sum(1 for c in im if c not in tier2 and c not in tier1)
        if new/len(im) < frac: skp += 1; continue
        sch += 1
        if flags is not None: flags[-1] = True
        for c in im:
            if c not in tier2 and (keep is None or keep(c)): tier1[c] = 1.0
    return sch, skp
def left_sense(segs, seed=0, W=W_GRID, H=H_GRID, pfun=None):
    """J: borebot pairs = x-adjacent cored cells of different segments in a row of the final layout (gap 2..10 cells),
    scheduled when the later segment completes; skip test against cells cored at that time."""
    tier2 = set(); rowsets = {}; byrow = {}
    for gid, s in enumerate(segs):
        rs = set()
        for (x, y) in s['cells']:
            tier2.add((x, y)); rs.add(y); byrow.setdefault(y, {}).setdefault(x, set()).add(gid)
        rowsets[gid] = rs
    pr = {}
    for row, dd in byrow.items():
        cs = sorted(dd)
        for a, b in zip(cs, cs[1:]):
            if b - a < RADAR_MIN_GAP or b - a > GAP_L or dd[a] & dd[b]: continue
            i = min(dd[a]); j = min(dd[b]); pr.setdefault((min(i, j), max(i, j)), []).append((row, a, b))
    order = sorted(pr, key=lambda key: (max(segs[key[0]]['t'], segs[key[1]]['t']), key))
    lst = []; ready = []
    for key in order:
        ready.append(max(segs[key[0]]['t'], segs[key[1]]['t']))
        com = rowsets[key[0]] & rowsets[key[1]]; r0 = min(com); D = max(com) - r0 + 1
        lst.append(imaged(pr[key], r0, D))
    t1 = {}; flags = []
    snaps = [{c for q in segs if q['t'] <= rd + 1e-9 for c in q['cells']} for rd in ready]
    sch, skp = apply_pairs(lst, t1, flags=flags, snaps=snaps)
    left_sense.sparse = sparse(tier2, t1, seed, W, H, pfun=pfun)
    left_sense.last = (ready, flags, max(s['t'] for s in segs))
    return tier2, t1, sch, skp
def rig_sense(holes_all, seed=0, W=W_GRID, H=H_GRID, pfun=None, pair_falloff=False):
    """Rig pairs form in completion order: a completing hole pairs with its nearest completed neighbor on each side."""
    flat = [h for hs in holes_all for h in hs]
    done = {}; tt = 0.0; pos = flat[0][0] if flat else 0
    for h in flat:
        start = max(tt, h[2] if len(h) > 2 else 0.0); tt = start + abs(h[0]-pos)/RIG_TRAVEL + h[1]/RIG_DRILL; pos = h[0]; done[h[0]] = tt
    holes = sorted((h[0], h[1]) for h in flat); depth = dict(holes)
    tier2 = {(c, r) for c, dp in holes for r in range(dp)}
    lst = []; ready = []; doneset = []
    for c in sorted(done, key=lambda c: (done[c], c)):
        lefts = [x for x in doneset if x < c]; rights = [x for x in doneset if x > c]
        for nb in ([max(lefts)] if lefts else []) + ([min(rights)] if rights else []):
            a, b = min(c, nb), max(c, nb)
            if b - a < RADAR_MIN_GAP or b - a > GAP_R: continue
            D = min(depth[a], depth[b]); ready.append(done[c]); lst.append(imaged([(r, a, b) for r in range(D)], 0, D))
        doneset.append(c)
    t1 = {}; flags = []
    snaps = [{(c, r) for c in done if done[c] <= rd + 1e-9 for r in range(depth[c])} for rd in ready]
    keep = None
    if pair_falloff:   # G14 mutant: the 1/r^2 rule applied to cross-hole cells
        keep = lambda c: u01(seed, *c) < p_reveal(min(abs(c[0]-h) for h in depth))
    sch, skp = apply_pairs(lst, t1, flags=flags, snaps=snaps, keep=keep)
    rig_sense.sparse = sparse(tier2, t1, seed, W, H, pfun=pfun)
    rig_sense.last = (ready, flags, tt)
    return tier2, t1, sch, skp
def run_end(last):
    ready, flags, drill_end = last; free = 0.0
    for rd, fl in sorted(zip(ready, flags), key=lambda z: z[0]):
        if fl: free = max(rd, free) + RADAR_SECONDS
    return max(drill_end, free)
def score(F, tier2, t1):
    return len([c for c in F if c in tier2]), len([c for c in F if c not in tier2 and c in t1]), len(F)
def fmt1(x): return str(Decimal(repr(round(float(x), 9))).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
def pct1(num, den): return "no formation" if den == 0 else fmt1(100.0*num/den)

# ---------------- mid-run ----------------
def add_hole_depth(S, col, reserve_left):
    ys = [y for (x, y) in S if x == col]
    return min((max(ys) + 1 + int(cells_of(25.0))) if ys else int(cells_of(250.0)), reserve_left)
def reaim_cap(reserve_cells): return math.floor(REAIM_FRAC*reserve_cells)
def reaim(net, t, idx, target, cap):
    segs = net.segs; S = net.S
    def fr(q): return 0.0 if q['len'] == 0 else max(0.0, min(1.0, (t - q['start'])/(q['len']/SPEED_L)))
    s = segs[idx]; f = fr(s); kill = {idx}; ch = True
    while ch:
        ch = False
        for i, q in enumerate(segs):
            if i not in kill and q['parent'] in kill and fr(q) == 0: kill.add(i); ch = True
    refund = s['len']*(1-f) + sum(segs[i]['len'] for i in kill if i != idx)
    a = math.radians(s['dir']); cur = (s['sx'] + f*s['len']*math.sin(a), s['sy'] + f*s['len']*math.cos(a))
    SM = {(x+dx, y+dy) for (x, y) in S for dx in range(-REAIM_MASK, REAIM_MASK+1) for dy in range(-REAIM_MASK, REAIM_MASK+1)}
    inG = lambda c: 0 <= c[0] < net.W and 0 <= c[1] < net.H
    ds = net.dlist(s['portal']); th = net.theta[s['portal']]; ngen = len(ds); Acur = s['A0'] + f*s['len']
    def build(tg):
        dx, dy = tg[0]-cur[0], tg[1]-cur[1]; L = math.hypot(dx, dy); d = math.degrees(math.atan2(dx, dy))
        cells, elen, endpt, tr = sample(cur[0], cur[1], d, L, inG, Acur)
        new = [dict(cells=cells, len=elen, dir=d, end=endpt, trunc=False, gen=s['gen'], t=t+elen/SPEED_L, A1=Acur+elen)]
        front = [0]
        for g in range(s['gen']+1, ngen+1):
            D = ds[g-1]; tip_sep = max(TIP_SEP_FLOOR, TIP_SEP_FRAC*D*math.sin(math.radians(th))); ends = []; nxt = []
            for pi in front:
                pp = new[pi]
                if pp['trunc']: continue
                for sgn in (-1, 1):
                    dd = max(-DIR_CLAMP, min(DIR_CLAMP, 0.5*pp['dir'] + sgn*th))
                    c2, e2, ep2, tr2 = sample(pp['end'][0], pp['end'][1], dd, D, lambda c: c in SM and inG(c), pp['A1'])
                    if e2 <= 1e-9 or any(math.hypot(ep2[0]-e[0], ep2[1]-e[1]) < tip_sep - 1e-9 for e in ends): continue
                    ends.append(ep2); new.append(dict(cells=c2, len=e2, dir=dd, end=ep2, trunc=tr2, gen=g, t=pp['t']+e2/SPEED_L, A1=pp['A1']+e2))
                    nxt.append(len(new)-1)
            front = nxt
        added = sum(q['len'] for q in new)
        return new, added, added - refund
    wanted = build(target)
    for i in range(51):
        aa = 1 - 0.02*i; tg = (cur[0]+(target[0]-cur[0])*aa, cur[1]+(target[1]-cur[1])*aa)
        new, added, cost = build(tg)
        if cost <= cap + 1e-9:
            return dict(new=new, added=added, cost=cost, target=tg, clamped=aa < 1, wantedCost=wanted[2], refund=refund, frm=cur, f=f)
    return None
def reaim_pick(net, t, comp=0):
    fr = lambda q: 0.0 if q['len'] == 0 else max(0.0, min(1.0, (t - q['start'])/(q['len']/SPEED_L)))
    cand = [(i, q) for i, q in enumerate(net.segs) if q['comp'] == comp and q['gen'] > 0 and 0 < fr(q) < 1]
    if not cand: return None
    return min(cand, key=lambda z: z[1]['sx'] + fr(z[1])*z[1]['len']*math.sin(math.radians(z[1]['dir'])))[0]

# ---------------- round driver ----------------
def apply_reaim(net, t, idx, ra):
    """Network segments after a re-aim at time t: killed subtree removed, the re-aimed segment cut at f, new segments
    appended (straight segment + regrowth). Used by GV4m; mirrors step45_storyboard_v3/export_sim.py."""
    segs0 = net.segs
    fr = lambda q: 0.0 if q['len'] == 0 else max(0.0, min(1.0, (t - q['start']) / (q['len'] / SPEED_L)))
    kill = {idx}; ch = True
    while ch:
        ch = False
        for i, q in enumerate(segs0):
            if i not in kill and q['parent'] in kill and fr(q) == 0: kill.add(i); ch = True
    s0 = segs0[idx]; f = fr(s0); out = []
    for i, q in enumerate(segs0):
        if i in kill and i != idx: continue
        qq = dict(q)
        if i == idx:
            keep = [j for j, v in enumerate(q['s']) if v <= f * q['len'] + 1e-9]
            qq.update(cells=[q['cells'][j] for j in keep], len=f * q['len'], t=t, trunc=False)
        out.append(qq)
    for k in ra['new']:
        out.append(dict(cells=k['cells'], len=k['len'], t=k['t'], gen=k['gen'], parent=None))
    return out
def play_moves(F, S, portals, clicks, cap, add, reaim_at, target, seed=0, W=W_GRID, H=H_GRID, do_add=True, do_reaim=True, ignore_click_time=False):
    """GV4m: the round with both mid-run moves. add = (col, depth, click time); re-aim of the westmost partly drilled
    tip of component 0 at reaim_at toward target."""
    net = Network(S, portals, cap, W, H)
    for p, D in clicks: net.next_gen(p, D)
    budget, b, reserve, rcap = budgets(net)
    pbc = {}
    for p in net.portals: pbc.setdefault(portal_comp(net.Cs, S, p)[0], []).append(p)
    holes, spent = rig_plan(net.Cs, pbc, b)
    if do_add: holes[-1].append((add[0], add[1]) if ignore_click_time else tuple(add))
    idx = reaim_pick(net, reaim_at); ra = reaim(net, reaim_at, idx, target, rcap)
    segs1 = apply_reaim(net, reaim_at, idx, ra) if do_reaim else net.segs
    t2, t1, schL, _ = left_sense(segs1, seed=seed, W=W, H=H); endL = run_end(left_sense.last)
    r2, r1, schR, _ = rig_sense(holes, seed=seed, W=W, H=H); endR = run_end(rig_sense.last)
    return dict(L=score(F, t2, t1), R=score(F, r2, r1), pairsL=schL, pairsR=schR, endL=endL, endR=endR, seg=idx,
                drilledL=sum(q['len'] for q in segs1), drilledR=sum(h[1] for hs in holes for h in hs),
                cost=ra['cost'], reserve=reserve, add_reserve_ok=add[1] <= reserve)

def play(F, S, portals, clicks, cap, W=W_GRID, H=H_GRID, tip_prune=True, adds=(), seed=0, mut=()):
    net = Network(S, portals, cap, W, H, tip_prune, mut)
    results = [net.next_gen(p, D) for p, D in clicks]
    budget, b, reserve, rcap = budgets(net)
    pbc = {}
    for p in net.portals: pbc.setdefault(portal_comp(net.Cs, S, p)[0], []).append(p)
    holes, spent = rig_plan(net.Cs, pbc, b)
    for a in adds: holes[-1].append(tuple(a))
    t2, t1, schL, skpL = left_sense(net.segs, seed=seed, W=W, H=H); lastL = left_sense.last; spL = left_sense.sparse
    r2, r1, schR, skpR = rig_sense(holes, seed=seed, W=W, H=H); lastR = rig_sense.last; spR = rig_sense.sparse
    return dict(net=net, results=results, budget=budget, b=b, reserve=reserve, reaim_cap=rcap, holes=holes, spent=spent,
                L=score(F, t2, t1), R=score(F, r2, r1), sparseL=spL, sparseR=spR, pairsL=(schL, skpL), pairsR=(schR, skpR),
                endL=run_end(lastL), endR=run_end(lastR), length=net.length(), coredL=len(t2), coredR=len(r2))

def summary(r):
    n = r['net']
    return dict(results=r['results'], segs=len(n.segs), tips=len(n.tips()), length=round(r['length'], 3), budget=r['budget'],
                b=r['b'], reserve=r['reserve'], reaim_cap=r['reaim_cap'], holes=r['holes'], spent=r['spent'], L=r['L'], R=r['R'],
                pairsL=r['pairsL'], pairsR=r['pairsR'], sparse=(r['sparseL'], r['sparseR']), endL=round(r['endL'], 3),
                endR=round(r['endR'], 3), cored=(r['coredL'], r['coredR']))
def report(name, r):
    sm = summary(r); cL, iL, n = r['L']; cR, iR, _ = r['R']
    print(f"== {name}")
    for k, v in sm.items():
        if k == 'results' and len(v) > 8: v = f"{v.count('ok')} ok, {v.count('cap')} cap, {v.count('dead')} dead, {v.count('ceiling')} ceiling"
        print(f"   {k}: {v}")
    print(f"   readout L {pct1(cL,n)} / {pct1(iL,n)} / {pct1(cL+iL,n)}   R {pct1(cR,n)} / {pct1(iR,n)} / {pct1(cR+iR,n)}")

# ---------------- worlds (meters -> 5 m cells) ----------------
SEED_L1, SEED_PIPE, SEED_MAIN = 7919, 15838, 31678
def rect(c0, c1, r0, r1): return {(x, y) for x in range(c0, c1+1) for y in range(r0, r1+1)}
def l1_world():   # 125 x 125 m test world (25 x 25 cells); F x 40-90 m, y 50-90 m; S x 25-75 m, y 40-100 m
    return rect(8, 17, 10, 17), rect(5, 14, 8, 19)
def pipe_world():  # kimberlite pipe x 475-535 m, 75-500 m deep; SROI x 475-565 m, 50-500 m deep
    return rect(95, 106, 15, 99), rect(95, 112, 10, 99)
def main_world():  # storyboard L4 painting (80 x 40 at 12.5 m), resampled at 5 m cell centers
    d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "step45_storyboard", "main_fs.json")))
    Fo = {tuple(c) for c in d["F"]}; So = {tuple(c) for c in d["S"]}
    up = lambda old: {(i, j) for i in range(W_GRID) for j in range(H_GRID) if (int((5*i+2.5)//12.5), int((5*j+2.5)//12.5)) in old}
    return up(Fo), up(So)
L1_CLICKS_M = [25.0, 20.0]
PIPE6_M = [100.0, 75.0, 50.0, 50.0, 35.0, 25.0]
PIPE24_M = [100, 75, 50, 50, 40, 40, 30, 30, 25, 25] + [20]*14
MAIN_M = [75.0, 50.0, 35.0, 25.0]
L1_CAP = int(cells_of(375.0))   # 75 cells, test world only

# ---------------- K1: archetype builders at their v3.3 sizes (5 m cells) and the zero-area floor ----------------
F_FLOOR = 500     # cells = 12,500 m2 (the v2.5 floor of 80 cells at 12.5 m, same ground area)
def ellipse(cx, cy, a, b): return {(x, y) for x in range(W_GRID) for y in range(H_GRID) if ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1.0}
def archetypes():
    """Minimum sizes of section 8; edge noise not applied (it moves the boundary by at most 5 cells at L6)."""
    lay = lambda t, dip, x0, x1, y0: {(x, y) for x in range(x0, x1 + 1) for y in range(H_GRID)
                                      if 0 <= y - (y0 + (x - x0) * math.tan(math.radians(dip))) < t}
    return {"lens": ellipse(100, 35, 35, 12), "dipping layer": lay(12, 25, 40, 160, 20), "pipe": rect(94, 105, 15, 99),
            "cluster": ellipse(50, 40, 15, 7) | ellipse(100, 50, 15, 7) | ellipse(150, 40, 15, 7),   # centres 50 apart: edge gap 20 cells (100 m)
            "buried thin lens": ellipse(100, 70, 45, 5), "flat layer": rect(40, 159, 30, 41)}
def builds(F, floor=F_FLOOR): return len(F) >= floor
HALF_THICK = {"lens": 12, "dipping layer": 6, "pipe": 6, "cluster": 7, "buried thin lens": 5, "flat layer": 6}   # cells
def edge_noise_cap(name): return rhu(HALF_THICK[name] / 2)          # D20: at most half the half-thickness, half up
def eroded(F, r):
    """Worst case of inward boundary displacement by r cells: keep a cell only if every cell within Euclidean r is in F."""
    offs = [(dx, dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy <= r * r]
    return {c for c in F if all((c[0] + dx, c[1] + dy) in F for dx, dy in offs)}
def connected(F): return len(F) > 0 and len(comps(F)) == 1 if len(F) < 5000 else len(F) > 0

def segs_close(a, b):
    return len(a) == len(b) and all(x['cells'] == y['cells'] and abs(x['len']-y['len']) < 1e-9 for x, y in zip(a, b))
def tip_violations(net):
    bad = 0
    for p in net.portals:
        ds = net.dlist(p)
        for g in range(1, net.gens[p]+1):
            ends = [s['end'] for s in net.segs if s['portal'] == p and s['gen'] == g]
            ts = max(TIP_SEP_FLOOR, TIP_SEP_FRAC*ds[g-1]*math.sin(math.radians(net.theta[p])))
            bad += sum(1 for i in range(len(ends)) for j in range(i+1, len(ends)) if math.dist(ends[i], ends[j]) < ts - 1e-9)
    return bad
def chain_rate(Ds, deg, rule, offsets=10):
    """Distinct cored cells per cell of length on straight chains of consecutive segments (lengths Ds)."""
    tot = N = 0; a = math.radians(deg)
    for i in range(offsets):
        for j in range(offsets):
            sx, sy = 50 + i/offsets, 5 + j/offsets; cs = set(); A = 0.0
            for L in Ds:
                x0, y0 = sx + A*math.sin(a), sy + A*math.cos(a)
                cells, _, _, _ = sample(x0, y0, deg, L, lambda c: True, A, rule); cs |= set(cells); A += L
            tot += len(cs); N += A
    return tot / N

GOLD = {   # spec v3.2 section 13; frozen from the 2026-10-15 run (python step45_reference_sim_v3.py --print)
    'GV1': dict(results=['ok']*2, segs=7, length=34.0, budget=34, b=[34], reserve=9, reaim_cap=3, holes=[[(9, 20), (14, 14)]],
                spent=[34], L=(14, 24, 80), R=(12, 23, 80), pairsL=(5, 0), pairsR=(1, 0), sparse=(43, 59), endL=46.0, endR=10.3),
    'GV1b': dict(holes=[[(9, 20), (14, 14), (18, 9, 5.0)]], R=(12, 23, 80), pairsR=(2, 0), sparse=(43, 66), endR=13.3),
    'GV2': dict(results=['ok']*6, segs=31, length=253.5, budget=254, b=[254], reserve=64, reaim_cap=25,
                holes=[[(103, 100), (98, 100), (108, 54)]], spent=[254], L=(137, 370, 1020), R=(170, 441, 1020),
                pairsL=(34, 1), pairsR=(2, 0), sparse=(250, 403), endL=211.0, endR=55.3),
    'GV3': dict(results=['ok']*10 + ['cap']*14, segs=57, length=400.0, budget=400, holes=[[(103, 100), (98, 100), (108, 100), (101, 100)]],
                spent=[400], L=(204, 568, 1020), R=(255, 489, 1020), endL=310.0),
    'GV3b': dict(results=['ok']*11 + ['dead']*13, segs=63, length=408.5, budget=409, reserve=103, reaim_cap=41, spent=[409], L=(206, 569, 1020), R=(255, 489, 1020)),
    'GV4': dict(results=['ok']*8, segs=31, length=298.5, budget=299, b=[126, 173], reserve=75, reaim_cap=30,
                holes=[[(60, 45), (50, 42), (70, 39)], [(146, 80), (136, 77), (156, 16)]], spent=[126, 173],
                L=(137, 347, 2036), R=(65, 170, 2036), pairsL=(21, 0), pairsR=(4, 0), endL=192.0),
    'reaim': (90, 6, 29.389, 56.352, 60),
    # GV4m: GV4 plus both mid-run moves, parameters from step45_storyboard_v3/sim_export.json (main.actions):
    # add hole (80, 60) clicked at 75.0 s; re-aim at 90.0 s of the westmost partly drilled tip (segment 6) toward (20, 20)
    'GV4m': dict(L=(139, 353, 2036), R=(75, 194, 2036), pairsL=28, pairsR=5, endL=192.0, endR=97.6, seg=6, cost=29.389),
    'GV5': (24, 'ceiling', 2085),
    'worst': (103, 5321),
}

if __name__ == "__main__":
    import sys
    PRINT_ONLY = "--print" in sys.argv
    CK = []
    def gate(name, zero, bad):
        assert zero, name + ": zero control failed"
        assert bad, name + ": known-bad mutant not caught"
        CK.append(name)
    out = {}
    # ---- goldens ----
    F, S = l1_world()
    p1 = default_portal(comps(S)[0])
    out['GV1'] = play(F, S, [p1], [(p1, D) for D in L1_CLICKS_M], L1_CAP, 25, 25, seed=SEED_L1)
    dep = add_hole_depth(S, 18, out['GV1']['reserve'])
    out['GV1b'] = play(F, S, [p1], [(p1, D) for D in L1_CLICKS_M], L1_CAP, 25, 25, seed=SEED_L1, adds=[(18, dep, 5.0)])
    F, S = pipe_world(); pp = default_portal(comps(S)[0])
    out['GV2'] = play(F, S, [pp], [(pp, D) for D in PIPE6_M], DRILL_CAP, seed=SEED_PIPE)
    out['GV3'] = play(F, S, [pp], [(pp, float(D)) for D in PIPE24_M], DRILL_CAP, seed=SEED_PIPE)
    out['GV3b'] = play(F, S, [pp], [(pp, float(D)) for D in PIPE24_M], 2*DRILL_CAP, seed=SEED_PIPE)
    Fm, Sm = main_world(); dp = [default_portal(C) for C in comps(Sm)]
    out['GV4'] = play(Fm, Sm, dp, [(p, D) for D in MAIN_M for p in dp], DRILL_CAP, seed=SEED_MAIN)
    for k, r in out.items(): report(f"{k}", r)
    print("   portals: L1", p1, "pipe", pp, "main", dp, "; GV1b added hole (18, depth", dep, ") at 5.0 s")
    rm = out['GV4']; ra = None; t_ok = None
    for t in range(40, 400, 10):
        i = reaim_pick(rm['net'], float(t))
        if i is None: continue
        r_ = reaim(rm['net'], float(t), i, (20.0, 20.0), rm['reaim_cap'])
        if r_ is not None and r_['clamped'] and ra is None: ra, t_ok, i_ok = r_, t, i
    print(f"   re-aim GV4: first clamped success at t {t_ok} s, seg {i_ok}, cost {ra['cost']:.3f} (cap {rm['reaim_cap']}), wanted {ra['wantedCost']:.3f}")
    t_ref = None
    for t in range(40, 400, 10):
        i = reaim_pick(rm['net'], float(t))
        if i is not None and reaim(rm['net'], float(t), i, (20.0, 20.0), rm['reaim_cap']) is None: t_ref, i_ref = t, i; break
    print(f"   re-aim GV4 refused at t {t_ref} s (seg {i_ref})")
    # ceiling and worst case
    Sc = rect(75, 124, 0, 99)
    nt = Network(Sc, [100], 10**9); res = [nt.next_gen(100, 20.0) for _ in range(25)]
    print("== GV5 ceiling: 50 x 100 cell SROI (250 x 500 m), 25 clicks at 20 m, no cap:", res.count('ok'), "ok, then", res[-1],
          "; segments", len(nt.segs), "length", round(nt.length(), 1), "cells")
    shapes = {"250 x 500 m, 1 portal": (rect(75, 124, 0, 99), [100]), "250 x 500 m, 3 portals": (rect(75, 124, 0, 99), [80, 100, 120]),
              "500 x 250 m, 1 portal": (rect(50, 149, 0, 49), [100]), "500 x 250 m, 3 portals": (rect(50, 149, 0, 49), [62, 100, 137]),
              "1,000 x 125 m, 3 portals": (rect(0, 199, 0, 24), [25, 100, 175]), "337.5 x 375 m, 3 portals": (rect(67, 133, 25, 99), [75, 100, 125])}
    worst = {}
    for name, (Sx, ports) in shapes.items():
        for cap in (10**9, DRILL_CAP):
            n_ = Network(Sx, ports, cap)
            for _ in range(24):
                for p in ports: n_.next_gen(p, 20.0)
            worst[(name, cap)] = (len(n_.segs), round(n_.length(), 1))
    for k, v in worst.items(): print(f"   worst case {k[0]}, cap {'none' if k[1] > 10**8 else k[1]}: segments {v[0]}, length {v[1]} cells")

    if PRINT_ONLY: sys.exit(0)
    G = GOLD
    for k in ('GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4'):
        got = summary(out[k]); want = G[k]
        for f_, v in want.items():
            assert (got[f_] == v) if not isinstance(v, float) else abs(got[f_] - v) < 1e-6, (k, f_, got[f_], v)
    assert (t_ok, i_ok, round(ra['cost'], 3), round(ra['wantedCost'], 3), t_ref) == G['reaim']
    assert (res.count('ok'), res[-1], len(nt.segs)) == G['GV5']
    capmax = max(v[0] for k, v in worst.items() if k[1] == DRILL_CAP); unc = max(v[0] for k, v in worst.items() if k[1] != DRILL_CAP)
    assert (capmax, unc) == G['worst']
    assert capmax <= (DRILL_CAP) / 0.5

    # ---- gates: zero control on the real code, known-bad = a mutant run through the same check ----
    F, S = l1_world()
    t_snap = lambda fn: fn(S, 9) == 9 and fn(S, 20) == 14 and fn(S, 0) == 5 and fn({(2, 5), (6, 5)}, 4) == 2
    gate("G1 portal snap", t_snap(snap_portal), not t_snap(lambda S_, c: c) and not t_snap(lambda S_, c: snap_portal(S_, c, "high")))
    S2 = S | rect(20, 23, 10, 12); C2 = comps(S2)
    t_start = lambda m: start_ok(comps(S), S, [9], 1, m) and not start_ok(comps(S), S, [9], 0, m) and not start_ok(C2, S2, [9], 1, m)
    gate("G2 start gate", t_start(()), not t_start(('no_served',)) and not t_start(('no_click_check',)))
    t_range = lambda m: (lambda n: n.next_gen(9, 20.0) == 'ok' and n.next_gen(9, 15.0) == 'range' and n.next_gen(9, 22.5) == 'range'
                         and n.next_gen(9, 105.0) == 'range')(Network(S, [9], L1_CAP, 25, 25, mut=m))
    gate("G3 dBranch range and 5 m grid", t_range(()), not t_range(('no_range',)))
    F, S = pipe_world()
    def t_len(m):
        n = Network(S, [pp], DRILL_CAP, mut=m)
        for D in PIPE6_M: n.next_gen(pp, D)
        return all(abs(s_['len'] - n.dlist(pp)[s_['gen']-1]) < 1e-9 for s_ in n.segs if s_['gen'] > 0 and not s_['trunc'])
    gate("G4 per-click dBranch", t_len(()), not t_len(('rho',)))
    t_cap = lambda m: (lambda n: n.next_gen(pp, 100.0) == 'cap' and n.length() <= 12 + 1e-9)(Network(S, [pp], 12, mut=m))
    gate("G5 drill cap", t_cap(()) and all(x == 'ok' for x in play(F, S, [pp], [(pp, D) for D in PIPE6_M], 10**9)['results']), not t_cap(('no_cap',)))
    Sw = rect(50, 149, 20, 59)
    def t_tip(pr):
        n = Network(Sw, [100], 10**9, tip_prune=pr)
        for _ in range(8): n.next_gen(100, 20.0)
        return tip_violations(n) == 0
    gate("G6 tip-spacing prune", t_tip(True), not t_tip(False))
    def t_ceiling(m):
        n = Network(rect(75, 124, 0, 99), [100], 10**9, mut=m); r_ = [n.next_gen(100, 20.0) for _ in range(25)]
        return r_[:24] == ['ok']*24 and r_[24] == 'ceiling'
    gate("G7 numBranch ceiling 24", t_ceiling(()), not t_ceiling(('no_ceiling',)))
    a = Network(S, [pp], DRILL_CAP); b = Network(S, [pp], DRILL_CAP); nv = Network(S, [pp], DRILL_CAP)
    for D in PIPE6_M: a.next_gen(pp, D); nv.next_gen(pp, D)
    for D in PIPE6_M[:-1]: b.next_gen(pp, D)
    a.undo(); nv.clicks.pop()
    gate("G8 undo rebuilds", segs_close(a.segs, b.segs) and a.gens == b.gens, not segs_close(nv.segs, b.segs))
    i_ = reaim_pick(rm['net'], float(t_ref))
    gate("G9 re-aim refusal", ra is not None and reaim(rm['net'], float(t_ref), i_, (20.0, 20.0), rm['reaim_cap']) is None,
         reaim(rm['net'], float(t_ref), i_, (20.0, 20.0), 10**9) is not None)
    F, S = l1_world()
    r5 = play(F, S, [13], [(13, 25.0)], L1_CAP, 25, 25)
    hm, _ = rig_plan(r5['net'].Cs, {0: [default_portal(comps(S)[0])]}, r5['b'])
    gate("G10 Balrog pass 0 at the portal", r5['holes'][0][0][0] == 13, hm[0][0][0] != 13)
    tie = None
    for name in ('GV1', 'GV2', 'GV3', 'GV3b', 'GV4'):
        q = out[name]; L_ = q['length']
        zero = sum(q['b']) == q['budget'] == rhu(L_) and abs(L_ - sum(q['spent'])) <= 0.5 + 1e-9
        if abs(L_ - math.floor(L_) - 0.5) < 1e-9: tie = name
        n_ = q['net']; unpruned = sum(s_['len'] for s_ in n_.segs if s_['gen'] == 0) + sum(
            (2**g)*cells_of(D) for p_ in n_.portals for g, D in enumerate([D for qq, D in n_.clicks if qq == p_], 1))
        gate(f"G11 equal length {name}", zero, q['coredL'] != q['budget'])   # mutant: budget = distinct cells cored on the left
    if tie:
        q = out[tie]
        gate(f"G17 budget half up ({tie}, length {q['length']})", q['budget'] == rhu(q['length']), budgets(q['net'], rnd=round)[0] != q['budget'])
    q1 = play(*pipe_world(), [pp], [(pp, D) for D in PIPE6_M], DRILL_CAP, seed=SEED_PIPE)
    gate("G12 determinism", summary(q1) == summary(out['GV2']),
         summary(play(*pipe_world(), [pp], [(pp, D) for D in PIPE6_M[:-1] + [30.0]], DRILL_CAP, seed=SEED_PIPE)) != summary(out['GV2']))
    hole = {(100, y) for y in range(100)}
    def rings(pf):
        t1 = {}; sparse(hole, t1, SEED_PIPE, 200, 100, pfun=pf); o = {}
        for c in [(x, y) for x in range(88, 113) for y in range(100) if x != 100]:
            o.setdefault(abs(c[0]-100), [0, 0]); o[abs(c[0]-100)][0] += c in t1; o[abs(c[0]-100)][1] += 1
        return {d: round(u/v, 3) for d, (u, v) in sorted(o.items())}
    good = rings(None); badr = rings(lambda r: min(1.0, (r/R0_FULL)**2)); t1z = {}
    print("   single-hole reveal fraction by column distance (cells):", good, "; inverted mutant:", {k: badr[k] for k in (1, 5, 10)})
    mono = lambda g: g[1] >= g[2] > g[5] > g[10] and g[11] == 0
    gate("G13 1/r^2 falloff", sparse(set(), t1z, SEED_PIPE, 200, 100) == 0 and mono(good) and good[1] < 1.0 and abs(good[1] - p_reveal(1.0)) < 0.12, not mono(badr))
    im = imaged([(r, 60, 70) for r in range(100)], 0, 100)
    def t_full(pf):
        t2, t1, sch, _ = rig_sense([[(60, 100), (70, 100)]], seed=SEED_PIPE, pair_falloff=pf)
        return sch == 1 and all(c in t1 for c in im)
    far = rig_sense([[(60, 100), (71, 100)]], seed=SEED_PIPE)[2]
    print("   cross-hole gap 10 (50 m), full-depth pair: imaged", len(im), "cells; gap 11 pairs:", far)
    gate("G14 cross-hole full fidelity", t_full(False) and far == 0, not t_full(True))
    ta, tb, tc = {}, {}, {}
    sparse(hole, ta, SEED_MAIN, 200, 100); sparse(hole, tb, SEED_MAIN, 200, 100); sparse(hole, tc, SEED_MAIN, 200, 100, side=1)
    gate("G15 seeded shared draw", ta == tb, ta != tc)
    # G16 coring: one cell per cell of path, any dBranch, phase carried (A); mutants: per-segment restart, v3.0 half-step
    rates = {D: round(chain_rate([D]*12, 0, "carry"), 4) for D in range(4, 21)}
    frac = [2.5, 4, 4, 4, 4, 4, 4, 4, 4, 4]          # a re-aim segment of 2.5 cells, then integer generations
    r_c, r_r, r_h = chain_rate(frac, 0, "carry"), chain_rate(frac, 0, "restart"), chain_rate([4]*12, 0, "half")
    ang = {d_: round(chain_rate([4]*25, d_, "carry", 20), 3) for d_ in (0, 15, 30, 45, 60)}
    print("   G16 vertical coring rate by dBranch (cells):", sorted(set(rates.values())), "; chain after a 2.5-cell re-aim segment: carry",
          round(r_c, 4), "restart mutant", round(r_r, 4), "; half-step mutant", round(r_h, 3), "; by angle (4-cell chain, 100 cells):", ang)
    def phase_ok(rule):
        A = 0.0; ok_ = True
        for L in frac:
            sample(50.0, 5.0 + A, 0.0, L, lambda c: True, A, rule)
            ok_ = ok_ and all(abs(((A + q) % 1.0) - 0.5) < 1e-9 for q in sample.svals); A += L
        return ok_
    gate("G16 coring rate and carried phase", all(abs(v - 1.0) < 1e-9 for v in rates.values()) and phase_ok("carry"),
         not phase_ok("restart") and abs(r_h - 1.0) > 0.01)
    Sf = rect(25, 174, 40, 59)
    def t_clamp(m):
        n = Network(Sf, [100], 10**9, mut=m); n.next_gen(100, 50.0)
        return sorted(round(s_['dir'], 6) for s_ in n.segs if s_['gen'] == 1) == [-60.0, 60.0]
    print("   flat 750 x 100 m SROI theta:", round(theta_of(comps(Sf)[0]), 2))
    gate("G18 generation-1 clamp", t_clamp(()), not t_clamp(('no_gen1_clamp',)))
    F, S = pipe_world(); clicks = [(pp, D) for D in PIPE6_M]
    st, newp, acc = plan_move_portal(S, [pp], clicks, pp, 99, DRILL_CAP)
    fresh = Network(S, newp, DRILL_CAP)
    for p_, D in acc: fresh.next_gen(p_, D)
    moved_net, _, _ = replay(S, newp, acc, DRILL_CAP)
    stale = Network(S, [pp], DRILL_CAP)
    for D in PIPE6_M: stale.next_gen(pp, D)
    st2, p2, acc2 = plan_remove_portal(S, [pp, 99 if newp != [99] else 110], clicks + [(99 if newp != [99] else 110, 20.0)], pp, DRILL_CAP)
    gate("G19 portal move / remove replay", st == 'ok' and newp == [99] and segs_close(moved_net.segs, fresh.segs) and all(p_ != pp for p_, _ in acc2),
         not segs_close(stale.segs, fresh.segs))
    Sx = rect(10, 30, 60, 99) | rect(60, 80, 5, 30)        # deep component (trunk 60 cells) and a shallow one
    cl = [(70, 100.0)] * 3
    st3, ps3, _ = plan_add_portal(Sx, [70], cl, 20, 50)
    try:
        n_bad = Network(Sx, [20, 70], 50); crashed = False
    except ValueError:
        crashed = True
    print("   add portal over a 300 m trunk with cap 50 cells:", st3, "; meter start", meter_start(Sx, [70]), "cells; unguarded constructor crashes:", crashed)
    gate("G20 add portal: trunk over cap refused, meter starts at trunks", st3 == 'trunk_cap' and ps3 == [70] and meter_start(Sx, [70]) == 5
         and Network(Sx, [70], 50).length() == meter_start(Sx, [70]), crashed)
    arch = archetypes(); sizes = {k: len(v) for k, v in arch.items()}
    print("   archetype areas (cells):", sizes)
    gate("G21 archetypes pass the zero-area floor", all(builds(v) for v in arch.values()),
         not all(builds(v, floor=2000) for k, v in arch.items() if k in ("pipe", "lens", "buried thin lens", "cluster")))
    caps = {k: edge_noise_cap(k) for k in arch}
    # whole = after the worst inward displacement by the cap, the body is still connected (cluster: 3 lenses) and still
    # thicker than 2 cells (erosion by cap + 1 is non-empty); uncapped L6 noise (5 cells) fails that on the thin lens
    whole = lambda k, r: len(eroded(arch[k], r + 1)) > 0 and len(comps(eroded(arch[k], r))) == (3 if k == "cluster" else 1)
    ok_caps = all(whole(k, caps[k]) for k in arch)
    print("   edge-noise caps (cells):", caps, "; thin lens eroded by its cap:", len(eroded(arch["buried thin lens"], caps["buried thin lens"])),
          "cells; by uncapped L6 noise 5:", len(eroded(arch["buried thin lens"], 5)))
    def dilated(F, r):
        offs = [(dx, dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy <= r * r]
        return {(c[0] + dx, c[1] + dy) for c in F for dx, dy in offs}
    grow_ok = all(len(comps(dilated(arch[k], caps[k]))) == (3 if k == "cluster" else 1) for k in arch)
    print("   G22 outward: cluster bodies after dilation by its cap (4):", len(comps(dilated(arch["cluster"], caps["cluster"]))),
          "; by 11 cells (over half the 20-cell gap):", len(comps(dilated(arch["cluster"], 11))))
    gate("G22 edge-noise cap keeps every archetype whole (inward and outward)", ok_caps and grow_ok,
         not whole("buried thin lens", 5) and len(comps(dilated(arch["cluster"], 11))) < 3)
    Fm_, Sm_ = main_world(); gm = play_moves(Fm_, Sm_, dp, [(p, D) for D in MAIN_M for p in dp], DRILL_CAP, (80, 60, 75.0), 90.0, (20.0, 20.0), seed=SEED_MAIN)
    want = GOLD['GV4m']
    got_m = dict(L=gm['L'], R=gm['R'], pairsL=gm['pairsL'], pairsR=gm['pairsR'], endL=round(gm['endL'], 3), endR=round(gm['endR'], 3), seg=gm['seg'], cost=round(gm['cost'], 3))
    print("   GV4m:", got_m, "readout L", pct1(gm['L'][0], 2036), "/", pct1(gm['L'][1], 2036), "/", pct1(sum(gm['L'][:2]), 2036),
          "R", pct1(gm['R'][0], 2036), "/", pct1(gm['R'][1], 2036), "/", pct1(sum(gm['R'][:2]), 2036))
    print(f"   GV4m drilled: left {gm['drilledL']:.3f} cells ({5*gm['drilledL']:.1f} m), right {gm['drilledR']} cells ({5*gm['drilledR']} m)")
    assert abs(gm['drilledL'] - 327.889) < 1e-3 and gm['drilledR'] == 359
    args = (Fm_, Sm_, dp, [(p, D) for D in MAIN_M for p in dp], DRILL_CAP, (80, 60, 75.0), 90.0, (20.0, 20.0))
    def as_gold(g): return dict(L=g['L'], R=g['R'], pairsL=g['pairsL'], pairsR=g['pairsR'], endL=round(g['endL'], 3), endR=round(g['endR'], 3), seg=g['seg'], cost=round(g['cost'], 3))
    muts = {"no moves": play_moves(*args, seed=SEED_MAIN, do_add=False, do_reaim=False), "add only": play_moves(*args, seed=SEED_MAIN, do_reaim=False),
            "re-aim only": play_moves(*args, seed=SEED_MAIN, do_add=False), "click time ignored": play_moves(*args, seed=SEED_MAIN, ignore_click_time=True)}
    print("   G23 mutants:", {k: (v['L'][:2], v['R'][:2], round(v['endR'], 2)) for k, v in muts.items()})
    gate("G23 GV4m round with both moves", got_m == want, all(as_gold(v) != want for v in muts.values()))
    assert [fmt1(x) for x in (43.75, 45.25, 0.05, 0.049)] == ['43.8', '45.3', '0.1', '0.0'] and pct1(0, 0) == "no formation"
    assert [round(u01(*v), 6) for v in [(7919, 5, 4), (7919, 4, 6), (7919, 6, 4), (15838, 40, 20)]] == [0.062413, 0.136708, 0.081696, 0.83714]
    print("gates passed:", len(CK), ":", ", ".join(CK))
