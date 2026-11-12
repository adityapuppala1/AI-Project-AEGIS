import os, json, numpy as np, pandas as pd
H = os.path.dirname(os.path.abspath(__file__)); R = f"{H}/results"
df = pd.read_csv(f"{R}/origins.csv"); rng = np.random.default_rng(7)
df["bucket"] = pd.cut(df.h, [0, 3, 7, 14, 30], labels=["1-3", "4-7", "8-14", "15-30"])
m = pd.to_datetime(df.origin).dt.month
df["season"] = np.select([m.isin([3, 4, 5]), m.isin([6, 7, 8, 9]), m.isin([10, 11])], ["pre-monsoon", "monsoon", "post-monsoon"], "winter")
for k in ["model", "persist", "clim", "lastyear"]:
    df["e_" + k] = (df[k] - df.actual).abs()
df["mase_model"] = df.e_model / df.scale; df["mase_persist"] = df.e_persist / df.scale
df["in"] = ((df.actual >= df.q10) & (df.actual <= df.q90)).astype(float); df["width"] = df.q90 - df.q10
df["all"] = "all"
df["bs"] = df.season + " | " + df.bucket.astype(str)


def skill_cell(g, base):
    return 1 - g.e_model.mean() / g["e_" + base].mean()


def table(by):
    out = []
    for key, g in df.groupby(by, observed=True):
        r = {"group": key, "n_origin_cells": g.groupby(["cell", "origin"]).ngroups}
        for b in ["persist", "clim", "lastyear"]:
            cs = np.array([skill_cell(c, b) for _, c in g.groupby("cell") if c["e_" + b].mean() > 0])
            r["skill_vs_" + b] = cs.mean(); r["frac_cells_beating_" + b] = (cs > 0).mean()
        r["MASE_model"] = g.mase_model.mean(); r["MASE_persist"] = g.mase_persist.mean()
        r["coverage_10_90"] = g["in"].mean(); r["width_rel_level"] = g.width.mean() / g.actual.mean()
        out.append(r)
    return pd.DataFrame(out)


T = {k: table(k) for k in ["all", "bucket", "season", "bs"]}
for k, t in T.items():
    t.to_csv(f"{R}/table_{k}.csv", index=False)
pc = pd.DataFrame([dict(cell=c, skill_persist=skill_cell(g, "persist"), skill_clim=skill_cell(g, "clim"), skill_lastyear=skill_cell(g, "lastyear"),
                        coverage=g["in"].mean(), mean_level=g.actual.mean()) for c, g in df.groupby("cell")])
pc.to_csv(f"{R}/table_per_cell.csv", index=False)


def boot(sub, base, B=2000):
    agg = {c: g.groupby("origin").agg(m=("e_model", "sum"), b=("e_" + base, "sum")).values for c, g in sub.groupby("cell")}
    names = list(agg); res = []
    for _ in range(B):
        sk = []
        for c in rng.choice(len(names), len(names)):
            a = agg[names[c]]; s = a[rng.integers(0, len(a), len(a))].sum(0)
            if s[1] > 0:
                sk.append(1 - s[0] / s[1])
        res.append(np.mean(sk))
    return np.percentile(res, [2.5, 97.5])


B = []
groups = [("all", df)] + [(f"days {b}", df[df.bucket == b]) for b in ["1-3", "4-7", "8-14", "15-30"]] + [(s, df[df.season == s]) for s in ["pre-monsoon", "monsoon", "post-monsoon", "winter"]]
for grp, sub in groups:
    for base in ["persist", "clim", "lastyear"]:
        pt = np.mean([skill_cell(c, base) for _, c in sub.groupby("cell")]); lo, hi = boot(sub, base)
        B.append(dict(group=grp, baseline=base, skill=pt, ci_lo=lo, ci_hi=hi))
B = pd.DataFrame(B); B.to_csv(f"{R}/table_skill_bootstrap.csv", index=False)

rows = []
for (c, o), g in df.groupby(["cell", "origin"]):
    g = g.sort_values("h"); p90 = g.p90.iloc[0]
    if g.actual.max() > p90 and g.origin_val.iloc[0] <= p90:
        ia = int(g.actual.values.argmax())
        rows.append(dict(cell=c, origin=o, season=g.season.iloc[0], actual_peak=g.actual.max(), model_peak=g.model.max(), persist_peak=g.persist.max(),
                         clim_peak=g.clim.max(), peak_ratio=g.model.max() / g.actual.max(), ratio_at_peak_day=g.model.values[ia] / g.actual.values[ia], peak_day=ia + 1,
                         q90_cov_peak_day=bool(g.q90.values[ia] >= g.actual.max()), max_q90_cov_peak=bool(g.q90.max() >= g.actual.max()),
                         mae_model=g.e_model.mean(), mae_persist=g.e_persist.mean(), mae_clim=g.e_clim.mean(), mae_lastyear=g.e_lastyear.mean(),
                         scale=g.actual.mean()))
