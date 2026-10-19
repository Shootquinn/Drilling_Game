"""Step 45 storyboard rev 8 (spec v3.7.3, surface-fork branching, R 3.4). Every drawn segment, hole, pair, speckle cell and printed
number comes from cr_scratch/step45_reference_sim_v3.py, imported here (START_MODE surface). No rule is re-implemented: growth, R4
prune, free portal columns, budgets, Balrog plan, sensing, sparse reveal, re-aim and run end are the sim's functions. The main round is
the sim's surface_scenario() (GV4 world, one V3 portal, policy (50, 3, 75)) played through the sim's Round class with the two
mid-run moves. This file records what the sim computes and checks the replay against the sim's own result and against
game45/test/goldens_v39.json.
Usage: S45_START_MODE=surface python -I export_sim.py <main_fs.json (unused, kept for the old command line)> <out.json>"""
import json, math, sys, os, copy, re, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import step45_reference_sim_v3 as r
assert r.START_MODE == r.MODE_SURFACE, 'run with S45_START_MODE=surface (the shipped mode)'

SEED_MAIN, SEED_PIPE, SEED_L1 = r.SEED_MAIN, r.SEED_PIPE, r.SEED_L1
GOLD = json.load(open(os.path.join(HERE, '..', '..', 'game45', 'test', 'goldens_v41.json'), encoding='utf8'))

# =====================================================================================================================
# GV4m (surface): STORYBOARD MID-RUN MOVES (panels 13 to 21). Round = r.surface_scenario(): GV4 world, one V3 portal, the policy clicks.
#   attempt: an add hole 1 cell beside rig hole 1 at add_attempt_t (Vex P1 fires; the attempt is not drilled).
#   add: the column Vex marks (the sim's advisor_spot) at add_t; must be silent.
#   re-aim: reaim_pick at reaim_t toward r.REAIM_TARGET (the S_MID case of goldens_v39).
GV4M = dict(add_attempt_t=74.0, add_attempt_offset_cells=1, add_t=75.0, reaim_t=100.0)
# =====================================================================================================================
CAP = r.DRILL_CAP
TOL = 6e-4      # goldens carry end_s to 3 decimals


def queue_done(ready, flags):
    """Done time per pair under the sim's serial queue; checked against r.run_end below."""
    order = sorted(range(len(ready)), key=lambda i: ready[i]); free = 0.0; done = [None] * len(ready)
    for i in order:
        if flags[i]: free = max(ready[i], free) + r.RADAR_SECONDS; done[i] = free
    return done


def sparse_timeline(lines, seed):
    """lines: list of (completion time, cells). Sparse reveal is applied when a line completes (spec 5). For each completion
    event, r.sparse() runs on the cells cored by the lines completed so far; a cell's reveal time is the first event that
    reveals it. p(r) falls with r and r only shrinks as lines complete, so the set grows monotonically."""
    times = sorted({t for t, _ in lines}); first = {}
    for te in times:
        t2 = {c for t, cs in lines if t <= te + 1e-9 for c in cs}
        t1 = {}; r.sparse(t2, t1, seed, r.W_GRID, r.H_GRID)
        for c in t1:
            if c not in first: first[c] = te
    return first


