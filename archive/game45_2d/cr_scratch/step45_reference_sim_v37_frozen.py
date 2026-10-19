"""Step 45 reference sim for spec v3.6.1 (cr_scratch/step45_toymaker_spec_v3.md).

5 m cells, grid 200 columns x 100 rows = 1,000 m wide x 500 m deep. Every constant is set in meters and converted to cells
(spec section 2). Goldens GV1, GV1b, GV2, GV3, GV3b, GV4, GV4m, the re-aim case, GV5 and the worst case are the values of
spec section 13 (dict GOLD). Gates G1 to G41 each run the real code as a zero control and a named mutant as the known-bad
case; section 13 maps every rule to its gate. Run: python step45_reference_sim_v3.py (17 to 40 s); --print prints without
asserting. v3.6.1 changed no behavior; it added mutants and checks inside existing gates, embedded the main-round painting
(MAIN_F_RUNS, MAIN_S_RUNS) and relabeled strings.
"""
import math, os, json, random, sys
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN

# ---------------- constants: meters first, then cells (spec section 2) ----------------
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
# ---- v3.7 speed model (spec 2d, 45.10b-3). ZC = zero control: R 10 with legacy travel reproduces goldens_v36 (env S45_ZC=1) ----
ZC = os.environ.get('S45_ZC') == '1'
ENV_MUT = tuple(x for x in os.environ.get('S45_MUT', '').split(',') if x)       # known-bad runs of the speed gates (G58 to G60)
RIG_SPEED_RATIO = 10.0 if ZC else 3.4                  # level field rig_speed_ratio (default 3.4); rig net ROP over the borebot's 1 m/h
TIME_COMP = 0.4 if 'time_comp_wrong' in ENV_MUT else 2.5   # real hours per game second (0.4 game s per real hour)
RIG_TRAVEL_M = 50.0 if ZC else 9000.0                  # rig travel per game s: 1.0 m/s real x 3,600 s/h x 2.5 h per game s (legacy 50 m)
def speeds(R, mut=()):
    """(borebot cells/s, rig drill cells/s): the ratio R applies to the rig only. ratio_on_bot applies it to the borebot."""
    if 'ratio_on_bot' in mut: return R * cells_of(2.5), cells_of(25.0)
    return cells_of(2.5), R * cells_of(2.5)
SPEED_L, RIG_DRILL = speeds(RIG_SPEED_RATIO, ENV_MUT)
RIG_TRAVEL = cells_of(RIG_TRAVEL_M)                    # 1,800 cells/s (9,000 m per game s); 10 cells/s in ZC
RADAR_SECONDS = 3.0
RADAR_MIN_GAP = 2                               # cells (10 m): one cell between the lines
RADAR_RANGE = int(cells_of(50.0))               # 10 cells
GAP_L = GAP_R = RADAR_RANGE
R0_M = 4.0; R0_FULL = cells_of(R0_M)           # Quinn ruling 2026-10-15: r0 = 4 m (0.8 cell)
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
    rule 'restart' (mutant) ignores A0; rule 'half' (mutant) cores every 0.5-step sample."""
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
        self.__dict__.update(fresh.__dict__)
        if 'undo_portal' in self.mut and len(self.portals) > 1: self.portals = self.portals[:-1]   # mutant: undo also removes a portal
        return True
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
def apply_pairs(pairs, tier1, frac=0.2, flags=None, snaps=None, keep=None, stats=None):
    sch = skp = 0
    for i, im in enumerate(pairs):
        tier2 = snaps[i]
        if flags is not None: flags.append(False)
        if not im:
            skp += 1
            if stats is not None: stats.append((0, 0))
            continue
        new = sum(1 for c in im if c not in tier2 and c not in tier1)
        if stats is not None: stats.append((new, len(im)))
        if new/len(im) < frac: skp += 1; continue
        sch += 1
        if flags is not None: flags[-1] = True
        for c in im:
            if c not in tier2 and (keep is None or keep(c)): tier1[c] = 1.0
    return sch, skp
def left_pairs(segs):
    """J: borebot pairs of a layout = x-adjacent cored cells of different segments in a row (gap 2..10 cells). Returns a
    dict key (id_i, id_j) -> dict(rows, ready, im, snap, ids). The list is ordered by id, so position order = id order."""
    rowsets = {}; byrow = {}
    for gid, s in enumerate(segs):
        rs = set()
        for (x, y) in s['cells']:
            rs.add(y); byrow.setdefault(y, {}).setdefault(x, set()).add(gid)
        rowsets[gid] = rs
    pr = {}
    for row, dd in byrow.items():
        cs = sorted(dd)
        for a, b in zip(cs, cs[1:]):
            if b - a < RADAR_MIN_GAP or b - a > GAP_L or dd[a] & dd[b]: continue
            i = min(dd[a]); j = min(dd[b]); pr.setdefault((min(i, j), max(i, j)), []).append((row, a, b))
    out = {}
    for (i, j), rows in pr.items():
        com = rowsets[i] & rowsets[j]; r0 = min(com); D = max(com) - r0 + 1
        ready = max(segs[i]['t'], segs[j]['t'])
        out[(segs[i].get('id', i), segs[j].get('id', j))] = dict(
            rows=rows, ready=ready, im=imaged(rows, r0, D),
            snap={c for q in segs if q['t'] <= ready + 1e-9 for c in q['cells']})
    return out
def left_sense(segs, seed=0, W=W_GRID, H=H_GRID, pfun=None, frozen=None):
    """J: borebot pairs = x-adjacent cored cells of different segments in a row of the final layout, scheduled when the
    later segment completes; skip test against cells cored at that time. frozen: pairs already completed before
    a mid-run action (from left_pairs of the earlier layout) replace the same-key pair of the final layout and are kept
    even when the new layout no longer pairs those rows (revealed cells never un-reveal)."""
    tier2 = {c for s in segs for c in s['cells']}
    pairs = left_pairs(segs)
    for k, v in (frozen or {}).items(): pairs[k] = v
    order = sorted(pairs, key=lambda key: (pairs[key]['ready'], key))
    t1 = {}; flags = []; stats = []
    sch, skp = apply_pairs([pairs[k]['im'] for k in order], t1, flags=flags, snaps=[pairs[k]['snap'] for k in order], stats=stats)
    left_sense.sparse = sparse(tier2, t1, seed, W, H, pfun=pfun)
    left_sense.last = ([pairs[k]['ready'] for k in order], flags, max(s['t'] for s in segs))
    left_sense.detail = (order, [pairs[k]['im'] for k in order], [pairs[k]['ready'] for k in order], flags, stats)
    return tier2, t1, sch, skp
def rig_sense(holes_all, seed=0, W=W_GRID, H=H_GRID, pfun=None, pair_falloff=False, with_sparse=True):
    """Rig pairs form in completion order: a completing hole pairs with its nearest completed neighbor on each side."""
    flat = [h for hs in holes_all for h in hs]
    done = {}; tt = 0.0; pos = flat[0][0] if flat else 0
    for h in flat:
        start = max(tt, h[2] if len(h) > 2 else 0.0); tt = start + abs(h[0]-pos)/RIG_TRAVEL + h[1]/RIG_DRILL; pos = h[0]; done[h[0]] = tt
    holes = sorted((h[0], h[1]) for h in flat); depth = dict(holes)
    tier2 = {(c, r) for c, dp in holes for r in range(dp)}
    lst = []; ready = []; doneset = []; pair_ab = []
    for c in sorted(done, key=lambda c: (done[c], c)):
        lefts = [x for x in doneset if x < c]; rights = [x for x in doneset if x > c]
        for nb in ([max(lefts)] if lefts else []) + ([min(rights)] if rights else []):
            a, b = min(c, nb), max(c, nb)
            if b - a < RADAR_MIN_GAP or b - a > GAP_R: continue
            D = min(depth[a], depth[b]); ready.append(done[c]); pair_ab.append((a, b)); lst.append(imaged([(r, a, b) for r in range(D)], 0, D))
        doneset.append(c)
    t1 = {}; flags = []; stats = []
    snaps = [{(c, r) for c in done if done[c] <= rd + 1e-9 for r in range(depth[c])} for rd in ready]
    keep = None
    if pair_falloff:   # G14 mutant: the 1/r^2 rule applied to cross-hole cells
        keep = lambda c: u01(seed, *c) < p_reveal(min(abs(c[0]-h) for h in depth))
    sch, skp = apply_pairs(lst, t1, flags=flags, snaps=snaps, keep=keep, stats=stats)
    rig_sense.sparse = sparse(tier2, t1, seed, W, H, pfun=pfun) if with_sparse else 0
    rig_sense.last = (ready, flags, tt)
    rig_sense.detail = (pair_ab, lst, ready, flags, stats)
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

# ---- real-hour clock (spec 2d): hours = game s x TIME_COMP; "elapsed N.N h", half up, thousands comma from 1,000 h ----
def clock_h(t, tc=None, mut=()):
    h = float(t) * (TIME_COMP if tc is None else tc)
    return h * 3600.0 if ('clock_in_seconds' in mut or 'clock_in_seconds' in ENV_MUT) else h
def clock_fmt(h, mut=()):
    mut = tuple(mut) + ENV_MUT
    if 'clock_pyfmt' in mut: txt = "%.1f" % h                  # tie to even on the binary value: tick 1 gives 0.2
    else:
        rnd = ROUND_DOWN if ('clock_truncate' in mut or 'clock_trunc' in mut) else ROUND_HALF_UP
        d = Decimal(repr(round(float(h), 9))).quantize(Decimal("0.1"), rounding=rnd)
        txt = f"{d:,}"
    return txt.replace(",", "") if 'clock_no_comma' in mut else txt
def clock_str(t, tc=None, mut=()): return "elapsed " + clock_fmt(clock_h(t, tc, mut), mut) + " h"
def tick_clock_str(n, tc=None, mut=()): return clock_str(n / 10.0, tc, mut)       # display at tick n (0.1 game s per tick)
def rig_end_closed(holes_flat, drill, travel):
    """Closed form of the rig run end: sum(depth) / drill + sum(|delta col|) / travel + one trailing radar pair (3.0 s)."""
    pos = holes_flat[0][0]; dd = 0.0; tr = 0.0
    for h in holes_flat: tr += abs(h[0] - pos); pos = h[0]; dd += h[1]
    return dd / drill + tr / travel + RADAR_SECONDS

# ---------------- mid-run ----------------
def add_hole_depth(S, col, reserve_left):
    ys = [y for (x, y) in S if x == col]
    return min((max(ys) + 1 + int(cells_of(25.0))) if ys else int(cells_of(250.0)), reserve_left)
def reaim_cap(reserve_cells): return math.floor(REAIM_FRAC*reserve_cells)
def seg_frac(q, t): return 0.0 if q['len'] == 0 else max(0.0, min(1.0, (t - q['start'])/(q['len']/SPEED_L)))
def kill_set(segs, t, idx):
    """The re-aimed branch plus every descendant not yet started at t (ids)."""
    kill = {idx}; ch = True
    while ch:
        ch = False
        for q in segs:
            if q['id'] not in kill and q['parent'] in kill and seg_frac(q, t) == 0: kill.add(q['id']); ch = True
    return kill
def reaim_check(net, t, idx, target, segs=None):
    """Input validity: the source branch must be partly drilled at t (0 < f < 1); the target must lie inside the
    grid and not on a cell the side's layout already cores. Returns None when valid, else a refusal code."""
    segs = net.segs if segs is None else segs
    q = {s['id']: s for s in segs}.get(idx)
    if q is None: return 'no_branch'
    f = seg_frac(q, t)
    if f <= 0.0: return 'not_started'
    if f >= 1.0: return 'finished'
    c = (rh(target[0]), rh(target[1]))
    if not (0 <= c[0] < net.W and 0 <= c[1] < net.H): return 'outside'
    if any(c in set(s['cells']) for s in segs): return 'cored'
    return None
