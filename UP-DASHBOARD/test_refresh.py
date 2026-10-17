# -*- coding: utf-8 -*-
"""
test_refresh.py  --  sirf DEKHNE ke liye.
Ye koi data nahi badalta, bas MongoDB me "last update" timestamp naya kar deta hai.
Isko chalao aur apna khula dashboard (http://localhost:3001) dekho --
~30 second me green toast aayega aur page khud reload ho jaayega.
(Asli me ye kaam auto_update har data-push ke baad khud karta hai.)
"""
import datetime
from pymongo import MongoClient

cli = MongoClient(__import__("mongo_conf").MONGO_URL)
now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
cli["up_pulse"]["meta"].update_one(
    {"key": "lastUpdate"},
    {"$set": {"key": "lastUpdate", "value": now}},
    upsert=True)
cli.close()
print("Version bump ho gaya:", now)
print("Ab apna dashboard dekho -> ~30 sec me khud reload hoga.")