def side_record(kind, data, seed, reach=None, frozen=None):
    """One side's sensing, read from the sim's own detail lists (pair order, imaged cells, ready times, scheduled flags)."""
    if kind == 'L':
        t2, t1, sch, skp = r.left_sense(data, seed=seed, frozen=frozen, reach=reach)
        order, lst, ready, flags, stats = r.left_sense.detail
        last = r.left_sense.last; n_sp = r.left_sense.sparse
        pp = dict(r.left_pairs(data, reach)); pp.update(frozen or {})
        rows_of = [[list(x) for x in pp[k]['rows']] for k in order]
        lines = [(s['t'], s['cells']) for s in data]
    else:
        t2, t1, sch, skp = r.rig_sense(data, seed=seed)
        pair_ab, lst, ready, flags, stats = r.rig_sense.detail
        last = r.rig_sense.last; n_sp = r.rig_sense.sparse
        depth = {h[0]: h[1] for hs in data for h in hs}
        rows_of = [[[y, a, b] for y in range(min(depth[a], depth[b]))] for a, b in pair_ab]
        lines = None
    _, _, drill_end = last
    done = queue_done(ready, flags)
    end = r.run_end(last)
    assert abs(max([drill_end] + [d for d in done if d is not None]) - end) < 1e-9, 'queue replay disagrees with sim run_end'
    pairs = []
    for i, im in enumerate(lst):
        rows = rows_of[i]
        pairs.append(dict(rows=rows, im=sorted([c[0], c[1]] for c in im), ready=ready[i], sched=flags[i], done=done[i],
                          a=rows[0][1] if rows else None, b=rows[0][2] if rows else None, n=len(im)))
    return dict(t2=t2, t1=t1, sch=sch, skp=skp, n_sparse=n_sp, pairs=pairs, end=end, drill_end=drill_end), lines


def rig_timeline(holes_all):
    """Hole start / drill-start / completion times under the sim's rig loop; checked against rig_sense.last below."""
    flat = [h for hs in holes_all for h in hs]; comp = [ci for ci, hs in enumerate(holes_all) for _ in hs]
    out, tt, pos = [], 0.0, flat[0][0] if flat else 0
    for k, h in enumerate(flat):
        add_t = h[2] if len(h) > 2 else 0.0
        start = max(tt, add_t); td = start + abs(h[0] - pos) / r.RIG_TRAVEL; t1 = td + h[1] / r.RIG_DRILL
        out.append(dict(col=h[0], depth=h[1], comp=comp[k], added=len(h) > 2, t0=start, td=td, t1=t1, frm=pos)); tt = t1; pos = h[0]
    return out


def finish_side(kind, data, seed, F, reach=None, frozen=None):
    rec, lines = side_record(kind, data, seed, reach, frozen)
    if kind == 'R':
        times = rig_timeline(data)
        assert abs(times[-1]['t1'] - rec['drill_end']) < 1e-9, 'rig timeline disagrees with sim'
        done_by_col = {h['col']: h['t1'] for h in times}
        for p in rec['pairs']: assert abs(p['ready'] - max(done_by_col[p['a']], done_by_col[p['b']])) < 1e-9, 'pair ready time disagrees'
        lines = [(h['t1'], [(h['col'], y) for y in range(h['depth'])]) for h in times]
        rec['holes'] = times
    first = sparse_timeline(lines, seed)
    # the composed final state (pairs + sparse, cores override) must equal the sim's tier sets
    pair_cells = {tuple(c) for p in rec['pairs'] if p['sched'] for c in p['im']} - rec['t2']
    sp_cells = {c for c in first if c not in rec['t2'] and c not in pair_cells}
    assert pair_cells | sp_cells == set(rec['t1']) - rec['t2'], 'composed tier 1 (outside the cores) disagrees with sim'
    assert len(sp_cells) == rec['n_sparse'], 'sparse count disagrees with sim'
    rec['sparse'] = [[c[0], c[1], first[c]] for c in sorted(first) if c not in rec['t2']]
    rec['score'] = list(r.score(F, rec['t2'], rec['t1']))
    del rec['t1'], rec['t2']
    return rec


def seg_out(s, i, flags=None):
    fl = flags or {}
    return dict(id=i, portal=s.get('portal'), comp=s.get('comp'), gen=s['gen'], cells=[list(c) for c in s['cells']], s=list(s['s']),
                len=s['len'], dir=s['dir'], parent=-1 if s.get('parent') is None else s['parent'], end=list(s['end']), trunc=s['trunc'],
                t=s['t'], start=s['start'], sx=s['sx'], sy=s['sy'], D=s.get('D'), ent=bool(s.get('ent', True)),
                reaim=fl.get('reaim', s.get('reaim', False)), regrow=fl.get('regrow', s.get('regrow', False)))


