/* ===========================================================================
   make_pw_hash.js  --  password ka hash banao (taaki code me saada text na rahe)

   Chalao:
       node make_pw_hash.js
   (password poochha jaayega -- screen par nahi dikhega)

   Jo hash mile use server.js ke USERS me purane saade password ki jagah
   paste kar do:

       'admin@jarvis.consulting': { pw: 'scrypt$ab12...$cd34...', role: 'admin' },

   Login bilkul waise hi chalega -- user wahi purana password daalega.
   Farak sirf ye hai ki ab file me password likha hua nahi hai.

   Panel se banaye gaye users ka password pehle se hash me chala jaata hai;
   ye script sirf code me likhe 5 base account ke liye hai.
   =========================================================================== */
'use strict';
const AUTH = require('./auth_lib.js');
const readline = require('readline');

/* Do tareeke se chalta hai:
     - seedha terminal me  -> password poochha jaayega (dikhega nahi)
     - pipe se             -> do lines padh lega (test/script ke liye)
   Pehle sirf readline tha, aur pipe par wo kabhi jawaab nahi deta tha. */
function askAll() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const out = rl.output;
    let hide = false;
    rl.output = { write: function (c) { if (!hide || /[\r\n]/.test(c)) out.write(c); } };
    const one = function (q) {
      return new Promise(function (res) {
        hide = false; out.write(q); hide = true;
        rl.question('', function (a) { hide = false; out.write('\n'); res(a); });
      });
    };
    return one('  Password        : ').then(function (a) {
      return one('  Dobara likho    : ').then(function (b) { rl.close(); return [a, b]; });
    });
  }
  return new Promise(function (res) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (d) { buf += d; });
    process.stdin.on('end', function () {
      const L = buf.split(/\r?\n/);
      res([L[0] || '', L.length > 1 ? L[1] : (L[0] || '')]);
    });
  });
}

(async function () {
  console.log('\n  Password ka hash banane ke liye -- jo type karoge wo dikhega nahi.\n');
  const pair = await askAll();
  const a = pair[0], b = pair[1];
  if (!a) { console.log('\n  Kuch daala hi nahi. Band kar rahe hain.\n'); process.exit(1); }
  if (a !== b) { console.log('\n  Dono alag hain. Dobara chalao.\n'); process.exit(1); }

  const h = AUTH.hashPw(a);
  console.log('\n  Ye line server.js ke USERS me paste karo:\n');
  console.log("      pw: '" + h + "',\n");
  console.log('  Jaanch: ' + (AUTH.verifyPw(h, a).ok ? 'hash sahi hai' : 'HASH GALAT -- mat lagao'));
  console.log('  (user wahi purana password daalega, kuch nahi badla uske liye)\n');
  process.exit(0);
})();
