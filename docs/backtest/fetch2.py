import json,os,time,urllib.request,numpy as np
from cells import CELLS
H=os.path.dirname(os.path.abspath(__file__)); sn=json.load(open(f"{H}/snapped.json")); final=[]
for n,la,lo in CELLS:
    if n in sn and sn[n]:
        _,la,lo=sn[n]
        old=f"{H}/cache/{n}.json"
        if os.path.exists(old): os.replace(old,f"{H}/cache/firstpass_{n}.json")
        url=f"https://flood-api.open-meteo.com/v1/flood?latitude={la}&longitude={lo}&daily=river_discharge&start_date=2015-01-01&end_date=2026-11-05"
        req=urllib.request.Request(url,headers={"User-Agent":"research-backtest/1.0"})
        open(old,"w").write(urllib.request.urlopen(req,timeout=60).read().decode()); time.sleep(1.5)
    final.append([n,la,lo])
json.dump(final,open(f"{H}/final_cells.json","w"))
for n,la,lo in final:
    v=np.array(json.load(open(f"{H}/cache/{n}.json"))["daily"]["river_discharge"],float)
    print(n,la,lo,len(v),"mean %.1f p90 %.1f min %.2f nan %d"%(np.nanmean(v),np.percentile(v,90),v.min(),np.isnan(v).sum()))