def plan_state(net):
    budget, b, reserve, rcap = r.budgets(net)
    holes, spent = r.plan_rig(net, b)
    tgt = {str(p): net.Tk[p] for p in net.portals}
    stop = {str(p): (5.0 * min(y for k in net.Tk[p] for (x, y) in net.Cs[k]) if net.Tk[p] else None) for p in net.portals}
    return dict(segs=[seg_out(s, i) for i, s in enumerate(net.segs)], length=net.length(), gens={str(k): v for k, v in net.gens.items()},
                portals=net.portals, theta={str(k): v for k, v in net.theta.items()}, budget=budget, b=b, reserve=reserve, reaim_cap=rcap,
                holes=[[list(h) for h in hs] for hs in holes], spent=spent, clicks=[list(c) for c in net.clicks], targets=tgt, s_top_m=stop,
                meter_start=r.meter_start(net.S, net.portals))


def ghost_out(cands, reason=None):
    return [dict(cells=[list(c) for c in k['cells']], len=k['len'], dir=k['dir'], end=list(k['end']), sx=k['sx'], sy=k['sy'], gen=k['gen'],
                 parent=-1 if k.get('parent') is None else k['parent'], **({'reason': reason} if reason else {})) for k in cands]


def drops(net, p, D):
    """Candidates the sim drops for a click, split by reason. R4: the candidate list with the ray test off minus the list with it on
    (tip spacing off in both). Tip spacing: the list with it off minus the list with it on (R4 on in both)."""
    key = lambda k: (round(k['end'][0], 9), round(k['end'][1], 9), round(k['dir'], 9))
    def cands(ray, tip):
        n2 = copy.deepcopy(net); n2.tip_prune = tip
        if not ray: n2.mut = set(n2.mut) | {'ray_off'}
        return n2.candidates(p, D)
    a = cands(True, False); b = cands(True, True); c = cands(False, False)
    kb = {key(k) for k in b}; ka = {key(k) for k in a}
    return [k for k in c if key(k) not in ka], [k for k in a if key(k) not in kb]


def spec_antfarm():
    spec = open(os.path.join(HERE, '..', 'step45_toymaker_spec_v3.md'), encoding='utf8').read()
    return float(re.search(r'ant-farm animation used ([0-9.]+) mm', spec).group(1))


def spec_row(name):
    spec = open(os.path.join(HERE, '..', 'step45_toymaker_spec_v3.md'), encoding='utf8').read()
    mm = re.search(r'^\|\s*' + re.escape(name) + r'\s*\|\s*([0-9.]+) mm', spec, re.M)
    return float(mm.group(1))


