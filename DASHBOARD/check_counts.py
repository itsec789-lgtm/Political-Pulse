# -*- coding: utf-8 -*-
"""check_counts.py -- Mongo master ka month-wise + category-wise breakdown."""
from pymongo import MongoClient
c = MongoClient(__import__("mongo_conf").MONGO_URL)["pulse_master"]["master_tweets"]

print("Total tweets:", format(c.estimated_document_count(), ","))

print("\nMonth-wise:")
for r in c.aggregate([{"$group": {"_id": {"$substr": ["$Tweet Date", 0, 7]}, "n": {"$sum": 1}}},
                      {"$sort": {"_id": 1}}]):
    print("  %-10s %s" % (r["_id"], format(r["n"], ",")))

print("\nCategory-wise (top 10):")
for r in c.aggregate([{"$group": {"_id": "$Category", "n": {"$sum": 1}}},
                      {"$sort": {"n": -1}}, {"$limit": 10}]):
    print("  %-16s %s" % (r["_id"] or "(blank)", format(r["n"], ",")))

print("\nState-wise (top 8):")
for r in c.aggregate([{"$group": {"_id": "$State", "n": {"$sum": 1}}},
                      {"$sort": {"n": -1}}, {"$limit": 8}]):
    print("  %-18s %s" % (r["_id"] or "(blank = media/journalist)", format(r["n"], ",")))
