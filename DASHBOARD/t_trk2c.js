/* t_trk2c.js -- runOnce ka asli paging test.
   X aur Mongo dono nakli; sawaal ek hi: GEHRAI window se tay hoti hai ya nahi.
   Yahi sabse nazuk badlaav hai, isliye ye test end-to-end chalta hai. */
'use strict';
var P = 0, F = 0, FAILS = [];
function ok(c, m) { if (c) P++; else { F++; FAILS.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); }
function sec(t) { console.log('\n== ' + t + ' =='); }

var https = require('https');
var XL = require('./x_live.js');
var XS = require('./x_scraper.js');

/* ---------- nakli X ---------- */
var PAGES = [], HITS = [];
function tw(id, hoursAgo, screen) {
  var d = new Date(Date.now() - hoursAgo * 3600 * 1000);
  return { entryId: 'tweet-' + id, content: { itemContent: { tweet_results: { result: {
    legacy: { id_str: String(id), created_at: d.toUTCString(), full_text: 'tweet ' + id,
      reply_count: 1, favorite_count: 2, retweet_count: 3, bookmark_count: 4 },
    views: { count: '500' },
    core: { user_results: { result: { legacy: { screen_name: screen || 'testee',
      followers_count: 1000, friends_count: 10, statuses_count: 50, created_at: 'Mon Jan 01 00:00:00 +0000 2020' } } } }
  } } } } };
}
function page(entries, cursor) {
  var e = entries.slice();
  if (cursor) e.push({ entryId: 'cursor-bottom-1', content: { value: cursor } });
  return { data: { user: { result: { timeline: { timeline: { instructions: [
    { type: 'TimelineAddEntries', entries: e } ] } } } } } };
}

https.request = function (opt, cb) {
  var n = HITS.length; HITS.push(opt.path);
  var body = JSON.stringify(PAGES[Math.min(n, PAGES.length - 1)] || page([]));
  var r = { statusCode: 200, setEncoding: function () {}, destroy: function () {},
    on: function (ev, f) { if (ev === 'data') f(body); if (ev === 'end') setImmediate(f); return r; } };
  setImmediate(function () { cb(r); });
  return { setTimeout: function () {}, on: function () {}, end: function () {}, destroy: function () {} };
};

XL.ready = function () { return true; };
XL.headersFor = function () { return { authorization: 'x', cookie: 'x' }; };
XL.fetchProfile = async function (h) { return { ok: true, prof: { userId: '42', name: 'Test ' + h } }; };

/* MAP stub -- 'testee' handle_master.json me nahi hai, to mapping gate uske
   tweet rok leta (yahi sahi hai). Ye file PAGING jaanchti hai, isliye yahan
   har handle ko "mapped" maan lete hain. Gate ka apna test t_trk6.js hai. */
XS.MAP.columnsFor = function () { return { State: 'Test State', Party: 'TP' }; };
XS.SENT.tag = async function (t) {
  return t.map(function () { return { label: 'Neutral', score: 0 }; }); };

/* ---------- nakli Mongo ---------- */
function mkDb(handles, cfg) {
  var saved = [], updates = [];
  var db = { collection: function (name) {
    if (name === 'tracker_cfg') return { findOne: async function () { return cfg || null; },
      updateOne: async function () {} };
    if (name === 'tracked_handles') return {
      find: function () { return { sort: function () { return { toArray: async function () { return handles; } }; } }; },
      updateOne: async function (f, u) { updates.push({ id: f._id, u: u }); } };
    if (name === 'master_tweets') return {
      find: function () { return { projection: null, toArray: async function () { return []; },
        sort: function(){return this;}, skip: function(){return this;}, limit: function(){return this;},
        maxTimeMS: function(){return this;} }; },
      bulkWrite: async function (ops) { ops.forEach(function (o) { saved.push(o.updateOne.filter._id); }); } };
    return { find: function () { return { toArray: async function () { return []; } }; },
      updateOne: async function () {}, bulkWrite: async function () {} };
  } };
  return { getDb: async function () { return { db: db, close: async function () {} }; },
    saved: saved, updates: updates };
}
function reset() { HITS = []; XS._state.lastResult = null; }