def main():
    w, net0, clicks, mk = r.surface_scenario()
    F, S = w['F'], w['S']
    Cs = r.comps(S); dp = [w['portal']]
    assert dp == [r.default_portal_surface(S)], 'V3 default portal'
    p0 = dp[0]
    out = {}
    # ---------------- PLAN stages (panels 09 to 10) ----------------
    plan = {}
    net = r.Network(S, dp, CAP); plan['p09'] = plan_state(net)
    assert plan['p09']['meter_start'] == 0 and net.length() == 0 and not net.segs
    # 09a: a tap on free ground. Surface mode gives the tap column itself (no snap). The widest unpainted gap between painted columns.
    scol = sorted({x for x, y in S}); gaps = [(b - a, a, b) for a, b in zip(scol, scol[1:]) if b - a > 1]
    gw, ga, gb = max(gaps); tap = math.ceil((ga + gb) / 2)
    assert r.place_portal(S, tap) == tap and tap not in scol, 'free column, no snap'
    st_add, p2_, _ = r.plan_add_portal(S, dp, [], tap, CAP)
    assert st_add == 'ok', 'tap-to-add must be accepted for panel 09a: ' + st_add
    n2 = r.Network(S, p2_, CAP); plan['p09a'] = plan_state(n2)
    st_sep = r.plan_add_portal(S, p2_, [], p0 + 3, CAP)[0]; assert st_sep == 'sep', 'a second tap under 25 m is refused'
    st_rm, pback, _ = r.plan_remove_portal(S, p2_, [], tap, CAP); assert pback == dp
    far = None
    for c in range(0, r.W_GRID):
        if r.Network(S, [c], CAP).next_gen(c, 50.0) == 'dead': far = c; break
    far_tap = dict(col=far, status='dead') if far is not None else None
    plan['p09a'].update(tap=tap, snapped=tap, refused_tap=p0 + 3, refused=st_sep, far_tap=far_tap, remaining_after_remove=pback, selected_after_remove=min(pback))
    # 09b: slider at the first click's dBranch: ghost of generation 1 before the first click
    sel0, D0 = clicks[0]
    g = net.candidates(sel0, D0); plan['p09b'] = plan_state(net); plan['p09b'].update(ghost=ghost_out(g), ghost_len=sum(k['len'] for k in g), sel=sel0, D=D0)
    # 09c: the clicks are applied in order; 09c is the first click whose generation loses a candidate to the R4 ray test
    # (fallback: tip spacing). Chosen from the sim, never hard-coded.
    k9c = None
    for k in range(len(clicks)):
        r4, tipd = drops(net, *clicks[k])
        if r4 or tipd:
            if r4 or k9c is None:
                k9c = k; plan['p09c_before'] = plan_state(net); r4k, tpk = r4, tipd
                if r4: break
        assert net.next_gen(*clicks[k]) == 'ok'
    # rebuild up to the chosen click
    net = r.Network(S, dp, CAP)
    for k in range(k9c): assert net.next_gen(*clicks[k]) == 'ok'
    plan['p09c_before'] = plan_state(net)
    r4k, tpk = drops(net, *clicks[k9c])
    n_prefix = copy.deepcopy(net)
    assert net.next_gen(*clicks[k9c]) == 'ok'; plan['p09c'] = plan_state(net)
    plan['p09c'].update(dropped=ghost_out(r4k, 'r4') + ghost_out(tpk, 'tip'), n_r4=len(r4k), n_tip=len(tpk), sel=clicks[k9c][0], D=clicks[k9c][1], click_no=k9c + 1)
    net09c = copy.deepcopy(net)
    # strip: the network after each click from PLAN entry to 09c
    nk = r.Network(S, dp, CAP); steps = []
    for k in range(k9c + 1):
        n0 = len(nk.segs); assert nk.next_gen(*clicks[k]) == 'ok'
        st_k = plan_state(nk); st_k.update(new_from=n0, click=list(clicks[k]), added=nk.length() - sum(q['len'] for q in nk.segs[:n0])); steps.append(st_k)
    plan_steps = steps
    # all the clicks of the locked plan
    for k in range(k9c + 1, len(clicks)): assert net.next_gen(*clicks[k]) == 'ok'
    plan['p10'] = plan_state(net)
    assert plan['p10']['clicks'] == [list(c) for c in clicks] and abs(net.length() - net0.length()) < 1e-9
    # 09d: from the 09c plan, Grow to 12 at one slider value until the first refusal. Take the case refused 'cap' with the longest red
    # ghost and at least one generation landing; then Undo back to the 09c plan.
    st = r.DBRANCH_STEP_M
    grid = [r.DBRANCH_MIN_M + st * i for i in range(int(round((r.DBRANCH_MAX_M - r.DBRANCH_MIN_M) / st)) + 1)]
    best = None
    for Dm in grid:
        nd = copy.deepcopy(net09c); grow = []
        while nd.gens[p0] < r.NUMBRANCH_DEFAULT:
            q = nd.next_gen(p0, Dm); grow.append(q)
            if q != 'ok': break
        if grow[-1] != 'cap' or grow.count('ok') < 1: continue
        red = nd.candidates(p0, Dm); rl = sum(k['len'] for k in red)
        if best is None or rl > best[0] + 1e-9: best = (rl, Dm, nd, grow, red)
    assert best is not None, 'no Grow-to-12 case reaches the drill cap'
    rl, D9d, nd, grow, red = best
    room = CAP - nd.length()
    shorter = [x for x in grid if x < D9d and 0 < sum(k['len'] for k in nd.candidates(p0, x)) <= room + 1e-9]
    plan['p09d'] = plan_state(nd); plan['p09d'].update(grow=grow, red=ghost_out(red), red_len=rl, room=room, sel=p0, D=D9d, shorter_fits=shorter,
                                                      n_undo=sum(1 for q in grow if q == 'ok'))
    nu = copy.deepcopy(nd)
    for _ in range(plan['p09d']['n_undo']): nu.undo()
    assert r.segs_close(nu.segs, net09c.segs), 'undo must restore the 09c plan'
    # 09e: drag the portal; its clicks replay at the new column. Moving back replays to the locked plan. Largest quarter-width move that
    # replays every click.
    span = scol[-1] - scol[0]; cand_moves = [span // 4, span // 6, span // 8, 10, 5]; mv = None
    for dcol in cand_moves:
        for sgn in (1, -1):
            want = p0 + sgn * dcol
            st_mv, newp, acc = r.plan_move_portal(S, dp, list(net.clicks), p0, want, CAP)
            if st_mv != 'ok' or len(acc) != len(net.clicks): continue
            to = [q for q in newp if q not in dp][0]
            st_back, backp, backc = r.plan_move_portal(S, newp, acc, to, p0, CAP)
            nb, _, _ = r.replay(S, backp, backc, CAP)
            if st_back == 'ok' and len(backc) == len(net.clicks) and r.segs_close(nb.segs, net.segs): mv = (want, to, newp, acc); break
        if mv: break
    assert mv is not None, 'no portal move replays every click'
    want, to, newp, acc = mv
    nm, acc2, dropped_clicks = r.replay(S, newp, acc, CAP)
    plan['p09e'] = plan_state(nm)
    plan['p09e'].update(frm=p0, to=to, want=want, n_clicks_before=len(net.clicks), n_clicks_after=len(acc))
    # ---------------- RUN: main round (Round class, the S_MID scenario) ----------------
    ps = plan['p10']; budget, b, reserve, rcap = ps['budget'], ps['b'], ps['reserve'], ps['reaim_cap']
    R = mk()
    assert R.budget == budget and R.b == b and R.reserve0 == reserve and R.rcap == rcap
    holes0 = [[tuple(h) for h in hs] for hs in R.holes]
    assert holes0 == [[tuple(h) for h in hs] for hs in ps['holes']], 'Round holes = plan holes'
    segs0 = [dict(q) for q in R.layout]; reach = R.reach
    L0 = finish_side('L', segs0, SEED_MAIN, F, reach); R0 = finish_side('R', holes0, SEED_MAIN, F)
    base = mk().result()
    assert tuple(L0['score']) == base['L'] and tuple(R0['score']) == base['R'] and abs(L0['end'] - base['endL']) < 1e-9 and abs(R0['end'] - base['endR']) < 1e-9
    gp = GOLD['S_P']['GV4']
    assert abs(L0['end'] - gp['left']['end_s']) < TOL and abs(R0['end'] - gp['right']['end_s']) < TOL, 'GV4 base finish times = goldens_v39 S_P.GV4'
    assert L0['score'] == gp['left']['score'] and R0['score'] == gp['right']['score'], 'GV4 base scores = goldens_v39 S_P.GV4'
    # player action 0: the attempt beside a cored hole fires P1 (Vex), and Vex marks a spot
    T_ATT, T_ADD, T_RE = GV4M['add_attempt_t'], GV4M['add_t'], GV4M['reaim_t']
    assert T_ATT < T_ADD < T_RE
    att_col = R0['holes'][0]['col'] + GV4M['add_attempt_offset_cells']
    ra_ = mk().add_hole(T_ATT, att_col)
    assert ra_['status'] == 'ok' and 'P1' in ra_['triggers'], 'GV4m attempt must fire P1'
    spot = ra_['spot']; add_col = spot['col']
    # player action 1: the add hole at Vex's marked column; silent
    Rr = mk(); ad = Rr.add_hole(T_ADD, add_col)
    assert ad['status'] == 'ok' and ad['triggers'] == [] and ad['popup'] is None, 'GV4m add hole must stay silent: %s' % (ad['triggers'],)
    add_depth = ad['depth']
    taken = [h['col'] for h in R0['holes']]; near_cored = min(abs(add_col - q) for q in taken)
    holes1 = [[tuple(h) for h in hs] for hs in Rr.holes]
    R1 = finish_side('R', holes1, SEED_MAIN, F)
    add_pairs = [p for p in R1['pairs'] if add_col in (p['a'], p['b'])]
    assert any(p['sched'] for p in add_pairs), 'the added hole must pair'
    ah = next(h for h in R1['holes'] if h['added'])
    # player action 2: the re-aim (left)
    idx = r.reaim_pick(Rr.net, T_RE, segs=Rr.layout); target = r.REAIM_TARGET
    rr = Rr.reaim(T_RE, idx, target)
    assert rr['status'] == 'ok' and not rr['triggers'], 're-aim must be accepted and silent: %s' % (rr.get('status'), )
    ra = rr['ra']; assert ra['cost'] <= rcap + 1e-9 and ra['clamped']
    segs1 = [dict(q) for q in Rr.layout]; nid = max(q['id'] for q in segs0) + 1
    ids1 = [q['id'] for q in segs1]; new_idx = ids1.index(nid)
    flags1 = {i: ('reaim' if q['id'] == nid else 'regrow') for i, q in enumerate(segs1) if q['id'] >= nid}
    L1 = finish_side('L', segs1, SEED_MAIN, F, reach, Rr.frozen)
    fin = Rr.result()
    assert tuple(L1['score']) == fin['L'] and tuple(R1['score']) == fin['R'] and abs(L1['end'] - fin['endL']) < 1e-9 and abs(R1['end'] - fin['endR']) < 1e-9
    mid = GOLD['S_MID']
    assert abs(L1['end'] - mid['result']['endL']) < TOL and L1['score'] == list(mid['result']['L']), 'left side with the re-aim = goldens_v39 S_MID.result'
    assert idx == mid['reaim']['seg'] and abs(ra['cost'] - mid['reaim']['cost']) < 1e-5 and abs(ra['wantedCost'] - mid['reaim']['wantedCost']) < 1e-5
    out['main'] = dict(plan_steps=plan_steps, F=sorted(map(list, F)), S=sorted(map(list, S)), comps=[len(c) for c in Cs], portals=dp, plan=plan, grow=grow,
                       budget=budget, b=b, reserve=reserve, reaim_cap=rcap, cap=CAP,
                       segs0=[seg_out(q, i) for i, q in enumerate(segs0)], L0=L0, R0=R0,
                       segs1=[seg_out(q, i, {'reaim': flags1.get(i) == 'reaim', 'regrow': flags1.get(i) == 'regrow'}) for i, q in enumerate(segs1)], L1=L1, R1=R1,
                       actions=dict(T_ATT=T_ATT, T_ADD=T_ADD, T_RE=T_RE, att_col=att_col, add_col=add_col, add_depth=add_depth, spot=[spot['centroid'][0], spot['centroid'][1], spot['n_region']],
                                    near_cored=near_cored, add_pairs=[dict(a=p['a'], b=p['b'], n=p['n'], sched=p['sched']) for p in add_pairs],
                                    add_t0=ah['t0'], add_td=ah['td'], att_triggers=ra_['triggers'], add_triggers=ad['triggers'],
                                    reaim=dict(seg=idx, frm=list(ra['frm']), target=list(ra['target']), wanted=list(target), cost=ra['cost'], wantedCost=ra['wantedCost'],
                                               refund=ra['refund'], added=ra['added'], clamped=ra['clamped'], newIdx=new_idx, f=ra['f'])),
                       goldens=dict(base_endL=gp['left']['end_s'], base_endR=gp['right']['end_s'], mid_endL=mid['result']['endL'], mid_reaim_cost=mid['reaim']['cost']))
    # ---------------- pipe, Level 2 (GV2) ----------------
    Fp, Sp = r.pipe_world(); ppo = r.default_portal_surface(Sp); PIPE_CLICKS = [(ppo, D) for D in r.PIPE6_M]
    npipe = r.Network(Sp, [ppo], CAP)
    assert [npipe.next_gen(*c) for c in PIPE_CLICKS] == ['ok'] * len(PIPE_CLICKS)
    pp = plan_state(npipe); hp = [[tuple(h) for h in g] for g in pp['holes']]
    PL = finish_side('L', npipe.segs, SEED_PIPE, Fp, npipe.reach()); PR = finish_side('R', hp, SEED_PIPE, Fp)
    gq = r.play(Fp, Sp, [ppo], PIPE_CLICKS, CAP, seed=SEED_PIPE)
    assert tuple(PL['score']) == gq['L'] and tuple(PR['score']) == gq['R'] and pp['budget'] == gq['budget']
    assert abs(PL['end'] - gq['endL']) < 1e-9 and abs(PR['end'] - gq['endR']) < 1e-9
    g2 = GOLD['S_GV2']
    assert abs(PL['end'] - g2['left']['end_s']) < TOL and abs(PR['end'] - g2['right']['end_s']) < TOL and PL['score'] == g2['left']['score'] and PR['score'] == g2['right']['score'], 'pipe = goldens_v39 S_GV2'
    out['pipe'] = dict(F=sorted(map(list, Fp)), S=sorted(map(list, Sp)), plan=pp, segs0=pp['segs'], L0=PL, R0=PR, clicks=PIPE_CLICKS,
                       goldens=dict(endL=g2['left']['end_s'], endR=g2['right']['end_s']))
    # ---------------- L1 worked round (timing strip only) ----------------
    Fl, Sl = r.l1_world(); pl1 = r.default_portal_surface(Sl)
    g1 = r.play(Fl, Sl, [pl1], [(pl1, D) for D in r.L1_CLICKS_M], r.L1_CAP, 25, 25, seed=SEED_L1)
    g1g = GOLD['S_GV1']
    assert abs(g1['endL'] - g1g['left']['end_s']) < TOL and abs(g1['endR'] - g1g['right']['end_s']) < TOL, 'L1 = goldens_v39 S_GV1'
    out['l1'] = dict(endL=g1['endL'], endR=g1['endR'], goldens=dict(endL=g1g['left']['end_s'], endR=g1g['right']['end_s']))
    rng = r.RADAR_RANGE
    brush = getattr(r, 'BRUSH_M', None)
    if brush is None:
        spec = open(os.path.join(HERE, '..', 'step45_toymaker_spec_v3.md'), encoding='utf8').read()
        mm = re.search(r'^\|\s*brush radii\s*\|\s*([0-9., ]+)m\s*\|', spec, re.M)
        brush = [float(v) for v in mm.group(1).replace(' ', '').split(',') if v]
    clock_samples = [[t, r.clock_str(t)] for t in (0.0, 0.1, 1.0, 4.7, 59.0, 205.0, 235.71038730239707, 264.9002614379085, 400.0, 1e9 / 1e6)]
    out['consts'] = dict(BRUSH_M=brush, R0_M=r.R0_FULL * r.CELL_M, CELL_M=r.CELL_M, RADAR_MIN_GAP=r.RADAR_MIN_GAP, W_GRID=r.W_GRID, H_GRID=r.H_GRID, PORTAL_MIN_SEP=r.PORTAL_MIN_SEP, HOLE_SPACING_R=r.HOLE_SPACING_R,
                         ADVISOR_RADIUS_CELLS=r.P1_RADIUS, COVER_ROWS=getattr(r, 'COVER_ROWS', int(25.0 / r.CELL_M)),   # spec sec 7: P3 barren zone 0 to 25 m (not a sim constant)
                         DBRANCH_STEP_M_SPEC=r.DBRANCH_STEP_M, DRILL_CAP=r.DRILL_CAP,
                         rings=[[d, r.p_reveal(d)] for d in (1, 2, rng // 2, rng)], DBRANCH_MIN_M=r.DBRANCH_MIN_M, DBRANCH_MAX_M=r.DBRANCH_MAX_M, DBRANCH_STEP_M_SIM=r.DBRANCH_STEP_M,
                         NUMBRANCH_DEFAULT=r.NUMBRANCH_DEFAULT, NUMBRANCH_MAX=r.NUMBRANCH_MAX, R0_FULL=r.R0_FULL, RADAR_RANGE=r.RADAR_RANGE,
                         SPEED_L=r.SPEED_L, RIG_DRILL=r.RIG_DRILL, RIG_TRAVEL=r.RIG_TRAVEL, RADAR_SECONDS=r.RADAR_SECONDS,
                         TIME_COMP=r.TIME_COMP, RIG_SPEED_RATIO=r.RIG_SPEED_RATIO, START_MODE=r.START_MODE, sim_sha256=hashlib.sha256(open(r.__file__, 'rb').read()).hexdigest(),   # staleness stamp: ui/fixture.js compares it
                         BORE_BOT_MM=spec_row('borebot bore'), BORE_RIG_MM=spec_row('rig_bore_mm'), ANTFARM_MM=spec_antfarm(), clock_samples=clock_samples,
                         p=[[k, r.p_reveal(k)] for k in (1, 2, 3, 4)])
    def default(o):
        if isinstance(o, (set, tuple)): return list(o)
        raise TypeError(type(o))
    json.dump(out, open(sys.argv[2], 'w'), default=default)
    m = out['main']
    print('mode', r.START_MODE, 'portal', dp, 'tap', tap, 'far tap', far_tap, 'k9c', k9c + 1, 'r4/tip drops', len(r4k), len(tpk))
    print('plan meters', {k: round(v['length'], 3) for k, v in plan.items()}, 'grow', grow, 'red', round(plan['p09d']['red_len'], 3), 'room', round(plan['p09d']['room'], 3), 'D9d', D9d)
    print('09e move', p0, '->', to, 'clicks', len(acc), 'of', len(net.clicks))
    print('budget', budget, b, 'reserve', reserve, 'cap', rcap, 'holes0', [(h['col'], h['depth']) for h in R0['holes']])
    print('base L', L0['score'], 'R', R0['score'], 'end', L0['end'], R0['end'], 'sparse', L0['n_sparse'], R0['n_sparse'])
    print('final L', L1['score'], 'R', R1['score'], 'end', L1['end'], R1['end'])
    print('actions', {k: v for k, v in m['actions'].items() if k != 'reaim'})
    print('reaim', {k: (round(v, 3) if isinstance(v, float) else v) for k, v in m['actions']['reaim'].items() if k not in ('frm', 'target')})
    print('pipe', PL['score'], PR['score'], [(h['col'], h['depth']) for h in PR['holes']], 'ends', PL['end'], PR['end'], 'L1 ends', g1['endL'], g1['endR'])


if __name__ == '__main__':
    main()
