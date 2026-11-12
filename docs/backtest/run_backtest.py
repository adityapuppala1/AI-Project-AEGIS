"""Rolling-origin back-test of TimesFM 2.5 (same config as services/api/app/statistical_forecast.py). Writes results/origins.csv"""
import os, sys, json, time, numpy as np, pandas as pd
os.environ["HF_HUB_OFFLINE"]="1"
import torch, timesfm
torch.set_num_threads(int(os.environ.get("NT","8")))
H=os.path.dirname(os.path.abspath(__file__))
FINAL=json.load(open(f"{H}/final_cells.json"))   # list of [name,lat,lon]
CTX,HOR,STEP=400,30,int(os.environ.get("STEP","30"))
model=timesfm.TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
model.compile(timesfm.ForecastConfig(max_context=2048,max_horizon=64,normalize_inputs=True,use_continuous_quantile_head=True,
    force_flip_invariance=True,infer_is_positive=True,fix_quantile_crossing=True))
rows=[]; calls=0; t0=time.time(); BATCH=16
for name,la,lo in FINAL:
    d=json.load(open(f"{H}/cache/{name}.json")); dates=pd.to_datetime(d["daily"]["time"]); x=np.array(d["daily"]["river_discharge"],float)
    p90=np.percentile(x,90); n=len(x)
    first=int(np.where(dates>=pd.Timestamp("2020-01-01"))[0][0])
    origins=list(range(first,n-HOR+1,STEP))   # origin index o = first forecast day; context x[o-400:o]
    for b in range(0,len(origins),BATCH):
        ob=origins[b:b+BATCH]
        pt,q=model.forecast(horizon=HOR,inputs=[x[o-CTX:o] for o in ob]); calls+=len(ob)
        for k,o in enumerate(ob):
            act=x[o:o+HOR]; p=np.maximum(pt[k],0); lo10=np.maximum(q[k,:,1],0); hi90=np.maximum(q[k,:,9],0)
            pers=np.full(HOR,x[o-1]); ly=x[o-365:o-365+HOR]
            clim=np.array([np.mean([x[o+h-365*kk] for kk in range(1,6) if o+h-365*kk>=0 and o+h-365*kk<o]) for h in range(HOR)])
            scale=np.mean(np.abs(np.diff(x[o-CTX:o])))
            for h in range(HOR):
                rows.append(dict(cell=name,origin=str(dates[o].date()),origin_idx=o,h=h+1,actual=act[h],model=p[h],q10=lo10[h],q90=hi90[h],
                    persist=pers[h],clim=clim[h],lastyear=ly[h],scale=scale,p90=p90,origin_val=x[o-1]))
    print(name,len(origins),"origins",round(time.time()-t0),"s",flush=True)
os.makedirs(f"{H}/results",exist_ok=True)
pd.DataFrame(rows).to_csv(f"{H}/results/origins.csv",index=False)
json.dump(dict(calls=calls,seconds=time.time()-t0,step=STEP),open(f"{H}/results/run_info.json","w"))
print("done calls",calls,"s",round(time.time()-t0))
