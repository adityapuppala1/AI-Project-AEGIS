import json, os, time, urllib.request, sys
from cells import CELLS
HERE=os.path.dirname(os.path.abspath(__file__)); C=os.path.join(HERE,"cache")
END="2026-11-05"
for name,lat,lon in CELLS:
    f=os.path.join(C,name+".json")
    if os.path.exists(f): continue
    url=f"https://flood-api.open-meteo.com/v1/flood?latitude={lat}&longitude={lon}&daily=river_discharge&start_date=2015-01-01&end_date={END}"
    req=urllib.request.Request(url,headers={"User-Agent":"research-backtest/1.0"})
    try:
        d=urllib.request.urlopen(req,timeout=60).read().decode()
    except Exception as e:
        d=json.dumps({"error":str(e)})
    open(f,"w").write(d); print(name,len(d),d[:120] if "error" in d[:20] else ""); time.sleep(1.5)
