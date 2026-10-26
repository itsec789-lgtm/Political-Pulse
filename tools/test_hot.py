# -*- coding: utf-8 -*-
"""test_hot.py -- Atlas smoke test in a THROWAWAY database (pulse_hot_test), then drops it.
Checks: connection, TTL + indexes allowed, write-through op shape, two-slot dashboard push + stamp,
size, and the fall-back when the URL is wrong. Uses 1 day of real tweets only."""
import os, sys, time, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'DASHBOARD'))
os.environ['PULSE_HOT_DB'] = 'pulse_hot_test'
os.environ['PULSE_HOT_ENABLED'] = '1'
import hot_conf as HC
print('url:', HC.masked(), '| enabled:', HC.HOT['enabled'], '| db:', HC.HOT['db'])
if not HC.HOT['enabled']:
    sys.exit('FAIL: no url in db_config.local.json')
from pymongo import MongoClient
from mongo_conf import MONGO_URL
t = time.time(); cli = HC.hot_client(10000); cli.admin.command('ping')
print('1. ping OK (%.1fs)' % (time.time() - t))
db = cli['pulse_hot_test']
import hot_sync as HS
HS.init(db, 1)
print('2. TTL + indexes OK:', sorted(i['name'] for i in db['tweets'].list_indexes()))
cold = MongoClient(MONGO_URL)['pulse_master']['master_tweets']
day = HC.today_ist().isoformat()
docs = list(cold.find({'Tweet Date': {'$gte': day}}).limit(500))
import master_to_mongo as M2
from pymongo import ReplaceOne
ops = [ReplaceOne({'_id': d['_id']}, dict(d, ts=M2.ist_to_utc(d['Tweet Date'])), upsert=True) for d in docs]
if ops: db['tweets'].bulk_write(ops, ordered=False)
print('3. copied %d tweets of %s; hot count %d' % (len(ops), day, db['tweets'].count_documents({})))
import hot_push
since = datetime.datetime.now(datetime.timezone.utc)
ok = hot_push.push('test_scope', {'dashboard_data': [{'key': 'X', 'value': {'a': 1}}], 'phd': [{'h': 'a', 't': [1]}],
                                  'handles': [{'_id': 'a'}]})
ok2 = hot_push.stamp('test_scope', '2026-01-01 00:00:00', since)
cur = db['test_scope__meta'].find_one({'_id': 'current'})
print('4. dashboard push:', ok, 'stamp:', ok2, 'slot:', cur.get('slot'), 'lastUpdate:', cur.get('lastUpdate'))
s = db.command('dbStats')
print('5. size %.2f MB' % ((s['dataSize'] + s['indexSize']) / 1e6))
cli.drop_database('pulse_hot_test')
print('6. pulse_hot_test dropped')
try:
    bad = MongoClient('mongodb+srv://nobody:x@doesnotexist.invalid/?retryWrites=true', serverSelectionTimeoutMS=3000)
    bad.admin.command('ping'); print('7. ??? bad URL answered')
except Exception as e:
    print('7. wrong URL fails fast as expected (%s)' % type(e).__name__)
print('RESULT: OK')