def reaim(net, t, idx, target, cap, segs=None):
    """Re-aim of branch idx (an id; a trunk, a grown branch or a re-aimed / regrown branch) at game time t toward target.
    segs = the current layout (default: the planned network). Returns None when no slide-back try fits the cap."""
    segs = net.segs if segs is None else segs; S = net.S
    by = {q['id']: q for q in segs}
    s = by[idx]; f = seg_frac(s, t); kill = kill_set(segs, t, idx)
    refund = s['len']*(1-f) + sum(by[i]['len'] for i in kill if i != idx)
    a = math.radians(s['dir']); cur = (s['sx'] + f*s['len']*math.sin(a), s['sy'] + f*s['len']*math.cos(a))
    SM = {(x+dx, y+dy) for (x, y) in S for dx in range(-REAIM_MASK, REAIM_MASK+1) for dy in range(-REAIM_MASK, REAIM_MASK+1)}
    inG = lambda c: 0 <= c[0] < net.W and 0 <= c[1] < net.H
    ds = net.dlist(s['portal']); th = net.theta[s['portal']]; ngen = len(ds); Acur = s['A0'] + f*s['len']
    def build(tg):
        dx, dy = tg[0]-cur[0], tg[1]-cur[1]; L = math.hypot(dx, dy); d = math.degrees(math.atan2(dx, dy))
        cells, elen, endpt, tr = sample(cur[0], cur[1], d, L, inG, Acur)
        new = [dict(cells=cells, len=elen, dir=d, end=endpt, trunc=False, gen=s['gen'], t=t+elen/SPEED_L, A1=Acur+elen,
                    s=list(sample.svals), sx=cur[0], sy=cur[1], start=t, A0=Acur, plocal=None, portal=s['portal'], comp=s['comp'], D=None)]
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
                    ends.append(ep2)
                    new.append(dict(cells=c2, len=e2, dir=dd, end=ep2, trunc=tr2, gen=g, t=pp['t']+e2/SPEED_L, A1=pp['A1']+e2,
                                    s=list(sample.svals), sx=pp['end'][0], sy=pp['end'][1], start=pp['t'], A0=pp['A1'], plocal=pi,
                                    portal=s['portal'], comp=s['comp'], D=D))
                    nxt.append(len(new)-1)
            front = nxt
        added = sum(q['len'] for q in new)
        return new, added, added - refund
    wanted = build(target)
    for i in range(51):
        aa = 1 - 0.02*i; tg = (cur[0]+(target[0]-cur[0])*aa, cur[1]+(target[1]-cur[1])*aa)
        new, added, cost = build(tg)
        if cost <= cap + 1e-9:
            return dict(new=new, added=added, cost=cost, target=tg, clamped=aa < 1, wantedCost=wanted[2], refund=refund, frm=cur, f=f, idx=idx)
    return None
def reaim_pick(net, t, comp=0, segs=None, include_trunk=False):
    """Test helper: the westmost partly drilled tip of component comp (id)."""
    segs = net.segs if segs is None else segs
    cand = [q for q in segs if q['comp'] == comp and (q['gen'] > 0 or include_trunk) and 0 < seg_frac(q, t) < 1]
    if not cand: return None
    return min(cand, key=lambda q: q['sx'] + seg_frac(q, t)*q['len']*math.sin(math.radians(q['dir'])))['id']
def pick_tip(segs, t, x, y, tol=2.0):
    """UI pick rule: the partly drilled branch whose drilled end lies within tol cells of (x, y); nearest wins,
    ties to the lower id."""
    best = None
    for q in segs:
        f = seg_frac(q, t)
        if not (0 < f < 1): continue
        a = math.radians(q['dir']); px = q['sx'] + f*q['len']*math.sin(a); py = q['sy'] + f*q['len']*math.cos(a)
        d = math.hypot(px - x, py - y)
        if d <= tol and (best is None or (d, q['id']) < best): best = (d, q['id'])
    return None if best is None else best[1]

# ---------------- round driver ----------------
def apply_reaim(net, t, idx, ra, segs=None):
    """Layout after a re-aim at time t: the killed subtree removed, the re-aimed branch cut at f (finishes at t), the new
    straight segment and its regrowth appended with full fields (id, parent, portal, comp, sx, sy, start, A0, A1, s), so a
    later re-aim of any of them has a reference behaviour. List order = id order."""
    segs0 = net.segs if segs is None else segs
    kill = kill_set(segs0, t, idx); out = []
    nid = max(q['id'] for q in segs0) + 1
    for q in segs0:
        if q['id'] in kill and q['id'] != idx: continue
        qq = dict(q)
        if q['id'] == idx:
            f = ra['f']; keep = [j for j, v in enumerate(q['s']) if v <= f * q['len'] + 1e-9]
            qq.update(cells=[q['cells'][j] for j in keep], s=[q['s'][j] for j in keep], len=f * q['len'], t=t, trunc=False,
                      end=ra['frm'], A1=q['A0'] + f * q['len'])
        out.append(qq)
    ids = []
    for k, n_ in enumerate(ra['new']):
        d = dict(n_); d['id'] = nid + k; ids.append(d['id'])
        d['parent'] = idx if d.pop('plocal') is None else ids[n_['plocal']]
        out.append(d)
    return out
def frozen_pairs(layout, t):
    """Pairs of the layout in force before an action that are complete (ready <= t): they stay as revealed."""
    return {k: v for k, v in left_pairs(layout).items() if v['ready'] <= t + 1e-9}
def play_moves(F, S, portals, clicks, cap, add, reaim_at, target, seed=0, W=W_GRID, H=H_GRID, do_add=True, do_reaim=True, ignore_click_time=False, no_freeze=False):
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
    frozen = frozen_pairs(net.segs, reaim_at) if (do_reaim and not no_freeze) else None
    t2, t1, schL, _ = left_sense(segs1, seed=seed, W=W, H=H, frozen=frozen); endL = run_end(left_sense.last)
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
MAIN_F_RUNS = ("5:5-8 6:6-9 7:6-10 8:7-10 9:8-11 10:8-10 11:8-11 12:8-11 13:9-12 14:9-12 15:10-13 16:11-13 17:11-14 18:12-14 19:12-15 20:12-15 "
               "21:13-16 22:13-17 23:14-17 24:14-17 25:14-17 26:15-18 27:15-18 28:15-19 29:16-20 30:17-21 31:17-21 32:18-21 33:19-22 34:19-22 "
               "35:19-23 36:20-23 37:20-23 38:21-24 39:21-24 40:21-25 41:21-25 42:22-26 43:22-26 44:23-26 45:24-27 50:26-27 51:25-28 52:24-28 "
               "53:24-29 54:23-30 55:23-30 56:23-30 57:23-30 58:23-31 59:22-30 60:23-31 61:22-30 62:23-30 63:22-30 64:23-30 65:23-30 66:23-30 "
               "67:23-30 68:24-29 69:24-29 70:25-28 71:26-27")
MAIN_S_RUNS = ("4:5-8 5:4-9 6:3-10 7:3-10 8:3-10 9:4-10 10:4-10 11:5-11 12:6-11 13:6-12 14:7-13 15:7-13 16:7-14 17:7-15 18:7-15 19:8-16 "
               "20:8-16 21:8-16 22:9-16 23:9-17 24:10-17 25:11-17 26:11-17 27:12-18 28:13-18 29:13-19 30:13-20 31:14-20 32:14-21 33:14-21 "
               "34:14-22 35:14-22 36:15-23 37:15-23 38:16-23 39:16-23 40:17-23 41:18-23 42:18-23 43:19-22 48:24-25 49:22-27 50:21-28 51:21-28 "
               "52:21-29 53:21-30 54:21-30 55:21-30 56:21-31 57:21-31 58:21-31 59:21-31 60:21-31 61:21-30 62:21-30 63:21-30 64:21-29 65:21-29 "
               "66:21-28 67:22-27 68:24-25")
def _runs(txt):
    out = set()
    for tok in txt.split():
        c, r = tok.split(":"); a, b = r.split("-")
        out |= {(int(c), y) for y in range(int(a), int(b) + 1)}
    return out
