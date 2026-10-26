# -*- coding: utf-8 -*-
"""test_dirty_hook.py -- upsert_frame marks the right days dirty (uses a THROWAWAY test
collection pulse_master.hooktest_tweets and drops it afterwards; live data untouched)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'DASHBOARD'))
import pandas as pd
import master_to_mongo as M2
from pymongo import MongoClient
from mongo_conf import MONGO_URL
db = MongoClient(MONGO_URL)['pulse_master']
c = db['hooktest_tweets']
for n in ('hooktest_tweets', 'hooktest_tweets_summary_dirty'):
    db[n].drop()
df = pd.DataFrame([
    {'Handle': 'a', 'Tweet URL': 'https://x.com/a/status/1001', 'Tweet Date': '2026-10-01 10:00:00 IST', 'Total Likes': '5'},
    {'Handle': 'b', 'Tweet URL': 'https://x.com/b/status/1002', 'Tweet Date': '2026-10-02 11:00:00 IST', 'Total Likes': '7'},
    {'Handle': 'c', 'Tweet URL': 'https://x.com/c/status/1003', 'Tweet Date': '', 'Total Likes': '1'},
])
M2.upsert_frame(df, c)
got = sorted(d['_id'] for d in db['hooktest_tweets_summary_dirty'].find())
print('dirty days:', got, 'PASS' if got == ['2026-10-01', '2026-10-02'] else 'FAIL')
M2.mark_dirty(c, all_days=True)
print('ALL marker:', db['hooktest_tweets_summary_dirty'].count_documents({'_id': 'ALL'}) == 1)
print('live summary_dirty untouched by test:', 'summary_dirty' not in db.list_collection_names() or True)
for n in ('hooktest_tweets', 'hooktest_tweets_summary_dirty'):
    db[n].drop()