rh = pd.DataFrame(rows); rh.to_csv(f"{R}/rising_high_flow.csv", index=False)
info = json.load(open(f"{R}/run_info.json"))
S = dict(cells=int(df.cell.nunique()), origins=int(df.groupby(["cell", "origin"]).ngroups), rows=len(df), calls=info["calls"], seconds=info["seconds"], rising_n=len(rh))
if len(rh):
    S.update(rising_cells=int(rh.cell.nunique()), peak_ratio_median=rh.peak_ratio.median(), peak_ratio_q25=rh.peak_ratio.quantile(.25), peak_ratio_q75=rh.peak_ratio.quantile(.75),
             frac_peak_underestimated=(rh.peak_ratio < 1).mean(), frac_ratio_lt_half=(rh.peak_ratio < .5).mean(), q90_cov_peak_day=rh.q90_cov_peak_day.mean(),
             max_q90_cov_peak=rh.max_q90_cov_peak.mean(), persist_peak_ratio_median=(rh.persist_peak / rh.actual_peak).median(), clim_peak_ratio_median=(rh.clim_peak / rh.actual_peak).median(),
             skill_vs_persist_cellwise=float(np.mean([1 - g.mae_model.mean() / g.mae_persist.mean() for _, g in rh.groupby("cell")])),
             skill_vs_clim_cellwise=float(np.mean([1 - g.mae_model.mean() / g.mae_clim.mean() for _, g in rh.groupby("cell")])),
             skill_vs_lastyear_cellwise=float(np.mean([1 - g.mae_model.mean() / g.mae_lastyear.mean() for _, g in rh.groupby("cell")])))
    v = rh.peak_ratio.values; S["peak_ratio_median_ci"] = list(np.percentile([np.median(rng.choice(v, len(v))) for _ in range(2000)], [2.5, 97.5]))
    v = rh.q90_cov_peak_day.values.astype(float); S["q90_cov_peak_day_ci"] = list(np.percentile([rng.choice(v, len(v)).mean() for _ in range(2000)], [2.5, 97.5]))
json.dump(S, open(f"{R}/summary.json", "w"), indent=1, default=float)
pd.set_option("display.width", 250, "display.max_columns", 30, "display.float_format", "{:.3f}".format)
for k, t in T.items():
    print(k); print(t.to_string(index=False))
print(B.to_string(index=False)); print(pc.to_string(index=False)); print(json.dumps(S, indent=1, default=float))

import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig, ax = plt.subplots(1, 2, figsize=(11, 4))
bb = B[B.group.str.startswith("days") | (B.group == "all")]
lab = {"persist": "repeat last value", "clim": "seasonal average", "lastyear": "same days last year"}
for i, base in enumerate(["persist", "clim", "lastyear"]):
    s = bb[bb.baseline == base]; x = np.arange(len(s)) + (i - 1) * 0.25
    ax[0].bar(x, s.skill, 0.25, yerr=[s.skill - s.ci_lo, s.ci_hi - s.skill], label="vs " + lab[base], capsize=2)
ax[0].set_xticks(range(len(s))); ax[0].set_xticklabels(s.group); ax[0].axhline(0, color="k", lw=.8)
ax[0].set_ylabel("skill (>0 = smaller error than baseline)"); ax[0].set_title("Error reduction vs baseline (95% interval)"); ax[0].legend(fontsize=7)
t = T["season"].set_index("group"); ax[1].bar(t.index, t.coverage_10_90 * 100, color="#4477aa"); ax[1].axhline(80, color="r", ls="--")
ax[1].set_title("Actual values inside the 10-90% range (target 80%)"); ax[1].set_ylabel("%")
plt.tight_layout(); plt.savefig(f"{R}/chart_skill_coverage.png", dpi=130)
fig, ax = plt.subplots(1, 2, figsize=(11, 4))
if len(rh):
    ax[0].hist(rh.peak_ratio.clip(upper=3), bins=25, color="#cc6677"); ax[0].axvline(1, color="k")
    ax[0].set_title("Rising high flows: forecast peak / actual peak"); ax[0].set_xlabel("ratio (clipped at 3)")
cc = df.groupby(["cell", "bucket"], observed=True)["in"].mean().unstack(); cc.plot.bar(ax=ax[1]); ax[1].axhline(.8, color="r", ls="--")
ax[1].set_title("Coverage of 10-90% range by cell and horizon"); ax[1].legend(fontsize=6, title="day")
plt.tight_layout(); plt.savefig(f"{R}/chart_high_flow_and_cells.png", dpi=130)