def main_world():
    """Main-round painting (spec 9d): a painting on an 80 x 40 grid of 12.5 m cells, given as one vertical run per column
    (column:first row-last row, inclusive), resampled to 5 m cells: new cell (i, j) is in when the old cell
    (floor((5i + 2.5) / 12.5), floor((5j + 2.5) / 12.5)) is in. A center exactly on an old cell boundary goes to the higher old cell."""
    Fo, So = _runs(MAIN_F_RUNS), _runs(MAIN_S_RUNS)
    up = lambda old: {(i, j) for i in range(W_GRID) for j in range(H_GRID) if (int((5*i+2.5)//12.5), int((5*j+2.5)//12.5)) in old}
    return up(Fo), up(So)
L1_CLICKS_M = [25.0, 20.0]
PIPE6_M = [100.0, 75.0, 50.0, 50.0, 35.0, 25.0]
PIPE24_M = [100, 75, 50, 50, 40, 40, 30, 30, 25, 25] + [20]*14
MAIN_M = [75.0, 50.0, 35.0, 25.0]
L1_CAP = int(cells_of(375.0))   # 75 cells, test world only

# ---------------- K1: archetype builders at their minimum sizes (5 m cells) and the zero-area floor ----------------
F_FLOOR = 500     # cells = 12,500 m2 (12,500 m2)
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

GOLD = {   # spec v3.6.1 section 13; frozen from the 2026-10-15 run (python step45_reference_sim_v3.py --print)
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
    'GV4m': dict(L=(139, 353, 2036), R=(75, 194, 2036), pairsL=28, pairsR=5, endL=192.0, endR=97.6, seg=6, cost=29.389),   # endR re-pointed below (A-SIM1)
    'GV5': (24, 'ceiling', 2085),
    'worst': (103, 5321),
}
# A-SIM1: rig end times. v36 = R 10 + legacy travel (ZC). v37 = R 3.4 + travel 1,800 cells/s (9,000 m per game s). Values rounded to 3 decimals
# as summary() reports them; G58 checks the unrounded values at 1e-6 against ENDR_V37.
ENDR_V37 = dict(GV1=23.002778, GV1b=28.299118, GV2=152.420098, GV3=241.30634, GV3b=247.30634, GV4=178.957908, GV4m=214.294248)
if ZC:
    GOLD['GV4m']['endR'] = 97.6
else:
    for _k, _v in ENDR_V37.items(): GOLD[_k]['endR'] = round(_v, 3)

# ================= level data, generator, paint, repaint, advisor, mid-run round =================
# Everything below is reference behaviour for spec sections 3, 4, 6, 7, 8. Existing goldens are untouched.

# ---- constants moved into the sim (Manager: 25 m cover, re-aim target) ----
COVER_M = 25.0                                   # barren surface cover default (Quinn: 25 m), per level via barren_rows
BARREN_ROWS_DEFAULT = int(cells_of(COVER_M))     # 5 rows
DRILL_CAP_M_DEFAULT = 2000.0                     # Quinn: default per-level drill cap
REAIM_TARGET = (20.0, 20.0)                      # cells = (100 m, 100 m): the storyboard demonstration re-aim target
REAIM_LIMIT, ADD_LIMIT = 5, 6
ADD_MIN_RESERVE = 2                              # cells (10 m): an add hole is refused under this much reserve
TICK_S = 0.1                                     # fixed simulation tick, game seconds
ADVISOR_COOLDOWN_S, ADVISOR_CAP = 12.0, 4        # per side, game seconds / pop-ups per run
P2_SEEN_FRAC = 0.80                              # P2: more than this share of a pair's footprint already seen
P5_NEW_FRAC = 0.20                               # P5 / skip test: fewer new cells than this share
BODY_SEP = 15                                    # cells (75 m): clear gap between two bodies of one level
RESEED_MAX = 16
NOISE_LATTICE = 8                                # cells (40 m)
PIX_FLOOR = 12                                   # px, UI pick tolerance floor (spec text only)

def to_tick(t, mut=()): return int(round(t * 10.0)) if 'tick_nearest' in mut else math.floor(round(t * 10.0, 6))
def ticks_due(wall_s, speed, mut=()): return math.floor(round(wall_s * speed * (10 if 'ticks_x10' in mut else 100), 6))   # 1x = 100 ticks per wall second
def cell_of(v, mut=()): return math.floor(v + 0.5) if 'no_snap' in mut else rh(v)
def tick_time(n): return n / 10.0
def plan_cap(level, mut=()):
    """Drill cap in cells, read from level data (G24); the 'hardcode_cap' mutant ignores the level."""
    return DRILL_CAP if 'hardcode_cap' in mut else int(round(level['drill_cap_m'] / CELL_M))
def barren_rows_of(level, mut=()):
    return BARREN_ROWS_DEFAULT if 'hardcode_barren' in mut else level['barren_rows']

# ---- level table (meters in, cells out); one function derives cells ----
# A body spec: kind and inclusive (lo, hi) cell ranges. 'options' picks one body at random (draw 15 of slot 0).
LEVEL_ROWS = {
    1: dict(name="Layer or shallow lens", bodies=[dict(options=[dict(kind='flat', t=(20, 30), w=(120, 160), y0=(20, 40)),
                                                                 dict(kind='lens', a=(35, 35), b=(12, 13), cy=(20, 24))])],
            reveal_s=8.0, peeks=2, landmark_step_m=50.0, edge_noise_m=0.0, cap_frac=0.25),
    2: dict(name="Kimberlite pipe", bodies=[dict(kind='pipe', w=(12, 12), top=(15, 25))],
            reveal_s=7.0, peeks=1, landmark_step_m=50.0, edge_noise_m=0.0, cap_frac=0.25),
    3: dict(name="Thick dipping layer", bodies=[dict(kind='dip', t=(20, 26), w=(120, 120), y0=(5, 15))],
            reveal_s=6.0, peeks=1, landmark_step_m=100.0, edge_noise_m=6.25, cap_frac=0.20),
    4: dict(name="Thin dipping layer + lens", bodies=[dict(kind='dip', t=(12, 13), w=(80, 80), y0=(10, 30)),
                                                       dict(kind='lens', a=(35, 35), b=(12, 13), cy=(30, 45))],
            reveal_s=5.0, peeks=0, landmark_step_m=100.0, edge_noise_m=12.5, cap_frac=0.20),
    5: dict(name="Cluster of three", bodies=[dict(kind='cluster', a=(15, 15), b=(7, 8), gap=(20, 35), cy=(30, 50))],
            reveal_s=4.0, peeks=0, landmark_step_m=100.0, edge_noise_m=18.75, cap_frac=0.15),
    6: dict(name="Buried thin lens + offset pipe", bodies=[dict(kind='thin', a=(45, 45), b=(5, 5), cy=(65, 75)),
                                                            dict(kind='pipe', w=(12, 12), top=(15, 30))],
            reveal_s=3.5, peeks=0, landmark_step_m=200.0, edge_noise_m=25.0, cap_frac=0.12),
}
ARCH_NAME = {'lens': 'lens', 'dip': 'dipping layer', 'pipe': 'pipe', 'cluster': 'cluster', 'thin': 'buried thin lens', 'flat': 'flat layer'}
def level_cells(m): return rhu(m / CELL_M)
def _specs(row):
    out = []
    for b in row['bodies']:
        out.extend(b['options'] if 'options' in b else [b])
    return out
def _bottom_row(sp):
    k = sp['kind']
    if k in ('pipe',): return H_GRID - 1
    if k == 'lens' or k == 'thin': return sp['cy'][1] + sp['b'][1]
    if k == 'flat': return sp['y0'][1] + sp['t'][1] - 1
    if k == 'dip': return sp['y0'][1] + math.ceil(sp['w'][1] * math.tan(math.radians(25.0))) + sp['t'][1]
    if k == 'cluster': return sp['cy'][1] + sp['b'][1]
def _lat_width(sp):
    k = sp['kind']
    if k in ('lens', 'thin'): return 2 * sp['a'][0]
    if k == 'cluster': return 2 * sp['a'][0]
    if k in ('flat', 'dip', 'pipe'): return sp['w'][0]
def make_level(i):
    r = LEVEL_ROWS[i]; specs = _specs(r)
    top = max(_bottom_row(s) for s in specs)
    lv = dict(level_id=i, name=r['name'], W=W_GRID, H=H_GRID, bodies=r['bodies'], reveal_s=r['reveal_s'], fade_s=2.0, peeks=r['peeks'],
              landmark_step_m=r['landmark_step_m'], edge_noise_m=r['edge_noise_m'], edge_noise_cells=level_cells(r['edge_noise_m']),
              cap_frac=r['cap_frac'], drill_cap_m=DRILL_CAP_M_DEFAULT, barren_rows=BARREN_ROWS_DEFAULT, rig_speed_ratio=RIG_SPEED_RATIO, seed_step=7919,
              max_depth_rows=min(H_GRID, 5 * math.ceil((top + 1) / 5)), w_min_cells=min(_lat_width(s) for s in specs))
    lv['expected_bodies'] = sum(3 if (b['options'][0]['kind'] if 'options' in b else b['kind']) == 'cluster' else 1 for b in r['bodies'])
    return lv
LEVELS = {i: make_level(i) for i in LEVEL_ROWS}
TEST_LEVELS = {   # debug levels that carry the goldens; same schema
    'gv1': dict(level_id=0, name="GV1 test world", W=25, H=25, drill_cap_m=375.0, barren_rows=5, rig_speed_ratio=RIG_SPEED_RATIO, max_depth_rows=25, w_min_cells=10, seed=SEED_L1),
    'pipe': dict(level_id=2, name="GV2 pipe world", W=W_GRID, H=H_GRID, drill_cap_m=2000.0, barren_rows=5, rig_speed_ratio=RIG_SPEED_RATIO, max_depth_rows=100, w_min_cells=12, seed=SEED_PIPE),
    'main': dict(level_id=4, name="GV4 main round", W=W_GRID, H=H_GRID, drill_cap_m=2000.0, barren_rows=5, rig_speed_ratio=RIG_SPEED_RATIO, max_depth_rows=85, w_min_cells=70, seed=SEED_MAIN),
}

# ---- formation generator (spec section 8) ----
def gu(seed, a, b=0): return u01(seed, 1000 + a, b)              # generator draws never collide with cell draws (x >= 1000)
def gdraw(seed, a, lo, hi, b=0): return lo + int(gu(seed, a, b) * (hi - lo + 1))
def _ellipse_b(cx, cy, a, b):
    return {(x, y) for x in range(max(0, cx - a), min(W_GRID, cx + a + 1)) for y in range(max(0, cy - b), min(H_GRID, cy + b + 1))
            if ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1.0}
def _layer(t, dip, x0, x1, y0):
    tn = math.tan(math.radians(dip))
    return {(x, y) for x in range(x0, x1 + 1) for y in range(H_GRID) if 0 <= y - (y0 + (x - x0) * tn) < t}
def _shape(seed, k, sp):
    """Draw the vertical and size parameters of body k; return (xs, rows, builder(x0)) where xs = bbox width."""
    j = 16 * k
    kind = sp['kind']
    if kind in ('lens', 'thin'):
        a = gdraw(seed, j + 1, *sp['a']); b = gdraw(seed, j + 2, *sp['b']); cy = gdraw(seed, j + 3, *sp['cy'])
        return 2 * a + 1, (cy - b, cy + b), (lambda x0: _ellipse_b(x0 + a, cy, a, b)), dict(a=a, b=b, cy=cy)
    if kind == 'flat':
        t = gdraw(seed, j + 1, *sp['t']); w = gdraw(seed, j + 2, *sp['w']); y0 = gdraw(seed, j + 3, *sp['y0'])
        return w, (y0, y0 + t - 1), (lambda x0: {(x, y) for x in range(x0, x0 + w) for y in range(y0, y0 + t)}), dict(t=t, w=w, y0=y0)
    if kind == 'dip':
        t = gdraw(seed, j + 1, *sp['t']); w = gdraw(seed, j + 2, *sp['w']); y0 = gdraw(seed, j + 3, *sp['y0'])
        drop = int(math.ceil((w - 1) * math.tan(math.radians(25.0)))) + t
        return w, (y0, min(H_GRID - 1, y0 + drop)), (lambda x0: _layer(t, 25.0, x0, x0 + w - 1, y0)), dict(t=t, w=w, y0=y0)
    if kind == 'pipe':
        w = gdraw(seed, j + 1, *sp['w']); top = gdraw(seed, j + 2, *sp['top'])
        return w, (top, H_GRID - 1), (lambda x0: {(x, y) for x in range(x0, x0 + w) for y in range(top, H_GRID)}), dict(w=w, top=top)
    if kind == 'cluster':
        a = gdraw(seed, j + 1, *sp['a']); b = gdraw(seed, j + 2, *sp['b'])
        g1 = gdraw(seed, j + 3, *sp['gap']); g2 = gdraw(seed, j + 4, *sp['gap'])
        cy1, cy2, cy3 = (gdraw(seed, j + 5 + q, *sp['cy']) for q in range(3))
        xs = 3 * (2 * a + 1) + g1 + g2
        def build(x0):
            c1 = x0 + a; c2 = c1 + 2 * a + g1; c3 = c2 + 2 * a + g2
            return _ellipse_b(c1, cy1, a, b) | _ellipse_b(c2, cy2, a, b) | _ellipse_b(c3, cy3, a, b)
        return xs, (min(cy1, cy2, cy3) - b, max(cy1, cy2, cy3) + b), build, dict(a=a, b=b, g=(g1, g2), cy=(cy1, cy2, cy3))
    raise ValueError(kind)
def _clear(A, B, sep=None):
    dx = max(A[0] - B[1], B[0] - A[1]) - 1; dy = max(A[2] - B[3], B[2] - A[3]) - 1
    return max(dx, dy) >= (BODY_SEP if sep is None else sep)
def _noise_field(seed, k, N):
    G = NOISE_LATTICE; cache = {}
    def lat(i, j):
        v = cache.get((i, j))
        if v is None: v = N * (2.0 * gu(seed, 200 + k, i * 512 + j) - 1.0); cache[(i, j)] = v
        return v
    def n(x, y):
        i, j = x // G, y // G; fx, fy = (x % G) / G, (y % G) / G
        sx = fx * fx * (3.0 - 2.0 * fx); sy = fy * fy * (3.0 - 2.0 * fy)
        v = (lat(i, j) * (1.0 - sx) + lat(i + 1, j) * sx) * (1.0 - sy) + (lat(i, j + 1) * (1.0 - sx) + lat(i + 1, j + 1) * sx) * sy
        return math.floor(v * 64.0 + 0.5) / 64.0
    return n
def apply_edge_noise(F0, N, nf):
    """Boundary displacement by the signed-distance rule: an inside cell with n < 0 survives iff its distance to the
    nearest outside cell is more than |n|; an outside cell with n > 0 joins iff its distance to the nearest inside cell
    is at most n. |n| <= N, so eroded(F0, N) <= F' <= dilated(F0, N) (the G22 worst cases bound every draw)."""
    if N == 0: return set(F0)
    offs = sorted((dx * dx + dy * dy, dx, dy) for dx in range(-N, N + 1) for dy in range(-N, N + 1) if 0 < dx * dx + dy * dy <= N * N)
    core = eroded(F0, N); out = set(core); din = {}
    for c in F0:
        if c in core: continue
        n = nf(c[0], c[1])
        d2 = None
        for q, dx, dy in offs:
            cc = (c[0] + dx, c[1] + dy)
            if cc not in F0:
                d2 = q; break
        if n >= 0 or d2 > n * n: out.add(c)
        for q, dx, dy in offs:
            cc = (c[0] + dx, c[1] + dy)
            if cc not in F0 and 0 <= cc[0] < W_GRID and 0 <= cc[1] < H_GRID and q < din.get(cc, 10 ** 9): din[cc] = q
    for cc, q in din.items():
        n = nf(cc[0], cc[1])
        if n > 0 and q <= n * n: out.add(cc)
    return out
class BuildError(Exception): pass
def build_attempt(level, seed, noise_on=True, mut=()):
    """One seed: draw every body's shape, place the bodies in order (each x0 drawn uniformly among the positions that clear
    the earlier bodies by BODY_SEP and leave room for the later ones), apply capped edge noise per body, drop specks.
    Returns (F, F0, info), or None when no placement clears (the attempt fails like a floor failure)."""
    shapes = []
    for k, b in enumerate(level['bodies']):
        sp = b['options'][gdraw(seed, 15, 0, len(b['options']) - 1)] if 'options' in b else b
        shapes.append((sp,) + _shape(seed, k, sp))
    def positions(k, boxes):
        sp, xs, rows, build, prm = shapes[k]
        out = []
        for x0 in range(5, 194 - xs + 2):
            bx = (x0, x0 + xs - 1, rows[0], rows[1])
            if all(_clear(bx, o, -999 if 'nosep' in mut else BODY_SEP) for o in boxes) and (k + 1 == len(shapes) or positions(k + 1, boxes + [bx])): out.append(x0)
        return out
    boxes = []; F0 = set(); F = set(); info = []
    for k, (sp, xs, rows, build, prm) in enumerate(shapes):
        allowed = positions(k, boxes)
        if not allowed: return None
        x0 = allowed[int(gu(seed, 16 * k + 8) * len(allowed))]
        boxes.append((x0, x0 + xs - 1, rows[0], rows[1]))
        cells = build(x0); F0 |= cells
        cap = edge_noise_cap(ARCH_NAME[sp['kind']])
        N = 0 if not noise_on else (level['edge_noise_cells'] if 'uncapped' in mut else min(level['edge_noise_cells'], cap))
        nf = _noise_field(seed, k, N) if N else None
        Fk = apply_edge_noise(cells, N, nf) if N else set(cells)
        F |= Fk; info.append(dict(kind=sp['kind'], x0=x0, N=N, cap=cap, **prm))
    keep = set()
    for C in comps(F):
        if len(C) >= STRAY_MIN_AREA: keep |= set(C)
    return keep, F0, info
def gen_level(level, variant=0, floor=F_FLOOR, accept=None, mut=(), max_reseeds=RESEED_MAX):
    """Spec section 8: seed = level_id x 7919 + variant. A draw that fails (no clear placement, area under floor, wrong
    body count) re-seeds with variant + 1, up to 16 times; after 16 failed re-seeds the level builds from the first seed
    with edge noise 0."""
    for k in range(max_reseeds + 1):
        seed = level['level_id'] * level['seed_step'] + variant + k
        r = build_attempt(level, seed, True, mut)
        if r is not None:
            F, F0, info = r
            ok = len(F) >= floor and len(comps(F)) == level['expected_bodies']
            if accept is not None: ok = accept(F, k)
            if ok: return dict(F=F, F0=F0, seed=seed, variant=variant + k, reseeds=k, noise_zero=False, info=info)
    seed = level['level_id'] * level['seed_step'] + variant
    r = build_attempt(level, seed, False, mut)
    if r is None or len(r[0]) < F_FLOOR: raise BuildError("level %s variant %s" % (level['level_id'], variant))
    return dict(F=r[0], F0=r[1], seed=seed, variant=variant, reseeds=max_reseeds + 1, noise_zero=True, info=r[2])

# ---- paint rules (spec section 4) ----
BRUSH_R = (2, 5, 8, 12, 20)
def brush_cells(cx, cy, r, W=W_GRID, H=H_GRID):
    """Disc: cell (x, y) is in when (x - cx)^2 + (y - cy)^2 <= r^2 (inclusive), clipped to the grid."""
    return [(x, y) for x in range(cx - r, cx + r + 1) for y in range(cy - r, cy + r + 1)
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r and 0 <= x < W and 0 <= y < H]
def stroke_centers(pts):
    """Pointer path (cell units) sampled every 0.5 cell; each sample's center cell = (floor x, floor y); repeats dropped."""
    out = []
    seg = list(zip(pts, pts[1:])) if len(pts) > 1 else [(pts[0], pts[0])]
    for (x0, y0), (x1, y1) in seg:
        n = max(1, math.ceil(math.hypot(x1 - x0, y1 - y0) / 0.5))
        for i in range(n + 1):
            c = (math.floor(x0 + (x1 - x0) * i / n), math.floor(y0 + (y1 - y0) * i / n))
            if not out or out[-1] != c: out.append(c)
    return out
class Painter:
    """S, the paint cap and the undo stack (20 strokes; Fill and Clear each count as one stroke; no redo)."""
    def __init__(self, cap_cells, W=W_GRID, H=H_GRID, mut=()):
        self.S = set(); self.cap = cap_cells; self.W = W; self.H = H; self.undo_stack = []; self.mut = set(mut)
    def _push(self, before):
        self.undo_stack.append(before)
        if len(self.undo_stack) > 20: self.undo_stack.pop(0)
    def stroke(self, pts, r, erase=False):
        before = frozenset(self.S)
        for (cx, cy) in stroke_centers(pts):
            cells = brush_cells(cx, cy, r, self.W, self.H)
            if 'r2_exclusive' in self.mut: cells = [c for c in cells if (c[0] - cx) ** 2 + (c[1] - cy) ** 2 < r * r]
            if erase: self.S -= set(cells); continue
            for c in sorted(cells, key=lambda c: ((c[0] - cx) ** 2 + (c[1] - cy) ** 2, c[1], c[0])):
                if c in self.S: continue
                if len(self.S) >= self.cap: break
                self.S.add(c)
        if frozenset(self.S) != before: self._push(before)
    def fill(self, cell):
        if cell in self.S or not (0 <= cell[0] < self.W and 0 <= cell[1] < self.H): return 'noop'
        reg = {cell}; st = [cell]
        while st:
            x, y = st.pop()
            for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nb[0] < self.W and 0 <= nb[1] < self.H and nb not in self.S and nb not in reg: reg.add(nb); st.append(nb)
        if any(x in (0, self.W - 1) or y in (0, self.H - 1) for x, y in reg): return 'refused_edge'
        if len(self.S) + len(reg) > self.cap: return 'refused_cap'
        self._push(frozenset(self.S)); self.S |= reg; return 'ok'
    def clear(self):
        if self.S: self._push(frozenset(self.S)); self.S = set()
    def undo(self):
        if not self.undo_stack: return False
        self.S = set(self.undo_stack.pop()); return True
def done_painting(S):
    """Done painting: components under 50 cells dissolve; blocked when nothing is left or more than 3 components remain."""
    keep = set()
    for C in comps(S):
        if len(C) >= STRAY_MIN_AREA: keep |= set(C)
    if not keep: return 'empty', keep
    if len(comps(keep)) > 3: return 'too_many', keep
    return 'ok', keep

# ---- Back to paint: portal re-snap (spec section 4b item 11) ----
def repaint_portals(Snew, portals, clicks, mut=()):
    """Portals and click stack after S changed. Re-snap each portal to the nearest S column (ties lower); drop a portal that
    falls under 5 cells from a kept one (left to right, so the right one goes); add a default portal for every unserved
    component; if more than 3 portals remain, drop the rightmost portal of a component that holds two or more. The
    click stack follows the re-snapped portal; clicks of a dropped portal leave the stack."""
    if 'keep' in mut: return list(portals), list(clicks), [], []
    mp = {}; kept = []; dropped = []
    for p in sorted(portals):
        c = snap_portal(Snew, p)
        if c is None or any(abs(c - q) < PORTAL_MIN_SEP for q in kept): dropped.append(p); continue
        mp[p] = c; kept.append(c)
    Cs = comps(Snew); added = []
    def serves(ps): return {portal_comp(Cs, Snew, q)[0] for q in ps}
    for i, C in enumerate(Cs):
        if i in serves(kept): continue
        cols = sorted({x for x, y in C}, key=lambda x: (abs(x - default_portal(C)), x))
        c = next((x for x in cols if all(abs(x - q) >= PORTAL_MIN_SEP for q in kept)), default_portal(C))
        kept.append(c); added.append(c)
    while len(kept) > MAX_PORTALS:
        by = {}
        for q in kept: by.setdefault(portal_comp(Cs, Snew, q)[0], []).append(q)
        victim = max(max(v) for v in by.values() if len(v) > 1)
        kept.remove(victim); dropped.append(victim)
        mp = {k: v for k, v in mp.items() if v != victim}; added = [a for a in added if a != victim]
    kept = sorted(kept)
    clk = [(mp[p], D) for p, D in clicks if p in mp and mp[p] in kept]
    return kept, clk, dropped, added

# ---- readout strings (spec section 9) ----
def fmt_m(cells):
    """Meters from cells, 1 decimal half up, thousands comma: 327.889 cells -> '1,639.4'."""
    d = Decimal(repr(round(float(cells) * CELL_M, 6))).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return f"{d:,}"
def readout(counts):
    c, i, n = counts
    return dict(intersected=pct1(c, n), imaged=pct1(i, n), total=pct1(c + i, n))

# ---- advisor (spec section 7): public information only ----
VEX_LINES = {
    1: "Captain, it would be better to take a core sample over there.",
    2: "Fascinating. You have measured the same rock twice, with great precision.",
    3: "Captain, this location has been sampled. Sampling it again is not science, it is a hobby.",
    4: "The probability that this hole is in a useful place is, by my calculation, indistinguishable from the probability that it contains cheese.",
    5: "Captain, may I suggest a core in the unexplored area? It is where the unexplored things are.",
    6: "I have observed that rock does not become more interesting the second time it is drilled.",
    7: "Logically, a hole this close to its neighbor is a very expensive way to confirm that rock is rock.",
    8: "Captain, the radar is pointing at ground that the radar has already seen. It has no new opinions.",
    9: "Your hole is a bold artistic statement. The geology of this region has declined to participate.",
    10: "Captain, there are {n} cells in your region that nobody has looked at. They feel neglected.",
    11: "May I recommend that the next hole go where the last one did not?",
    12: "Captain, I have run the numbers twice. They said the same thing, which is the only reliable behavior numbers have.",
    13: "Captain, a core sample at {spot} would tell us more.",
    14: "Captain, {spot} is unexplored. I find that statistically attractive.",
    15: "Captain, may I direct your attention to the marked spot, {spot}? It has been waiting patiently.",
}
VEX_MAP = {'P1': (3, 6, 7), 'P2': (2, 3, 8), 'P3': (4, 9), 'P4': (9, 11), 'P5': (5, 8, 12)}
VEX_ANY = (1, 10, 13, 14, 15)
VEX_SPOT_LINES = (13, 14, 15)
def rig_timeline(holes_all):
    flat = [h for hs in holes_all for h in hs]; tt = 0.0; pos = flat[0][0] if flat else 0; out = []
    for h in flat:
        start = max(tt, h[2] if len(h) > 2 else 0.0); td = start + abs(h[0] - pos) / RIG_TRAVEL; t1 = td + h[1] / RIG_DRILL
        out.append(dict(col=h[0], depth=h[1], start=start, td=td, t1=t1)); tt = t1; pos = h[0]
    return out
def _pair_done_cells(lst, ready, flags, t):
    out = set(); free = 0.0
    for rd, fl, im in sorted(zip(ready, flags, lst), key=lambda z: z[0]):
        if fl:
            free = max(rd, free) + RADAR_SECONDS
            if free <= t + 1e-9: out |= set(im)
    return out
def observed_right(holes_all, t, seed, W=W_GRID, H=H_GRID):
    """Cells the right side has revealed at game time t: cored so far, pairs finished, speckle of finished holes."""
    rig_sense(holes_all, seed=seed, W=W, H=H)
    pair_ab, lst, ready, flags, stats = rig_sense.detail
    seen = set(); done = set()
    for h in rig_timeline(holes_all):
        if t >= h['td']:
            dd = h['depth'] if t >= h['t1'] else min(h['depth'], int((t - h['td']) * RIG_DRILL + 1e-9))
            seen |= {(h['col'], y) for y in range(dd)}
        if t >= h['t1'] - 1e-9: done |= {(h['col'], y) for y in range(h['depth'])}
    seen |= _pair_done_cells(lst, ready, flags, t)
    t1s = {}; sparse(done, t1s, seed, W, H); seen |= set(t1s)
    return seen
def observed_left(layout, t, seed, W=W_GRID, H=H_GRID, frozen=None):
    left_sense(layout, seed=seed, W=W, H=H, frozen=frozen)
    order, lst, ready, flags, stats = left_sense.detail
    seen = set(); done = set()
    for q in layout:
        f = seg_frac(q, t)
        if f > 0: seen |= {c for c, v in zip(q['cells'], q['s']) if v <= f * q['len'] + 1e-9}
        if q['t'] <= t + 1e-9: done |= set(q['cells'])
    seen |= _pair_done_cells(lst, ready, flags, t)
    t1s = {}; sparse(done, t1s, seed, W, H); seen |= set(t1s)
    return seen
def unseen_region(S, seen):
    """Largest 4-connected part of S that is unseen; ties to the smallest (x, y) cell."""
    left = {c for c in S if c not in seen}; best = []
    while left:
        c0 = min(left); st = [c0]; left.discard(c0); comp = []
        while st:
            q = st.pop(); comp.append(q)
            for nb in ((q[0] + 1, q[1]), (q[0] - 1, q[1]), (q[0], q[1] + 1), (q[0], q[1] - 1)):
                if nb in left: left.discard(nb); st.append(nb)
        if len(comp) > len(best): best = comp
    return best
def advisor_spot(side, S, seen, holes_all=None, reserve_left=None):
    """Vex {spot}: centroid (cx, cy) of the largest unseen 4-connected part of S on that side. Right: the S column nearest
    to cx (ties lower) that is at least 2 columns from every existing or queued hole and where a default-depth hole
    would schedule at least one radar pair; text 'surface column c (x = 5c m)'. Left: the cell of that region nearest the
    centroid (ties lower (x, y)); text 'x = 5x m, 5y m deep'. None when no feasible spot exists."""
    reg = unseen_region(S, seen)
    if not reg: return None
    cx = sum(c[0] for c in reg) / len(reg); cy = sum(c[1] for c in reg) / len(reg)
    if side == 'L':
        c = min(reg, key=lambda c: (math.hypot(c[0] - cx, c[1] - cy), c[0], c[1]))
        return dict(side='L', cell=c, text="x = %d m, %d m deep" % (5 * c[0], 5 * c[1]), n_region=len(reg), centroid=(cx, cy))
    taken = [h[0] for hs in holes_all for h in hs]
    cols = sorted({x for x, y in S}, key=lambda x: (abs(x - cx), x))
    for c in cols:
        if any(abs(c - q) < 2 for q in taken): continue
        dep = add_hole_depth(S, c, reserve_left if reserve_left is not None else 10 ** 6)
        if dep < ADD_MIN_RESERVE: continue
        h2 = [list(hs) for hs in holes_all]; h2[-1].append((c, dep, 0.0))
        rig_sense(h2, seed=0, with_sparse=False)
        pair_ab, lst, ready, flags, stats = rig_sense.detail
        if any(fl and c in ab for ab, fl in zip(pair_ab, flags)):
            return dict(side='R', col=c, text="surface column %d (x = %d m)" % (c, 5 * c), n_region=len(reg), centroid=(cx, cy))
    return None
def advisor_triggers(kind, new_cells, existing, terminal, pair_stats, S, level, mut=()):
    """Which of P1..P5 an action trips; public inputs only (positions, spacing, depths, S, level priors, planned pairs).
    kind 'add': P1 any new cell within 3.75 cells of an existing cored cell; 're-aim': at least half of the new
    segment's cells (existing excludes the branch's own path). pair_stats = [(new, imaged), ...] of the action's pairs."""
    out = []
    r2 = 14.0625 if 'p1_wide' not in mut else 39.0625
    R = int(math.sqrt(r2))
    offs = [(dx, dy) for dx in range(-R, R + 1) for dy in range(-R, R + 1) if dx * dx + dy * dy <= r2]
    near = sum(1 for c in new_cells if any((c[0] + dx, c[1] + dy) in existing for dx, dy in offs))
    if new_cells and ((kind == 'add' and near >= 1) or (kind == 'reaim' and near * 2 >= len(new_cells))): out.append('P1')
    if any(im > 0 and (n / im) < P5_NEW_FRAC for n, im in pair_stats) and 'no_p2' not in mut: out.append('P2')
    if terminal[1] < barren_rows_of(level, mut) or terminal[1] >= level['max_depth_rows']: out.append('P3')
    if S and min(math.hypot(terminal[0] - x, terminal[1] - y) for x, y in S) > level['w_min_cells'] / 2.0: out.append('P4')
    if not any(im > 0 and (n / im) >= P5_NEW_FRAC for n, im in pair_stats): out.append('P5')
    return out
def vex_line(trigger, used, n_unseen, spot, mut=()):
    """Lowest-numbered unused line of the trigger's list, then of the any-trigger list; spot lines need a spot."""
    for pool in (VEX_MAP[trigger], VEX_ANY):
        for ln in pool:
            if ln in used: continue
            if ln in VEX_SPOT_LINES and spot is None: continue
            return ln, VEX_LINES[ln].format(n=n_unseen, spot=(spot['text'] if spot else ''))
    return None, None

# ---- one round with mid-run actions (spec section 6) ----
class Round:
    """Reference behaviour of a run: planned network + Balrog plan, then add-hole (right) and re-aim (left) actions in
    time order. Reserves are per side. The 2,000 m cap bounds the plan; the reserve is on top of it."""
    def __init__(self, level, F, S, portals, clicks, seed, mut=()):
        self.level = level; self.F = F; self.S = S; self.seed = seed; self.mut = set(mut)
        self.p4_src = F if 'p4_f' in self.mut else S      # the 'p4_f' mutant lets P4 read the hidden formation
        self.W, self.H = level.get('W', W_GRID), level.get('H', H_GRID)
        self.net = Network(S, portals, plan_cap(level, mut), self.W, self.H)
        self.click_results = [self.net.next_gen(p, D) for p, D in clicks]
        self.budget, self.b, self.reserve0, self.rcap = budgets(self.net)
        pbc = {}
        for p in self.net.portals: pbc.setdefault(portal_comp(self.net.Cs, S, p)[0], []).append(p)
        self.holes, self.spent = rig_plan(self.net.Cs, pbc, self.b)
        self.layout = [dict(q) for q in self.net.segs]
        self.resL = float(self.reserve0); self.resR = float(self.reserve0)
        self.nre = self.nadd = 0; self.frozen = {}; self.t_last = 0.0
        self.popups = {'L': [], 'R': []}; self.used = set(); self.log = []
    # state helpers
    def right_end(self): rig_sense(self.holes, seed=self.seed, W=self.W, H=self.H, with_sparse=False); return run_end(rig_sense.last)
    def left_end(self):
        left_sense(self.layout, seed=self.seed, W=self.W, H=self.H, frozen=self.frozen); return run_end(left_sense.last)
    def _popup(self, side, t, trig, n_unseen, spot):
        if not trig: return None
        pops = self.popups[side]
        if len(pops) >= ADVISOR_CAP and 'no_cap' not in self.mut: return None
        cd = ADVISOR_COOLDOWN_S + 1e-9 if 'cooldown_le' in self.mut else ADVISOR_COOLDOWN_S - 1e-9
        if pops and t - pops[-1]['t'] < cd and 'no_cooldown' not in self.mut: return None
        ln, text = vex_line(trig[0], self.used, n_unseen, spot)
        if ln is None: return None
        self.used.add(ln)
        p = dict(side=side, t=t, trigger=trig[0], triggers=trig, line=ln, text=text, spot=spot)
        pops.append(p); return p
    def add_hole(self, t, col, depth=None):
        """Right side. Refusals in order: time, side_finished, limit, outside, sep, reserve."""
        if t < self.t_last - 1e-9: return dict(status='time')
        if t >= self.right_end() - 1e-9: return dict(status='side_finished')
        if self.nadd >= ADD_LIMIT: return dict(status='limit')
        if not (0 <= col < self.W): return dict(status='outside')
        if any(abs(col - h[0]) < ADD_MIN_SEP for hs in self.holes for h in hs): return dict(status='sep')
        left = math.floor((self.resL if 'shared_pool' in self.mut else self.resR) + 1e-9)   # shared_pool: mutant, one pool for both sides
        if left < ADD_MIN_RESERVE: return dict(status='reserve')
        lim = 10 ** 6 if 'no_clamp' in self.mut else left
        dep = min(self.H, add_hole_depth(self.S, col, lim)) if depth is None else max(ADD_MIN_RESERVE, min(depth, lim, self.H))
        # advisor on the state before the action (public information only)
        before = [list(hs) for hs in self.holes]; after = [list(hs) for hs in self.holes]; after[-1].append((col, dep, t))
        seen = observed_right(before, t, self.seed, self.W, self.H)
        existing = {(h[0], y) for hs in before for h in hs for y in range(h[1])}
        rig_sense(after, seed=self.seed, W=self.W, H=self.H, with_sparse=False)
        pair_ab, lst, ready, flags, stats = rig_sense.detail
        ps = [s for ab, s in zip(pair_ab, stats) if col in ab]
        trig = advisor_triggers('add', [(col, y) for y in range(dep)], existing, (col, dep - 1), ps, self.p4_src, self.level, self.mut)
        n_un = len([c for c in self.S if c not in seen])
        spot = advisor_spot('R', self.S, seen, before, left)
        pop = self._popup('R', t, trig, n_un, spot)
        self.holes[-1].append((col, dep, t)); self.nadd += 1; self.t_last = t
        if 'shared_pool' in self.mut: self.resL -= dep
        else: self.resR -= dep
        self.log.append(('add', t, col, dep))
        return dict(status='ok', depth=dep, popup=pop, triggers=trig, pairs=ps, spot=spot)
    def reaim(self, t, seg_id, target):
        """Left side. Refusals in order: time, side_finished, limit, then reaim_check codes, reserve / cap."""
        if t < self.t_last - 1e-9: return dict(status='time')
        if t >= self.left_end() - 1e-9: return dict(status='side_finished')
        if self.nre >= REAIM_LIMIT and 'no_limit' not in self.mut: return dict(status='limit')
        code = reaim_check(self.net, t, seg_id, target, self.layout)
        if code: return dict(status=code)
        cap = min(self.rcap, self.resL) if 'cap_vs_initial' not in self.mut else self.rcap
        ra = reaim(self.net, t, seg_id, target, cap, segs=self.layout)
        if ra is None: return dict(status='reserve' if self.resL < self.rcap else 'cap')
        lay2 = apply_reaim(self.net, t, seg_id, ra, segs=self.layout)
        # advisor, public information only
        seen = observed_left(self.layout, t, self.seed, self.W, self.H, self.frozen)
        by = {q['id']: q for q in self.layout}; kill = kill_set(self.layout, t, seg_id); own = set(kill)
        q = by[seg_id]
        while q['parent'] is not None: own.add(q['parent']); q = by[q['parent']]
        existing = {c for s in self.layout if s['id'] not in own for c in s['cells']}
        new0 = ra['new'][0]; newids = {s['id'] for s in lay2} - {s['id'] for s in self.layout}
        left_sense(lay2, seed=self.seed, W=self.W, H=self.H, frozen=self.frozen)
        order, lst, ready, flags, stats = left_sense.detail
        ps = [s for k, s in zip(order, stats) if k[0] in newids or k[1] in newids]
        term = (rh(new0['end'][0]), rh(new0['end'][1]))
        trig = advisor_triggers('reaim', list(new0['cells']), existing, term, ps, self.p4_src, self.level, self.mut)
        n_un = len([c for c in self.S if c not in seen])
        spot = advisor_spot('L', self.S, seen)
        pop = self._popup('L', t, trig, n_un, spot)
        for k, v in frozen_pairs(self.layout, t).items(): self.frozen.setdefault(k, v)
        self.layout = lay2; self.resL = min(float(self.reserve0), self.resL - ra['cost']); self.nre += 1; self.t_last = t
        self.log.append(('reaim', t, seg_id, ra['cost']))
        return dict(status='ok', ra=ra, popup=pop, triggers=trig, pairs=ps, spot=spot, new_ids=sorted(newids))
    def result(self):
        t2, t1, schL, _ = left_sense(self.layout, seed=self.seed, W=self.W, H=self.H, frozen=self.frozen); endL = run_end(left_sense.last)
        r2, r1, schR, _ = rig_sense(self.holes, seed=self.seed, W=self.W, H=self.H); endR = run_end(rig_sense.last)
        return dict(L=score(self.F, t2, t1), R=score(self.F, r2, r1), pairsL=schL, pairsR=schR, endL=endL, endR=endR,
                    drilledL=sum(q['len'] for q in self.layout), drilledR=sum(h[1] for hs in self.holes for h in hs),
                    resL=self.resL, resR=self.resR)


if __name__ == "__main__":
    import sys
    if "--export-json" in sys.argv:   # 45.8: write the JS parity goldens through the standard exporter and exit before any gate runs
        import runpy
        _i = sys.argv.index("--export-json"); _here = os.path.dirname(os.path.abspath(__file__))
        _out = sys.argv[_i + 1] if _i + 1 < len(sys.argv) and not sys.argv[_i + 1].startswith("--") else os.path.join(_here, "..", "game45", "test", "goldens_v36.json")
        os.makedirs(os.path.dirname(os.path.abspath(_out)), exist_ok=True)
        sys.argv = [os.path.join(_here, "step45_07_export_goldens.py"), "--out", os.path.abspath(_out)]
        runpy.run_path(sys.argv[0], run_name="step45_export"); sys.exit(0)
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

    # ---- speed gates G58 to G60 (spec 2d; test plan A.3). Defined here so a known-bad run (env S45_MUT) can run them alone ----
    def speed_gates(gate):
        flat = lambda k: [h for hs in out[k]['holes'] for h in hs]
        R_ = RIG_SPEED_RATIO
        legacy = {k: round(rig_end_closed(flat(k), cells_of(25.0), cells_of(50.0)), 6) for k in ('GV1', 'GV2', 'GV4')}
        closed = lambda k, R, tr=RIG_TRAVEL: rig_end_closed(flat(k), speeds(R)[1], tr)
        # G58 ratio on the rig only
        bot_ok = (abs(SPEED_L - 0.5) < 1e-12 and abs(out['GV1']['endL'] - 46.0) < 1e-3 and abs(out['GV2']['endL'] - 211.0) < 1e-3
                  and abs(out['GV4']['endL'] - 192.0) < 1e-3 and abs(out['GV2']['net'].segs[3]['t'] - 70.0) < 1e-9)
        drill_ok = abs(RIG_DRILL - R_ * SPEED_L) < 1e-12 and (ZC or abs(RIG_DRILL - 1.7) < 1e-12) and speeds(10.0)[1] == 5.0
        legacy_ok = legacy == dict(GV1=10.3, GV2=55.3, GV4=76.4)
        if ZC: rig_ok = all(abs(out[k]['endR'] - legacy[k]) < 1e-6 for k in legacy)
        else:
            rig_ok = (all(abs(out[k]['endR'] - ENDR_V37[k]) < 1e-6 for k in ('GV1', 'GV1b', 'GV2', 'GV3', 'GV3b', 'GV4'))
                      and all(abs(closed(k, R_) - ENDR_V37[k]) < 1e-6 for k in ('GV1', 'GV2', 'GV4')))
        vec_ok = round(100 / speeds(3.4)[1], 6) == 58.823529 and round(10 / speeds(3.4)[0], 6) == 20.0
        tfloor = lambda k: rig_end_closed(flat(k), speeds(3.4)[1], 1e18) + sum(math.floor(abs(b[0] - a[0]) / cells_of(9000.0) * 10) / 10 for a, b in zip(flat(k), flat(k)[1:]))
        bad58 = (speeds(3.4, ('ratio_on_bot',))[0] != 0.5 and round(10 / speeds(3.4, ('ratio_on_bot',))[0], 6) == 5.882353 and speeds(3.4, ('ratio_on_bot',))[1] != speeds(3.4)[1]
                 and round(100 / speeds(3.57)[1], 6) == 56.022409
                 and round(closed('GV2', 3.5, cells_of(9000.0)), 6) == 148.15119 and round(closed('GV2', 3.3, cells_of(9000.0)), 6) == 156.947727
                 and abs(closed('GV2', 3.5, cells_of(9000.0)) - ENDR_V37['GV2']) > 1e-6 and abs(closed('GV2', 3.3, cells_of(9000.0)) - ENDR_V37['GV2']) > 1e-6
                 and abs(tfloor('GV1') - ENDR_V37['GV1']) > 1e-6 and abs(tfloor('GV2') - ENDR_V37['GV2']) > 1e-6)
        gate("G58 speed ratio on the rig only: borebot 0.5 cells/s, rig R x 0.5, closed-form rig end, 100 cells in 58.823529 s, 10-cell bot segment in 20.0 s",
             bot_ok and drill_ok and legacy_ok and rig_ok and vec_ok, bad58)
        # G59 TIME_COMP: 2.5 m per game s = 1 m/h (borebot); R x 2.5 m per game s = R m/h (rig); travel 1.0 m/s real
        inv = lambda sl, dr, tr, tc: (sl * CELL_M / tc, dr * CELL_M / tc, tr * CELL_M / (tc * 3600.0))
        near = lambda v, w: all(abs(a - b) < 1e-9 for a, b in zip(v, w))
        zero59 = near(inv(SPEED_L, RIG_DRILL, RIG_TRAVEL, TIME_COMP), (1.0, R_, 1.0 if not ZC else 1.0 / 180.0)) and abs(clock_h(1.0) - TIME_COMP) < 1e-12 and (ZC or TIME_COMP == 2.5)
        bad59 = (not near(inv(cells_of(2.5), 3.4 * cells_of(2.5), cells_of(9000.0), 0.4), (1.0, 3.4, 1.0)) and round(inv(cells_of(2.5), 3.4 * cells_of(2.5), cells_of(9000.0), 0.4)[0], 6) == 6.25
                 and not near(inv(cells_of(2.5), 3.4 * cells_of(2.5), cells_of(9000.0), 2.4), (1.0, 3.4, 1.0)) and not near(inv(cells_of(2.5), 3.4 * cells_of(2.5), cells_of(9000.0), 2.6), (1.0, 3.4, 1.0)))
        gate("G59 TIME_COMP: 2.5 m per game s is 1 m/h, 8.5 m per game s is 3.4 m/h, travel 1.0 m/s real, at 2.5 real h per game s", zero59, bad59)
        # G60 real-hour clock
        T60 = [(0.0, "elapsed 0.0 h"), (46.0, "elapsed 115.0 h"), (211.0, "elapsed 527.5 h"), (192.0, "elapsed 480.0 h"), (23.002778, "elapsed 57.5 h"),
               (152.420098, "elapsed 381.1 h"), (0.02, "elapsed 0.1 h"), (192.1, "elapsed 480.3 h")]
        TK60 = [(1, "0.3 h"), (2, "0.5 h"), (3, "0.8 h"), (1920, "480.0 h"), (16000, "4,000.0 h"), (3999, "999.8 h"), (4000, "1,000.0 h")]
        zero60 = (all(clock_str(t) == e for t, e in T60) and all(tick_clock_str(n) == "elapsed " + e for n, e in TK60)
                  and clock_str(out['GV1']['endL']) == "elapsed 115.0 h" and clock_str(out['GV2']['endL']) == "elapsed 527.5 h" and clock_str(out['GV4']['endL']) == "elapsed 480.0 h"
                  and (ZC or (clock_str(out['GV1']['endR']) == "elapsed 57.5 h" and clock_str(out['GV2']['endR']) == "elapsed 381.1 h")))
        fails = lambda m: [any(clock_str(t, mut=(m,)) != e for t, e in T60), any(tick_clock_str(n, mut=(m,)) != "elapsed " + e for n, e in TK60)]
        bad60 = (all(any(fails(m)) for m in ('clock_in_seconds', 'clock_truncate', 'clock_no_comma', 'clock_pyfmt'))
                 and clock_str(46.0, mut=('clock_in_seconds',)) == "elapsed 414,000.0 h"
                 and clock_str(152.420098, mut=('clock_truncate',)) == "elapsed 381.0 h" and tick_clock_str(1, mut=('clock_truncate',)) == "elapsed 0.2 h"
                 and tick_clock_str(16000, mut=('clock_no_comma',)) == "elapsed 4000.0 h" and tick_clock_str(1, mut=('clock_pyfmt',)) == "elapsed 0.2 h")
        gate("G60 clock: elapsed N.N h = game s x 2.5, half up, thousands comma; ticks 1, 2, 3, 1,920 and 16,000 give 0.3, 0.5, 0.8, 480.0, 4,000.0", zero60, bad60)
    if ENV_MUT:   # known-bad run: the mutant is set in the constants above; report which speed gates catch it
        failed = []
        def rgate(name, zero, bad):
            if not (zero and bad): failed.append(name.split()[0])
        speed_gates(rgate)
        print("MUTANT", ",".join(ENV_MUT), "failed gates:", failed)
        sys.exit(1 if failed else 0)
    print("   portals: GV1 test world", p1, "pipe", pp, "main", dp, "; GV1b added hole (18, depth", dep, ") at 5.0 s")
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
    # G16 coring: one cell per cell of path, any dBranch, phase carried (A); mutants: per-segment restart, half-step
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
    def undo_ports(mut=()):
        n_ = Network(S, [96, 103], DRILL_CAP, mut=mut); n_.next_gen(103, 50.0); n_.next_gen(96, 50.0)
        n_.undo()
        if not (n_.portals == [96, 103] and len(n_.clicks) == 1): return False
        n_.undo(); return n_.portals == [96, 103] and not n_.clicks and not n_.undo()
    gate("G19 portal move / remove replay; undo pops clicks only, never a portal", st == 'ok' and newp == [99] and segs_close(moved_net.segs, fresh.segs)
         and all(p_ != pp for p_, _ in acc2) and undo_ports(), not segs_close(stale.segs, fresh.segs) and not undo_ports(('undo_portal',)))
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
    # S-G23: the 75.0 s add queues behind the busy rig at R 3.4, so 'click time ignored' returns the golden there (blind). The late add at 177.0 s
    # (legal window 175.958 s to 178.958 s) restores it. ZC keeps the v36 case.
    args_l = (Fm_, Sm_, dp, [(p, D) for D in MAIN_M for p in dp], DRILL_CAP, (80, 60, 177.0), 90.0, (20.0, 20.0))
    gl = play_moves(*args_l, seed=SEED_MAIN); gl_m = play_moves(*args_l, seed=SEED_MAIN, ignore_click_time=True)
    muts_l = {k: v for k, v in muts.items() if k != 'click time ignored'}
    print("   G23 late add 177.0 s: endR", round(gl['endR'], 3), "click time ignored", round(gl_m['endR'], 3))
    if ZC:
        g23_zero, g23_bad = got_m == want, all(as_gold(v) != want for v in muts.values())
    else:
        g23_zero = got_m == want and abs(gm['endR'] - ENDR_V37['GV4m']) < 1e-6 and abs(gl['endR'] - 215.336) < 1e-3 and gl['L'] == gm['L'] and gl['R'] == gm['R'] and gl['pairsL'] == gm['pairsL'] and gl['pairsR'] == gm['pairsR'] and abs(gl['endL'] - 192.0) < 1e-3
        g23_bad = all(as_gold(v) != want for v in muts_l.values()) and abs(gl_m['endR'] - 214.294) < 1e-3 and abs(gl['endR'] - gl_m['endR']) > 1.0
    gate("G23 GV4m round with both moves", g23_zero, g23_bad)
    # ================= gates G24 and up =================
    import copy
    FmM, SmM = Fm_, Sm_; clM = [(p, D) for D in MAIN_M for p in dp]; LVM = TEST_LEVELS['main']
    # ---- G24: drill cap read from level data ----
    Fp_, Sp_ = pipe_world()
    lv1000 = dict(TEST_LEVELS['pipe'], drill_cap_m=1000.0)
    def cap_refusals(level, mut=()):
        n_ = Network(Sp_, [pp], plan_cap(level, mut)); return [n_.next_gen(pp, D) for D in PIPE6_M]
    gate("G24 drill cap comes from level data",
         plan_cap(TEST_LEVELS['gv1']) == L1_CAP and plan_cap(TEST_LEVELS['pipe']) == DRILL_CAP
         and cap_refusals(TEST_LEVELS['pipe']) == ['ok'] * 6 and 'cap' in cap_refusals(lv1000)
         and all(l['drill_cap_m'] == 2000.0 and l['barren_rows'] == 5 for l in LEVELS.values()),
         'cap' not in cap_refusals(lv1000, ('hardcode_cap',)))
    # ---- G25: barren rows read from level data (P3) ----
    lvb8 = dict(LVM, barren_rows=8)
    def p3(level, row, mut=()): return 'P3' in advisor_triggers('add', [(50, row)], set(), (50, row), [(5, 5)], {(50, 40)}, level, mut)
    gate("G25 barren rows come from level data",
         p3(LVM, 3) and not p3(LVM, 5) and p3(lvb8, 6) and not p3(lvb8, 8) and not p3(LVM, 20) and p3(LVM, LVM['max_depth_rows']),
         not p3(lvb8, 6, ('hardcode_barren',)))
    # ---- G26 / G27 / G28: formation generator ----
    def bodies_ok(mut=()):
        bad = 0
        for i, lv in LEVELS.items():
            for v in range(16):
                r_ = build_attempt(lv, lv['level_id'] * lv['seed_step'] + v, True, mut)
                if r_ is None or len(comps(r_[0])) != lv['expected_bodies']: bad += 1
        return bad
    def det_ok():
        for lv in LEVELS.values():
            for v in range(4):
                a_, b_ = gen_level(lv, v), gen_level(lv, v)
                if not (a_['F'] == b_['F'] and len(a_['F']) >= F_FLOOR and all(0 <= x < W_GRID and 0 <= y < H_GRID for x, y in a_['F'])): return False
        return True
    det = det_ok()
    zero_noise = all(gen_level(LEVELS[i], v)['F'] == gen_level(LEVELS[i], v)['F0'] for i in (1, 2) for v in range(4))
    gate("G26 generator: determinism, floor, body count, 75 m body clearance", det and zero_noise and bodies_ok() == 0, bodies_ok(('nosep',)) > 0)
    def cap_holds(mut=()):
        bad = 0
        for i in (3, 4, 5, 6):
            lv = LEVELS[i]
            for v in range(12):
                seed = lv['level_id'] * lv['seed_step'] + v
                r_ = build_attempt(lv, seed, True, mut)
                if r_ is None: continue
                F_, F0_, info = r_; rr = max(x['cap'] for x in info)
                if not (eroded(F0_, rr) <= F_ and F_ <= {(c[0] + dx, c[1] + dy) for c in F0_ for dx in range(-rr, rr + 1) for dy in range(-rr, rr + 1) if dx * dx + dy * dy <= rr * rr}):
                    bad += 1
        return bad
    gate("G27 generated noise stays inside the D20 cap (inward and outward)", cap_holds() == 0, cap_holds(('uncapped',)) > 0)
    lv4 = LEVELS[4]
    g3 = gen_level(lv4, 0, accept=lambda F_, k: k >= 3); g_no = gen_level(lv4, 0, accept=lambda F_, k: False)
    g3b = gen_level(lv4, 0, accept=lambda F_, k: k >= 3, max_reseeds=2)
    gate("G28 re-seed rule: variant + 1 per failure, 16 re-seeds, then noise 0",
         g3['reseeds'] == 3 and g3['variant'] == 3 and g3['seed'] == lv4['level_id'] * 7919 + 3 and not g3['noise_zero']
         and g_no['noise_zero'] and g_no['reseeds'] == RESEED_MAX + 1 and g_no['F'] == g_no['F0'] and g_no['variant'] == 0,
         g3b['noise_zero'] and g3b['variant'] != 3)
    rate = {}
    for i, lv in LEVELS.items():
        rs = [gen_level(lv, v * 17) for v in range(40)]
        rate[i] = (sum(1 for r_ in rs if r_['reseeds'] > 0), sum(1 for r_ in rs if r_['noise_zero']), min(len(r_['F']) for r_ in rs))
    print("   generator, 40 variants per level (re-seeded, fallback to noise 0, smallest F):", rate)
    # ---- G29 / G30: paint ----
    cnt = {r_: len(brush_cells(50, 50, r_)) for r_ in BRUSH_R}
    Pc = Painter(100); Pc.stroke([(50.5, 50.5), (60.5, 50.5)], 8); cap_ok = len(Pc.S) == 100
    sq = lambda gap: {(60 + dx, 40 + dy) for dx in range(-11, 12) for dy in range(-11, 12)
                      if max(abs(dx), abs(dy)) in (10, 11) and not (gap and dx == 0 and dy in (-10, -11))}
    Pf = Painter(5000); Pf.S = sq(False); closed = Pf.fill((60, 40)); n_in = len(Pf.S)
    Pl = Painter(5000); Pl.S = sq(True); leak = Pl.fill((60, 40))
    Pcap = Painter(300); Pcap.S = sq(False); capref = Pcap.fill((60, 40))
    Pu = Painter(5000)
    for k in range(25): Pu.stroke([(10.5 + 6 * k, 10.5), (12.5 + 6 * k, 10.5)], 2)
    undone = 0
    while Pu.undo(): undone += 1
    good29 = (cnt == {2: 13, 5: 81, 8: 197, 12: 441, 20: 1257} and cap_ok and closed == 'ok' and n_in == 23 * 23 - 0 and leak == 'refused_edge'
              and capref == 'refused_cap' and undone == 20)
    Pm = Painter(5000, mut=('r2_exclusive',)); Pm.stroke([(50.5, 50.5)], 5)
    gate("G29 paint: disc counts, cap clip, fill (closed / leaky / over cap), undo 20", good29, len(Pm.S) != 81)
    blob49 = {(x, y) for x in range(7) for y in range(7)}; blob50 = blob49 | {(7, 0)}
    big = {(x, y) for x in range(20, 30) for y in range(20, 30)}
    two = lambda B: B | {(x + 100, y) for x, y in B}
    four = big | {(x + 20, y) for x, y in big} | {(x + 40, y) for x, y in big} | {(x + 60, y) for x, y in big}
    def keep_n(S_, thr):
        return sum(len(C) for C in comps(S_) if len(C) >= thr)
    gate("G30 done painting: strays under 50 dissolve; empty and more than 3 bodies blocked",
         done_painting(big | blob49)[0] == 'ok' and done_painting(big | blob49)[1] == big and done_painting(blob50)[0] == 'ok'
         and done_painting(blob49)[0] == 'empty' and done_painting(four)[0] == 'too_many' and done_painting(set())[0] == 'empty',
         keep_n(big | blob49, 0) != len(big))
    # ---- G31: Back to paint re-snap ----
    Sb = rect(20, 40, 10, 30)
    ports, cks = [22, 30, 38], [(22, 50.0), (30, 40.0), (38, 30.0)]
    S_shift = rect(24, 46, 10, 30)                         # column 22 leaves S and snaps to 24; 30 and 38 stay
    k1, c1, d1, a1 = repaint_portals(S_shift, ports, cks)
    S_narrow = rect(30, 33, 10, 30)                        # 22 -> 30 collides with 30; 38 -> 33 is 3 apart from 30
    k2, c2, d2, a2 = repaint_portals(S_narrow, ports, cks)
    S_split = rect(26, 36, 10, 30) | rect(60, 70, 10, 30)  # a second component appears
    k3, c3, d3, a3 = repaint_portals(S_split, [30], [(30, 40.0)])
    S_merge = rect(20, 70, 10, 30)                         # two portals in one merged component stay when 5+ apart
    k4, c4, d4, a4 = repaint_portals(S_merge, [30, 60], [(30, 40.0), (60, 30.0)])
    good31 = (k1 == [24, 30, 38] and c1 == [(24, 50.0), (30, 40.0), (38, 30.0)] and k2 == [30] and c2 == [(30, 50.0)] and d2 == [30, 38]
              and k3 == [30, 65] and a3 == [65] and c3 == [(30, 40.0)] and k4 == [30, 60] and len(c4) == 2)
    bad31 = (lambda k_: k_ == [24, 30, 38])(repaint_portals(S_shift, ports, cks, ('keep',))[0])
    gate("G31 Back to paint: re-snap, drop under 5 cells, default portal per new component, merge keeps both", good31, not bad31)
    # ---- G32: fixed tick ----
    tk_ok = (to_tick(75.0) == 750 and to_tick(75.04) == 750 and to_tick(74.999999) == 749 and to_tick(90.0) == 900 and to_tick(0.0999) == 0
             and tick_time(750) == 75.0 and tick_time(976) == 97.6)
    tk_round = lambda t: int(round(t * 10))
    rt = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN)
    def drive_ticks(mut=()):
        r_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN); tk = lambda t: tick_time(to_tick(t, mut))
        if ZC: a_ = r_.add_hole(tk(75.06), 80, 60); i2 = reaim_pick(r_.net, 90.0, segs=r_.layout); b2 = r_.reaim(tk(90.03), i2, REAIM_TARGET)
        else: i2 = reaim_pick(r_.net, 90.0, segs=r_.layout); b2 = r_.reaim(tk(90.03), i2, REAIM_TARGET); a_ = r_.add_hole(tk(177.06), 80, 60)   # time order
        return a_['status'] == 'ok' and b2['status'] == 'ok', r_.result()
    (ok_t, rs_), (_, rs_n) = drive_ticks(), drive_ticks(('tick_nearest',))
    ENDR_G32 = 97.6 if ZC else 215.336                     # A-SIM2: the late case (floor tick 1,770 = 177.0 s); tick_nearest gives tick 1,771 and 215.436
    same = rs_['L'] == GOLD['GV4m']['L'] and rs_['R'] == GOLD['GV4m']['R'] and abs(rs_['endR'] - ENDR_G32) < 1e-3 and abs(rs_['endL'] - 192.0) < 1e-3
    same_n = rs_n['R'] == GOLD['GV4m']['R'] and abs(rs_n['endR'] - ENDR_G32) < 1e-3
    SNAP = [(0.0, 0), (0.5, 1), (3.4999999, 4), (2.5, 3), (-0.5, 0), (-0.5000001, 0), (0.4999999, 1), (3.4999989, 3), (2.5000001, 3)]
    snap_ok = all(cell_of(v) == e for v, e in SNAP); snap_bad = any(cell_of(v, ('no_snap',)) != e for v, e in SNAP)
    pace_ok = ticks_due(19.2, 1) == 1920 and ticks_due(4.8, 4) == 1920 and ticks_due(1.2, 16) == 1920 and ticks_due(0.0, 1) == 0 and ticks_due(0.05, 1) == 5
    pace_bad = ticks_due(19.2, 1, ('ticks_x10',)) == 192
    gate("G32 fixed 0.1 s tick, ticks due (100 per wall s at 1x) and cell snap: actions floor to the tick and reproduce GV4m; snap at k + 0.5 +/- 1e-7", tk_ok and same and ok_t and snap_ok and pace_ok,
         not same_n and snap_bad and pace_bad)
    # ---- G33: Round equals GV4m; per-side reserve ledger; add-hole rules ----
    RR = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN)
    RR.add_hole(75.0, 80); iR = reaim_pick(RR.net, 90.0, segs=RR.layout); RR.reaim(90.0, iR, REAIM_TARGET); rs2 = RR.result()
    led = (abs(RR.resL - (75 - 29.389243477962303)) < 1e-9 and RR.resR == 15.0 and rs2['drilledR'] == 359 and abs(rs2['drilledL'] - 327.889) < 1e-3
           and rs2['L'] == GOLD['GV4m']['L'] and rs2['R'] == GOLD['GV4m']['R'])
    RS = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, ('shared_pool',))
    RS.add_hole(75.0, 80); iS = reaim_pick(RS.net, 90.0, segs=RS.layout); RS.reaim(90.0, iS, REAIM_TARGET); rsS = RS.result()
    gate("G33 Round reproduces GV4m; reserves are per side (left 45.6, right 15 cells)", led,
         rsS['L'] != GOLD['GV4m']['L'] or abs(RS.resL - RR.resL) > 1e-6)   # shared_pool mutant: one pool pays for both moves
    def seq_reaims(mut=()):
        R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, mut)
        for t_, i_, tg in [(90.0, 6, (20.0, 30.0)), (95.0, 8, (40.0, 30.0))]: R_.reaim(t_, i_, tg)
        r_ = R_.reaim(100.0, 31, (10.0, 10.0))
        return R_.resL, r_['status']
    z_, zs = seq_reaims(); b_, bs = seq_reaims(('cap_vs_initial',))
    gate("G34 re-aim cost <= min(cap, remaining reserve): five-re-aim spend never exceeds the reserve", z_ >= -1e-9 and zs == 'ok' and b_ < -1e-9,
         b_ < -1e-9)
    def add_rules(mut=()):
        R_ = Round(TEST_LEVELS['gv1'], *l1_world(), [9], [(9, 25.0), (9, 20.0)], SEED_L1, mut)
        r1 = R_.add_hole(5.0, 18)                                  # GV1b: default depth 9 = the whole reserve
        r2 = R_.add_hole(6.0, 22)                                  # reserve gone
        r3 = R_.add_hole(7.0, 9)                                   # same column as a hole
        return r1, r2, r3
    a1_, a2_, a3_ = add_rules()
    _, b2_, _ = add_rules(('no_clamp',))
    R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN); cols = [20, 30, 40, 100, 110, 120, 130]
    res7 = [R_.add_hole(1.0 + k, c, 2)['status'] for k, c in enumerate(cols)]
    R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN); late = R_.add_hole(R_.right_end() + 1.0, 100)
    R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN); at_end = R_.add_hole(R_.right_end(), 100)['status']
    R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN); before_end = R_.add_hole(R_.right_end() - 0.1, 100)['status']
    gate("G35 add hole: default depth clamps to reserve (GV1b 9), refusals, limit 6, side lock",
         a1_['status'] == 'ok' and a1_['depth'] == 9 and a2_['status'] == 'reserve' and a3_['status'] in ('reserve', 'sep')
         and res7 == ['ok'] * 6 + ['limit'] and late['status'] == 'side_finished' and at_end == 'side_finished' and before_end == 'ok',
         add_rules(('no_clamp',))[0]['depth'] > 9)
    # ---- G36: frozen pairs (revealed cells never un-reveal) ----
    def mkseg(i, col, y0, y1, t_):
        cells = [(col, y) for y in range(y0, y1 + 1)]
        return dict(id=i, cells=cells, t=t_, len=float(len(cells)), s=[y + 0.5 for y in range(y0, y1 + 1)], parent=None)
    a_, c_, b_s = mkseg(0, 10, 0, 9, 2.0), mkseg(1, 18, 0, 9, 2.0), mkseg(2, 14, 3, 9, 10.0)
    fz = frozen_pairs([a_, c_], 5.0)
    t2f, t1f, _, _ = left_sense([a_, c_, b_s], frozen=fz); t2n, t1n, _, _ = left_sense([a_, c_, b_s])
    gate("G36 frozen pairs: a pair finished before an action keeps its imaged cells", len(fz) == 1 and set(t1n) < set(t1f) and len(t1f) > len(t1n),
         set(t1n) != set(t1f))
    # ---- G37: later re-aims, trunk re-aim, input validity ----
    def second_reaim(use_layout=True):
        R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN)
        new_id = R_.reaim(90.0, 6, (20.0, 30.0))['new_ids'][0]
        segs = R_.layout if use_layout else R_.net.segs
        try:
            tt = next(t for t in (91.0, 93.0, 95.0, 97.0, 99.0, 101.0) if 0 < seg_frac({q['id']: q for q in R_.layout}[new_id], t) < 1)
            r_ = reaim(R_.net, tt, new_id, (40.0, 30.0), 10 ** 6, segs=segs)
            return r_ is not None and all(k in r_['new'][0] for k in ('sx', 'sy', 'A0', 'start', 's'))
        except (KeyError, StopIteration): return False
    R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN)
    trunk_id = reaim_pick(R_.net, 20.0, comp=1, include_trunk=True)
    rt_ = R_.reaim(20.0, trunk_id, (100.0, 60.0)) if trunk_id is not None else dict(status='none')
    R2_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN)
    chk = (reaim_check(R2_.net, 90.0, 6, (20.0, 20.0), R2_.layout) is None and reaim_check(R2_.net, 1e6, 6, (20.0, 20.0), R2_.layout) == 'finished'
           and reaim_check(R2_.net, 0.0, 6, (20.0, 20.0), R2_.layout) == 'not_started' and reaim_check(R2_.net, 90.0, 6, (-3.0, 20.0), R2_.layout) == 'outside'
           and reaim_check(R2_.net, 90.0, 6, (R2_.net.segs[6]['cells'][0][0] + 0.0, R2_.net.segs[6]['cells'][0][1] + 0.0), R2_.layout) == 'cored')
    pk = pick_tip(R2_.layout, 90.0, 45.4, 38.4, 2.0) == 6 and pick_tip(R2_.layout, 90.0, 5.0, 5.0, 2.0) is None
    fin = reaim(R2_.net, 1e6, 6, (20.0, 20.0), 10 ** 6, segs=R2_.layout)
    def order_codes(mut=()):
        a = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, mut); a.nre = REAIM_LIMIT; c_limit = a.reaim(90.0, 6, REAIM_TARGET)['status']
        b = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, mut); b.nre = REAIM_LIMIT; c_fin = b.reaim(b.left_end(), 6, REAIM_TARGET)['status']   # finished and at the limit: side_finished first
        c = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, mut); c.t_last = 95.0; c_time = c.reaim(90.0, 6, REAIM_TARGET)['status']
        d = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, mut); c_nb = d.reaim(90.0, 9999, REAIM_TARGET)['status']
        e = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, mut); e.t_last = 80.0; c_add = e.add_hole(75.0, 80)['status']
        return c_limit, c_fin, c_time, c_nb, c_add
    codes_ok = order_codes() == ('limit', 'side_finished', 'time', 'no_branch', 'time')
    gate("G37 later re-aims (regrown branch), trunk re-aim, validity codes, tip pick, refusal order (side_finished, limit, time, no_branch)",
         second_reaim(True) and rt_['status'] == 'ok' and chk and pk and R_.nre == 1 and codes_ok,
         (not second_reaim(False) or fin is not None) and order_codes(('no_limit',))[0] == 'ok')
    # ---- G38: advisor rules P1..P5, spot, leak guard, cooldown and cap ----
    Rg = Round(TEST_LEVELS['gv1'], *l1_world(), [9], [(9, 25.0), (9, 20.0)], SEED_L1)
    gv1b = Rg.add_hole(5.0, 18)
    Rm_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN); att = Rm_.add_hole(74.0, 61); ok_add = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN).add_hole(75.0, 80, 60)
    spot74 = att['spot']
    p1_wide = Round(TEST_LEVELS['gv1'], *l1_world(), [9], [(9, 25.0), (9, 20.0)], SEED_L1, ('p1_wide',)).add_hole(5.0, 18)
    # F independence: a different F under the same S, portals, clicks gives identical advisor output
    Falt = {(x + 1, y) for x, y in FmM}
    Ra = Round(LVM, Falt, SmM, dp, clM, SEED_MAIN); att2 = Ra.add_hole(74.0, 61)
    leak_same = (att['triggers'], att['popup'] and att['popup']['text'], att['spot']) == (att2['triggers'], att2['popup'] and att2['popup']['text'], att2['spot'])
    def adv_out(F_, mut=()):
        o = []
        for kind in ('add61', 'addP4', 'reaim'):
            R_ = Round(LVM, F_, SmM, dp, clM, SEED_MAIN, mut)
            r_ = (R_.add_hole(74.0, 61) if kind == 'add61' else R_.add_hole(20.0, 199, 2) if kind == 'addP4' else R_.reaim(90.0, 6, REAIM_TARGET))
            o.append((r_['status'], tuple(r_.get('triggers', ())), r_['popup'] and r_['popup']['text'], r_.get('spot') and r_['spot']['text']))
        return o
    Fvars = [FmM, Falt, set(), SmM, {(x, y) for x, y in SmM if (x + y) % 2}]
    base_adv = adv_out(FmM)
    leak_all = all(adv_out(F_) == base_adv for F_ in Fvars[1:]) and 'P4' in base_adv[1][1] and base_adv[2][0] == 'ok'
    leak_bad = any(adv_out(F_, ('p4_f',)) != adv_out(FmM, ('p4_f',)) for F_ in Fvars[1:])
    gate("G38 advisor: GV1b silent, attempt 5 m from a hole fires P1, GV4m add silent, F-independent",
         gv1b['status'] == 'ok' and gv1b['triggers'] == [] and gv1b['popup'] is None and att['triggers'][0] == 'P1' and att['popup']['line'] == 3
         and ok_add['triggers'] == [] and ok_add['popup'] is None and leak_same and leak_all and spot74['col'] == (80 if ZC else 144) and spot74['n_region'] == (829 if ZC else 1147),
         p1_wide['triggers'] != [] and leak_bad)
    def popups_for(mut=(), gap=1.0, n=6):
        R_ = Round(LVM, FmM, SmM, dp, clM, SEED_MAIN, mut)
        hs = [h[0] for hh in R_.holes for h in hh]; k = 0; got = 0
        for c in (61, 51, 71, 137, 147, 157, 41, 81):
            if got >= n: break
            r_ = R_.add_hole(1.0 + k * gap, c, 2); k += 1; got += 1
        return len(R_.popups['R'])
    gate("G39 advisor gates: cooldown 12 s per side, 4 per run, no repeated line",
         popups_for(gap=1.0) == 1 and popups_for(('no_cooldown',), 1.0) == 4 and popups_for(('no_cooldown', 'no_cap'), 1.0, 8) > 4
         and popups_for(gap=21.0, n=6) >= 3 and popups_for(gap=12.0, n=2) == 2,
         popups_for(('no_cooldown',), 1.0) != popups_for(gap=1.0) and popups_for(('cooldown_le',), gap=12.0, n=2) == 1)
    # P2 / P4 / P5 isolated cases through advisor_triggers (public inputs only)
    Sx_ = rect(40, 60, 20, 60); ex_ = set()
    p2 = advisor_triggers('add', [(50, 30)], ex_, (50, 30), [(1, 10)], Sx_, LVM)
    p5 = advisor_triggers('add', [(50, 30)], ex_, (50, 30), [], Sx_, LVM)
    p4 = advisor_triggers('add', [(150, 30)], ex_, (150, 30), [(9, 9)], Sx_, LVM)
    p0 = advisor_triggers('add', [(50, 30)], ex_, (50, 30), [(9, 9)], Sx_, LVM)
    gate("G40 advisor P2 (80 percent already seen), P4 (outside painting by more than W_min/2), P5 (no new pair), quiet control",
         p2 == ['P2', 'P5'] and p5 == ['P5'] and p4 == ['P4'] and p0 == [],
         advisor_triggers('add', [(50, 30)], ex_, (50, 30), [(1, 10)], Sx_, LVM, ('no_p2',)) != p2)
    # ---- G41: readout strings and drilled meters ----
    def tenths(n, d): return (2000 * n + d) // (2 * d)
    ok41 = all(tenths(n, d) == int(round(float(Decimal(pct1(n, d))) * 10)) for d in (80, 1020, 2036) for n in range(d + 1))
    trunc = lambda n, d: (1000 * n) // d
    bad41 = any(trunc(n, d) != tenths(n, d) for d in (80,) for n in range(d + 1))
    ro = readout((139, 353, 2036))
    gate("G41 readout: integer half-up equals the sim, total from summed counts, drilled meters",
         ok41 and ro == dict(intersected='6.8', imaged='17.3', total='24.2') and fmt_m(327.889) == '1,639.4' and fmt_m(359) == '1,795.0'
         and fmt_m(400) == '2,000.0' and fmt_m(1.0) == '5.0', bad41)

    assert [fmt1(x) for x in (43.75, 45.25, 0.05, 0.049)] == ['43.8', '45.3', '0.1', '0.0'] and pct1(0, 0) == "no formation"
    assert [round(u01(*v), 6) for v in [(7919, 5, 4), (7919, 4, 6), (7919, 6, 4), (15838, 40, 20)]] == [0.062413, 0.136708, 0.081696, 0.83714]
    if not ZC: speed_gates(gate)
    print("gates passed:", len(CK), ":", ", ".join(CK))
