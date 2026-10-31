// dashboard template ke har <script> ka JS syntax node se jaancho (bina browser). Galti ho to exit 1.
const fs = require('fs'), vm = require('vm');
let total = 0;
for (const f of process.argv.slice(2)) {
  const h = fs.readFileSync(f, 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0, bad = 0;
  while ((m = re.exec(h))) {
    i++;
    try { new vm.Script(m[1], { filename: f + '#' + i }); }
    catch (e) { bad++; console.log(f, 'script', i, 'line~', h.slice(0, m.index).split('\n').length, e.message); }
  }
  console.log('   ', f, 'scripts', i, 'errors', bad);
  total += bad;
}
process.exit(total ? 1 : 0);
