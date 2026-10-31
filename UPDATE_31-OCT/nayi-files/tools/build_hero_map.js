// Build the hero India map SVG: official state boundaries (India_States_web.geojson)
// + state capitals (India_State_Capitals.geojson), same projection, Delhi as hub.
// Usage: node buildmap.js <states.geojson> <capitals.geojson> <out.svg>
const fs = require('fs');
const [stF, capF, outF] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(stF, 'utf8'));
const cap = JSON.parse(fs.readFileSync(capF, 'utf8'));

let lonMin = 1e9, lonMax = -1e9, latMin = 1e9, latMax = -1e9;
(function w(c) { if (typeof c[0] === 'number') { lonMin = Math.min(lonMin, c[0]); lonMax = Math.max(lonMax, c[0]); latMin = Math.min(latMin, c[1]); latMax = Math.max(latMax, c[1]); return; } c.forEach(w); })(st.features.map(f => f.geometry.coordinates));

const K = Math.cos(22 * Math.PI / 180);           // equirectangular, true scale near 22N
const PAD = 1.5, W = 100;
const sc = (W - 2 * PAD) / ((lonMax - lonMin) * K);
const H = +((latMax - latMin) * sc + 2 * PAD).toFixed(1);
const P = (lon, lat) => [PAD + (lon - lonMin) * K * sc, PAD + (latMax - lat) * sc];

// Douglas-Peucker on projected points
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      // closed ring: start == end, so measure plain distance from that point
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
                         : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const f1 = n => (Math.round(n * 100) / 100).toString();
function ringPath(ring) {
  const raw = ring.map(c => P(c[0], c[1]));
  let pts = dp(raw, 0.12);
  // tiny islands / small patches (Lakshadweep, inter-state pockets): keep them unsimplified
  if (pts.length < 4) pts = raw.length >= 4 ? raw : [];
  if (pts.length < 4) return '';
  let s = 'M' + f1(pts[0][0]) + ' ' + f1(pts[0][1]), lx = pts[0][0], ly = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const x = pts[i][0], y = pts[i][1];
    if (Math.abs(x - lx) < 0.02 && Math.abs(y - ly) < 0.02) continue;
    s += 'L' + f1(x) + ' ' + f1(y); lx = x; ly = y;
  }
  return s + 'Z';
}
let paths = '', nPts = 0;
st.features.forEach(ft => {
  const g = ft.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let d = '';
  polys.forEach(poly => poly.forEach(r => { d += ringPath(r); }));
  if (!d) return;
  nPts += (d.match(/[ML]/g) || []).length;
  const name = String(ft.properties.STATE || '').replace(/&/g, 'and').replace(/"/g, '');
  paths += '<path class="ui-st" data-st="' + name + '" d="' + d + '"/>';
});

let hub = null, dots = '';
cap.features.forEach(ft => {
  const [lon, lat] = ft.geometry.coordinates, [x, y] = P(lon, lat);
  const nm = String(ft.properties.CAPITAL_NA || '').trim();
  if (/NEW DELHI/i.test(nm)) { hub = [x, y]; return; }
  dots += '<circle class="dot" cx="' + f1(x) + '" cy="' + f1(y) + '" r=".62" data-c="' + nm.replace(/"/g, '') + '"/>';
});
if (!hub) throw new Error('New Delhi not found');

const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"'
  + ' data-hx="' + f1(hub[0]) + '" data-hy="' + f1(hub[1]) + '" role="img" aria-label="Map of India">'
  + '<defs><linearGradient id="uiTri" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="' + H + '">'
  + '<stop offset="0" stop-color="rgba(255,153,51,.24)"/><stop offset=".5" stop-color="rgba(255,250,242,.09)"/><stop offset="1" stop-color="rgba(46,160,67,.24)"/>'
  + '</linearGradient></defs>'
  + '<g class="ui-states">' + paths + '</g>' + dots + '</svg>';
fs.writeFileSync(outF, svg);
console.log('W', W, 'H', H, 'states', st.features.length, 'points', nPts, 'capitals', cap.features.length - 1, 'hub', hub.map(f1).join(','), 'bytes', svg.length);
