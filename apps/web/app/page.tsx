type Incident = {id:string;hazard_type:string;status:string;lat:number;lon:number;created_at:string};
async function getIncidents():Promise<Incident[]> {
  try {
    const response=await fetch((process.env.API_INTERNAL_URL||"http://localhost:8000")+"/v1/exercise/incidents",{cache:"no-store"});
    if(!response.ok) return [];
    return await response.json();
  } catch {return [];}
}
export default async function Home(){
  const incidents=await getIncidents();
  return <main className="shell">
    <aside className="sidebar"><div className="brand">◈ AEGIS <span>EXERCISE</span></div><nav><a href="/">◉ Command Center</a><a href="/admin">⚙ Admin Console</a><a href="http://localhost:8000/docs">↗ API Reference</a></nav><p className="foot">Synthetic data · No operational dispatch</p></aside>
    <section className="content"><header><div><small>CIPHERCOP 2026 / HYDERABAD</small><h1>Emergency Intelligence Command Center</h1><p>Multi-agency operational awareness · exercise environment</p></div><strong className="pill">● SIMULATION MODE</strong></header>
    <div className="metrics"><article><small>Seeded incidents</small><h2>{incidents.length}</h2><p>Database-backed</p></article><article><small>Pending review</small><h2>{incidents.filter(i=>i.status==="review").length}</h2><p>Human checker required</p></article><article><small>Operational alerts sent</small><h2>0</h2><p>Live alerting disabled</p></article></div>
    <div className="panels"><article className="map"><div className="panelhead"><h2>Geospatial overview</h2><span>Hyderabad · schematic view</span></div><div className="mapbody"><div className="ring r1"/><div className="ring r2"/>{incidents.map((i,n)=><div className="marker" key={i.id} style={{left:(n%2?64:42)+"%",top:(n%2?55:37)+"%"}} title={i.hazard_type}>●</div>)}<div className="maplabel">HYDERABAD / EXERCISE GRID</div></div><p className="muted">Schematic display only. True geographic map tiles and geometry rendering are a future milestone.</p></article>
    <article><div className="panelhead"><h2>Incident feed</h2><span>{incidents.length} records</span></div>{incidents.length===0?<p>API unavailable or no seed data.</p>:incidents.map(i=><div className="incident" key={i.id}><strong>{i.hazard_type}</strong><span className="pill">{i.status}</span><p>{i.lat.toFixed(4)}, {i.lon.toFixed(4)}</p></div>)}</article></div>
    </section></main>
}
