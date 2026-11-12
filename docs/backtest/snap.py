# Pre-registered snapping rule: for cells whose first-pass series has mean < 100 m3/s, probe a 5x5 grid (+-0.1 deg),
# using the 2019 calendar year only, and keep the grid point with the highest mean discharge (the main stem).
import json,os,time,urllib.request,numpy as np
from cells import CELLS
H=os.path.dirname(os.path.abspath(__file__)); out={}
def get(url):
    req=urllib.request.Request(url,headers={"User-Agent":"research-backtest/1.0"})
    return json.loads(urllib.request.urlopen(req,timeout=60).read())
for n,la,lo in CELLS:
    d=json.load(open(f"{H}/cache/{n}.json")); m=np.mean(d["daily"]["river_discharge"])
    if m>=100: continue
    best=None
    for i in range(-2,3):
        for j in range(-2,3):
            la2,lo2=round(la+0.05*i,3),round(lo+0.05*j,3)
            f=f"{H}/cache/probe_{la2}_{lo2}.json"
            if os.path.exists(f): r=json.load(open(f))
            else:
                try: r=get(f"https://flood-api.open-meteo.com/v1/flood?latitude={la2}&longitude={lo2}&daily=river_discharge&start_date=2019-01-01&end_date=2019-12-31")
                except Exception as e: r={"error":str(e)}
                json.dump(r,open(f,"w")); time.sleep(1.1)
            if "daily" not in r: continue
            v=np.mean([x for x in r["daily"]["river_discharge"] if x is not None])
            if best is None or v>best[0]: best=(v,la2,lo2)
    out[n]=best; print(n,best,flush=True)
json.dump(out,open(f"{H}/snapped.json","w"))