(async function () {

sec('1. Pinned tweet poore handle ko nahi rokta  <-- purana bug');
/* page 0: sabse upar ek 2 saal purana pinned tweet, uske baad 5 taaza.
   Purana code pehle purane tweet par hi stop=true kar deta tha, isliye
   us handle ke taaza tweet kabhi save hi nahi hote the. */
reset();
PAGES = [
  page([tw(1, 17520), tw(2, 1), tw(3, 2), tw(4, 3), tw(5, 4), tw(6, 5)], 'C1'),
  page([tw(7, 6), tw(8, 7), tw(9, 8), tw(10, 9), tw(11, 10)], 'C2'),
  page([tw(90, 200), tw(91, 300)], 'C3')          /* 72-ghante window se bahar */
];
var m = mkDb([{ _id: 'testee', active: true }], { _id: 'tracker', windowHours: 72, intervalMin: 30 });
var r = await XS.runOnce(m.getDb);
ok(r.ok === true, 'run poora hua');
ok(m.saved.indexOf('2') >= 0 && m.saved.indexOf('6') >= 0,
   'pinned tweet ke neeche wale taaza tweet save hue');
ok(m.saved.indexOf('1') < 0, 'pinned (2 saal purana) tweet save nahi hua');
ok(m.saved.indexOf('7') >= 0 && m.saved.indexOf('11') >= 0,
   'DOOSRA page bhi padha gaya (pehle yahan pahunchta hi nahi tha)');
ok(m.saved.indexOf('90') < 0 && m.saved.indexOf('91') < 0, 'window se bahar ke tweet save nahi hue');
ok(m.saved.length === 10, 'theek 10 tweet save hue: ' + m.saved.length);

sec('2. Window khatam hone par turant rukta hai (page barbaad nahi)');
var gqlHits = HITS.filter(function (p) { return p.indexOf('UserTweets') >= 0; }).length;
ok(gqlHits === 3, 'teen page padhe aur ruk gaya -- chautha nahi (' + gqlHits + ')');

sec('3. Shuru se kuch na mile to ek page aur dekhta hai, phir chhodta hai');
reset();
PAGES = [page([tw(1, 9000)], 'C1'), page([tw(2, 9100)], 'C2'), page([tw(3, 9200)], 'C3'),
         page([tw(4, 9300)], 'C4')];
m = mkDb([{ _id: 'testee', active: true }], { _id: 'tracker', windowHours: 24, intervalMin: 30 });
r = await XS.runOnce(m.getDb);
ok(m.saved.length === 0, 'kuch save nahi hua (sab purana)');
gqlHits = HITS.filter(function (p) { return p.indexOf('UserTweets') >= 0; }).length;
ok(gqlHits === 2, 'do page dekh kar chhod diya (' + gqlHits + ') -- anant page nahi padhe');

sec('4. Gehrai window ke saath badhti hai (page ka fix number nahi)');
/* 40 page, har page me taaza tweet -- 24 ghante window me bhi scraper
   tab tak jaata hai jab tak tweet andar hain. Purana code 4 page par
   ruk jaata tha, chahe window kitna bada ho. */
reset();
PAGES = [];
for (var i = 0; i < 40; i++) PAGES.push(page([tw(1000 + i, 1)], 'C' + i));
PAGES.push(page([tw(9999, 99999)], null));
m = mkDb([{ _id: 'testee', active: true }], { _id: 'tracker', windowHours: 72, intervalMin: 30 });
r = await XS.runOnce(m.getDb);
ok(m.saved.length === 40, '40 page ke saare tweet aaye (' + m.saved.length + ') -- 4 par nahi ruka');
gqlHits = HITS.filter(function (p) { return p.indexOf('UserTweets') >= 0; }).length;
ok(gqlHits === 41, 'window khatam hone par ruka, 41 page (' + gqlHits + ')');

sec('5. Runaway guard -- cursor loop me bhi anant page nahi');
reset();
PAGES = [];
for (var k = 0; k < 400; k++) PAGES.push(page([tw(2000 + k, 1)], 'C' + k));
m = mkDb([{ _id: 'testee', active: true }], { _id: 'tracker', windowHours: 24, intervalMin: 30 });
r = await XS.runOnce(m.getDb);
gqlHits = HITS.filter(function (p) { return p.indexOf('UserTweets') >= 0; }).length;
ok(gqlHits === XS.pagesFor(24), 'pagesFor(24)=' + XS.pagesFor(24) + ' par ruk gaya (' + gqlHits + ')');
ok(gqlHits < 400, 'anant page nahi padhe');
ok(XS.logs(50).some(function (l) { return /page safety limit/.test(l.m); }),
   'log me saaf likha ki seema lagi');

sec('6. Handle ka apna window default se oopar jaata hai');
reset();
PAGES = [page([tw(1, 40), tw(2, 50)], 'C1'), page([tw(3, 900)], 'C2'), page([tw(4, 901)], 'C3')];
/* default 24 ghante hai, par handle ka apna 168 -> 40/50 ghante wale tweet andar aane chahiye */
m = mkDb([{ _id: 'testee', active: true, windowHours: 168 }],
         { _id: 'tracker', windowHours: 24, intervalMin: 30 });
r = await XS.runOnce(m.getDb);
ok(m.saved.indexOf('1') >= 0 && m.saved.indexOf('2') >= 0,
   '40-50 ghante purane tweet aaye (handle ka 168-ghante window chala)');
ok(m.saved.indexOf('3') < 0, '900 ghante purana tweet nahi aaya');

sec('7. Handle ka apna window default se neeche bhi jaata hai');
reset();
PAGES = [page([tw(1, 2), tw(2, 100)], 'C1'), page([tw(3, 200)], 'C2'), page([tw(4, 201)], null)];
m = mkDb([{ _id: 'testee', active: true, windowHours: 24 }],
         { _id: 'tracker', windowHours: 720, intervalMin: 30 });
r = await XS.runOnce(m.getDb);
ok(m.saved.indexOf('1') >= 0, '2 ghante purana tweet aaya');
ok(m.saved.indexOf('2') < 0, '100 ghante purana tweet NAHI aaya (handle ka 24-ghante window)');

sec('8. Purani stored maxPages ab koi asar nahi daalti');
reset();
PAGES = [];
for (var z = 0; z < 12; z++) PAGES.push(page([tw(3000 + z, 1)], 'D' + z));
PAGES.push(page([tw(8888, 99999)], null));
m = mkDb([{ _id: 'testee', active: true }],
         { _id: 'tracker', windowHours: 72, intervalMin: 30, maxPages: 2 });
r = await XS.runOnce(m.getDb);
ok(m.saved.length === 12, 'maxPages:2 database me pada hai par 12 page padhe (' + m.saved.length + ')');

sec('9. Ginti aur status theek hai');
ok(r.ok === true && r.handles === 1, 'ek handle poora hua');
ok(r.newCount + r.updatedCount === 12, 'naya+update = 12 (' + r.newCount + '+' + r.updatedCount + ')');
ok(typeof r.pages === 'number' && r.pages > 0, 'page ki ginti bhi report hoti hai: ' + r.pages);
ok(XS.status().running === false, 'run ke baad running=false');
ok(m.updates.some(function (u) { return u.id === 'testee' && u.u.$set && u.u.$set.status === 'Active'; }),
   'handle ka status Active likha gaya');
ok(m.updates.some(function (u) { return u.u.$inc && u.u.$inc.tweets === 12; }),
   'handle ki tweet ginti badhi');

sec('10. Do run ek saath nahi');
reset();
PAGES = [page([tw(1, 1)], null)];
m = mkDb([{ _id: 'testee', active: true }], { _id: 'tracker', windowHours: 24, intervalMin: 30 });
var both = await Promise.all([XS.runOnce(m.getDb), XS.runOnce(m.getDb)]);
var skipped = both.filter(function (x) { return x && x.skipped; });
ok(skipped.length === 1, 'doosra run saaf skip hua (' + skipped.length + ')');
ok(skipped[0].reason === 'already running', 'wajah bata di: ' + skipped[0].reason);

console.log('\n' + '='.repeat(56));
console.log('  PASS ' + P + '   FAIL ' + F);
if (F) { console.log('\n  FAIL hui:'); FAILS.forEach(function (f) { console.log('   - ' + f); }); }
console.log('='.repeat(56));
process.exit(F ? 1 : 0);
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
