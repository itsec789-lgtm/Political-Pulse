import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'DASHBOARD'))
from pymongo import MongoClient
from mongo_conf import MONGO_URL
d = MongoClient(MONGO_URL)['pulse_master']
for c in (sys.argv[1:] or ['daily_summary_test', 'daily_words_test']):
    s = d.command('collStats', c)
    print('%-20s docs=%8d  data=%7.1f MB  storage=%6.1f MB  indexes=%5.1f MB' % (c, s['count'], s['size']/1e6, s['storageSize']/1e6, s['totalIndexSize']/1e6))
