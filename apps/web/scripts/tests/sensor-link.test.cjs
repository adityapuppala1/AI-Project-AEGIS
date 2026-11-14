const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '../..');
function load(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
  return mod.exports;
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const p = load('lib/patent.ts');
const sc = id => p.scenarioById(id);

test('patent constant holds the exact facts', () => {
  assert.equal(p.PATENT.number, '598835');
  assert.equal(p.PATENT.applicationNumber, '201741007139');
  assert.equal(p.PATENT.filed, '28 February 2017');
  assert.equal(p.PATENT.granted, '12 August 2026');
  assert.equal(p.PATENT.termYears, 20);
  assert.equal(p.PATENT.patentee, 'Bharath Bejjarapu');
  assert.equal(p.PATENT.title, 'Dynamic Bandwidth System for IoT Networks via Satellite and Internet Infrastructure');
  const credit = read('components/patent-credit.tsx');
  assert.ok(credit.includes('Indian Patent No. 598835 · granted 12 August 2026 · Patentee: Bharath Bejjarapu, co-owner of IndTrana'));
  assert.ok(credit.includes('Application No. 201741007139 · filed 28 February 2017'));
});

test('allocator is deterministic', () => {
  for (const s of p.SCENARIOS) assert.deepEqual(p.allocate(s), p.allocate(s));
  assert.deepEqual(p.allocate(sc('ground_cut'), { triggerNear: true }), p.allocate(sc('ground_cut'), { triggerNear: true }));
});

test('no lane is ever over capacity, with or without trigger near', () => {
  for (const s of p.SCENARIOS) for (const triggerNear of [false, true]) {
    const r = p.allocate(s, { triggerNear });
    for (const lane of ['ground', 'satellite']) {
      assert.ok(r.lanes[lane].used <= r.lanes[lane].capacity, `${s.id} ${lane}`);
      const sum = r.nodes.filter(n => n.link === lane).reduce((a, n) => a + n.allocated, 0);
      assert.equal(sum, r.lanes[lane].used);
    }
    for (const n of r.nodes) assert.ok(n.allocated <= n.demand);
  }
});

test('a higher priority is never reduced while a lower one on the same lane is fully delivered', () => {
  for (const s of p.SCENARIOS) for (const triggerNear of [false, true]) {
    const r = p.allocate(s, { triggerNear });
    for (const hi of r.nodes) for (const lo of r.nodes) {
      if (hi.node.priority < lo.node.priority && hi.link && hi.link === lo.link && hi.state === 'reduced') {
        assert.notEqual(lo.state, 'delivered', `${s.id}: ${hi.node.id} vs ${lo.node.id}`);
      }
    }
  }
});

test('normal delivers everything; ground cut moves priority sensors to satellite', () => {
  const normal = p.allocate(sc('normal'));
  assert.ok(normal.nodes.every(n => n.state === 'delivered'));
  const cut = p.allocate(sc('ground_cut'));
  const life = cut.nodes.filter(n => n.node.priority === 1);
  assert.ok(life.every(n => n.link === 'satellite' && n.allocated > 0 && n.moved));
  assert.equal(cut.lanes.ground.used, 0);
  assert.ok(cut.nodes.some(n => n.state === 'held'));
  assert.ok(cut.nodes.filter(n => n.node.priority === 4).every(n => n.state === 'held'));
});

test('both down: everything offline and nothing allocated', () => {
  const r = p.allocate(sc('both_down'));
  assert.ok(r.nodes.every(n => n.state === 'offline' && n.allocated === 0 && n.link === null));
  assert.equal(r.totals.allocated, 0);
  assert.match(p.summarise(r), /buffered at the sensor until a link returns/);
});

test('trigger near raises the gauge allocation without exceeding capacity', () => {
  for (const id of ['normal', 'ground_degraded', 'ground_cut']) {
    const base = p.allocate(sc(id)).nodes.find(n => n.node.near);
    const raised = p.allocate(sc(id), { triggerNear: true });
    const gauge = raised.nodes.find(n => n.node.near);
    assert.ok(gauge.allocated > base.allocated, id);
    assert.ok(gauge.boosted);
    for (const lane of ['ground', 'satellite']) assert.ok(raised.lanes[lane].used <= raised.lanes[lane].capacity);
  }
});

test('summarise uses correct singular and plural for counts 0, 1 and many', () => {
  for (const s of p.SCENARIOS) for (const triggerNear of [false, true]) {
    const r = p.allocate(s, { triggerNear }), text = p.summarise(r);
    if (s.id === 'both_down') { assert.equal(text, 'No link. Readings are buffered at the sensor until a link returns.'); continue; }
    assert.ok(text.startsWith(p.SUMMARY_TEXTS[s.id]));
    const { movedToSatellite: m, reduced: d, held: h } = r.totals;
    assert.equal(text.includes('moved to satellite'), m > 0);
    if (m === 1) assert.ok(text.includes('1 sensor moved to satellite.'));
    assert.equal(/\b1 sensors|\b1 feeds/.test(text), false);
    if (d === 1) assert.ok(text.includes('1 sensor reduced to the capacity left.'));
    if (d === 0) assert.ok(!text.includes('reduced'));
    if (h === 0) assert.ok(text.includes('Nothing held.'));
    else assert.ok(text.includes(h + (h === 1 ? ' lower-priority feed held' : ' lower-priority feeds held')));
    assert.ok(!/routine feeds/.test(text));
  }
  const fake = n => ({ scenario: sc('ground_cut'), totals: { movedToSatellite: n, reduced: n, held: n } });
  assert.equal(p.summarise(fake(1)), 'Ground network cut. 1 sensor moved to satellite. 1 sensor reduced to the capacity left. 1 lower-priority feed held until capacity returns.');
  assert.equal(p.summarise(fake(0)), 'Ground network cut. Nothing held.');
  assert.equal(p.summarise(fake(3)), 'Ground network cut. 3 sensors moved to satellite. 3 sensors reduced to the capacity left. 3 lower-priority feeds held until capacity returns.');
  assert.ok(p.summarise(fake(2), x => '[' + x + ']').startsWith('[Ground network cut.] 2 [sensors moved'));
});

test('trigger near never takes from another life-safety gauge, and held means nothing allocated', () => {
  for (const s of p.SCENARIOS) {
    const base = p.allocate(s), boost = p.allocate(s, { triggerNear: true });
    boost.nodes.forEach((n, i) => {
      if (n.node.priority !== 1) return;
      if (n.node.near) assert.ok(n.allocated >= base.nodes[i].allocated, s.id);
      else { assert.equal(n.allocated, base.nodes[i].allocated, s.id + n.node.id); assert.equal(n.state, base.nodes[i].state); }
    });
    for (const r of [base, boost]) for (const n of r.nodes) if (n.state === 'held') assert.equal(n.allocated, 0);
    for (const lane of ['ground', 'satellite']) assert.ok(boost.lanes[lane].used <= boost.lanes[lane].capacity);
  }
  const sr = p.allocate(sc('satellite_reduced'), { triggerNear: true });
  assert.ok(sr.nodes.filter(n => n.node.priority === 1).every(n => n.state !== 'held'));
});

test('communication parties follow the links', () => {
  assert.equal(p.COMM_PARTIES.length, 7);
  assert.ok(p.COMM_PARTIES.every(x => p.commLink(x.id, sc('normal')) === 'ground'));
  assert.ok(p.COMM_PARTIES.every(x => p.commLink(x.id, sc('ground_degraded')) === 'ground'));
  assert.ok(p.COMM_PARTIES.every(x => p.commLink(x.id, sc('ground_cut')) === 'satellite'));
  assert.ok(p.COMM_PARTIES.every(x => p.commLink(x.id, sc('both_down')) === 'none'));
});

test('page, credit and docs carry the limits and none of the forbidden claims', () => {
  const page = read('components/sensor-link.tsx') + read('components/patent-credit.tsx') + read('lib/patent.ts');
  for (const phrase of [
    "This page illustrates, in a rehearsal simulation, how the idea named in the title of Indian Patent No. 598835 would serve IndTrana. The priority classes and switch-over rules shown are IndTrana's rehearsal choices, not the patent's claims.",
    "Described here from the patent's title and the public publication notice; the full specification has not been reviewed for this page.",
    'This mapping is based on the patent title and the public publication notice only. It will be checked against the full specification before any wider claim is made.',
    'Ground network cut; life-safety gauges keep reporting over satellite, and lower-priority feeds wait.',
    'Rain bands arrive and towers start to fail; ground capacity is reduced and the lowest-priority feeds start to wait.',
    'Satellite capacity is reduced; life-safety gauges are served first and lower-priority feeds wait.',
    "The patent's title names a dynamic bandwidth system for sensor (IoT) networks over satellite and internet infrastructure. IndTrana applies that idea to its Sense step and to control-room, desk and team contact, as a rehearsal.",
    'Nothing is transmitted. No satellite or radio link is used.',
    'synthetic rehearsal values, not measurements',
    'A field deployment would need dedicated hardware and licensed satellite capacity.',
    'in-app rehearsal',
  ]) assert.ok(page.includes(phrase), phrase);
  const readme = read('../../README.md'), start = readme.indexOf('## Patented technology');
  const scanned = page + read('../../docs/PATENT_SENSOR_LINK.md') + readme.slice(start, readme.indexOf('\n## ', start + 5));
  assert.doesNotMatch(page, /\d\s?%/);
  assert.doesNotMatch(scanned, /accuracy|guarantee|uptime/i);
  assert.doesNotMatch(scanned, /IndTrana is patented/i);
  assert.doesNotMatch(scanned, /demonstrates the idea of|patented system's hardware/i);
  const landing = read('components/welcome/welcome-experience.tsx');
  assert.ok(landing.includes('id="wl-patent"'));
  assert.doesNotMatch(landing.slice(landing.indexOf('id="wl-patent"'), landing.indexOf('id="wl-status"')), /href="\/sensor-link"/);
});

test('storm timeline: five ordered steps, each a valid scenario, first and last Normal, landfall Ground cut', () => {
  assert.equal(p.STORM_STEPS.length, 5);
  const ids = p.SCENARIOS.map(s => s.id);
  for (const step of p.STORM_STEPS) { assert.ok(ids.includes(step.scenario), step.id); assert.ok(step.sees.length > 0 && step.moment.length > 0 && step.touches.length > 0); }
  assert.equal(p.STORM_STEPS[0].scenario, 'normal');
  assert.equal(p.STORM_STEPS[4].scenario, 'normal');
  assert.equal(p.STORM_STEPS.find(s => s.id === 'landfall').scenario, 'ground_cut');
  assert.equal(new Set(p.STORM_STEPS.map(s => s.id)).size, 5);
  assert.doesNotMatch(p.STORM_STEPS.map(s => s.sees).join(' '), /\d\s?%|accuracy|guarantee|uptime/i);
});

test('what stays possible is derived from the allocation, as counts', () => {
  for (const s of p.SCENARIOS) {
    const r = p.allocate(s), f = p.stayingPossible(r);
    const life = r.nodes.filter(n => n.node.priority === 1);
    assert.equal(f.lifeSafetyTotal, life.length);
    assert.equal(f.lifeSafetyReporting, life.filter(n => n.state === 'delivered' || n.state === 'reduced').length, s.id);
    assert.equal(f.held, r.totals.held);
    assert.equal(f.contact, p.commLink('cr', s));
  }
  const cut = p.stayingPossible(p.allocate(sc('ground_cut')));
  assert.equal(cut.lifeSafetyReporting, cut.lifeSafetyTotal);
  assert.equal(cut.contact, 'satellite');
  const none = p.stayingPossible(p.allocate(sc('both_down')));
  assert.equal(none.lifeSafetyReporting, 0);
  assert.equal(none.contact, 'none');
  assert.equal(p.PATENT.publishedDescription, 'The published application describes an aggregated IoT platform with dedicated IoT networks connected by satellite and internet infrastructure, for providing bandwidth on demand.');
});

test('new docs sections and cross-links keep the limits; guided exercise still has 11 stages', () => {
  const section = (text, from, to) => { const a = text.indexOf(from); assert.ok(a >= 0, from); const b = text.indexOf(to, a + from.length); return text.slice(a, b < 0 ? undefined : b); };
  const demo = read('../../docs/DEMO_GUIDE.md'), govt = read('../../docs/GOVT_DEPLOYMENT_READINESS.md'), arch = read('../../docs/ARCHITECTURE.md');
  const scanned = section(demo, '- **Resilient Sensor Link**', '\n- Each page')
    + section(govt, '## Sensor link resilience', '\n## Suggested order')
    + section(arch, '## Resilient Sensor Link', '\n## Request boundary');
  assert.ok(demo.includes('This is a rehearsal simulation of the idea in the title of Indian Patent No. 598835; nothing is transmitted.'));
  assert.doesNotMatch(scanned, /accuracy|guarantee|uptime|\d\s?%/i);
  assert.doesNotMatch(scanned, /IndTrana is patented/i);
  const links = Object.values(p.SENSOR_LINK_LINKS).join(' ');
  assert.doesNotMatch(links, /accuracy|guarantee|uptime|\d\s?%/i);
  assert.ok(read('components/team-availability.tsx').includes('/sensor-link#communication'));
  assert.ok(read('components/sensor-link.tsx').includes('id="communication"'));
  assert.ok(read('components/source-health-summary.tsx').includes('href="/sensor-link"'));
  const journey = read('components/demo-journey.tsx');
  assert.equal((journey.match(/^    playbook: /gm) || []).length, 11);
  assert.equal((journey.match(/also: \{/g) || []).length, 1);
});

test('per-step facts, chain names, contact sentences, both-down strip, headings, keyboard and anchors', () => {
  const nav = load('lib/navigation.ts');
  for (const step of p.STORM_STEPS) for (const name of step.touches) assert.ok(nav.CHAIN.includes(name), name);
  const facts = id => p.stayingPossible(p.allocate(sc(p.STORM_STEPS.find(s => s.id === id).scenario)));
  for (const id of ['landfall', 'peak']) { const f = facts(id); assert.equal(f.lifeSafetyReporting, f.lifeSafetyTotal, id); }
  assert.equal(facts('recovery').held, 0);
  assert.ok(facts('peak').held > 0);
  assert.ok(facts('bands').held > 0, 'bands: lowest-priority feeds wait');
  const contacts = new Set(p.SCENARIOS.map(s => p.stayingPossible(p.allocate(s)).contact));
  assert.deepEqual([...contacts].sort(), ['ground', 'none', 'satellite']);
  for (const key of ['contactGround', 'contactSatellite', 'contactNone']) assert.ok(p.POSSIBLE_TEXTS[key].length > 0);
  const off = p.stayingPossible(p.allocate(sc('both_down')));
  assert.equal(off.allOffline, true);
  assert.equal(`${p.POSSIBLE_TEXTS.offlineHead} ${off.sensorTotal} ${p.POSSIBLE_TEXTS.offlineTail}`, 'All 12 sensors are offline in this simulation; readings wait at the sensor.');
  assert.equal(p.stayingPossible(p.allocate(sc('ground_cut'))).allOffline, false);
  assert.ok(read('../../docs/GOVT_DEPLOYMENT_READINESS.md').includes('\n## Suggested order\n'));
  assert.ok(read('../../docs/GOVT_DEPLOYMENT_READINESS.md').indexOf('## Suggested order') > read('../../docs/GOVT_DEPLOYMENT_READINESS.md').indexOf('## Sensor link resilience'));
  assert.ok(read('../../docs/DEMO_GUIDE.md').includes('\n- Each page has'));
  assert.ok(read('../../docs/ARCHITECTURE.md').includes('\n## Request boundary'));
  assert.equal(p.SENSOR_LINK_LINKS.commandCenter, 'Sensor link rehearsal: how readings could be prioritised when the ground network fails');
  const page = read('components/sensor-link.tsx');
  assert.ok(page.includes('aria-disabled={atStart}') && page.includes('aria-disabled={atEnd}'));
  assert.doesNotMatch(page, /disabled=\{step/);
  assert.ok(page.includes('scroll-mt-24') && read('components/patent-credit.tsx').includes('scroll-mt-24'));
  assert.ok(read('app/response-teams/page.tsx').includes('TeamAvailability'));
});

test('the page stays behind the sign-in gate and is in the menu with help', () => {
  const gate = load('lib/session-gate.ts');
  assert.equal(gate.isPublicPath('/sensor-link'), false);
  assert.equal(gate.isPublicPath('/patent/patent-598835-certificate.pdf'), false);
  assert.equal(p.PATENT.certificatePath, '/patent/patent-598835-certificate.pdf');
  assert.ok(fs.existsSync(path.join(root, 'public', p.PATENT.certificatePath)));
  assert.match(read('components/patent-credit.tsx'), /target="_blank" rel="noopener noreferrer"/);
  assert.ok(!read('components/welcome/welcome-experience.tsx').includes('certificate'));
  const nav = load('lib/navigation.ts');
  assert.ok(nav.allPages.some(x => x.href === '/sensor-link'));
  assert.ok(load('lib/page-help.ts').PAGE_HELP['/sensor-link']);
});
