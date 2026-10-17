@echo off
title Media House / Journalist -- Mongo me inke tweets hain ya nahi
setlocal
cd /d "%~dp0"

echo.
echo   ================================================================
echo    MEDIA HOUSE / JOURNALIST CHECK   --  sirf PADHTA hai
echo   ================================================================
echo.
echo   Card par 0 kyon tha, iski wajah pipeline me likhi hui hai:
echo      update_dashboard.py  ->  EXCLUDE_CAT = {'media house','journalist'}
echo      "SIRF media house / journalist bahar (reports me rahenge)"
echo   Yaani Mongo me unke tweet HAIN, par roster me nahi aate the.
echo   Ab server inka jod seedha Mongo se leta hai -- sirf card ke liye.
echo.
echo   Ye script wahi jod dikha deti hai, taaki aap mila sakein.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   !! Node.js nahi mila.
  pause & exit /b 1
)

node -e "const u=require('./mongo_conf.js');const {MongoClient}=require('mongodb');(async()=>{const c=new MongoClient(String(u),{serverSelectionTimeoutMS:8000});try{await c.connect();}catch(e){console.log('   ** Mongo se jud nahi paaye: '+String(e.message).split('\n')[0]);console.log('      (Mongo chalu hai? START_LIVE wali window dekhiye.)');process.exit(1);}const col=c.db('pulse_master').collection('master_tweets');const n=await col.countDocuments({Category:{$in:['Media House','Journalist']}});console.log('   kul tweet (Media House + Journalist): '+n.toLocaleString('en-IN'));const rows=await col.aggregate([{$match:{Category:{$in:['Media House','Journalist']}}},{$group:{_id:{h:'$Handle',c:'$Category'},tw:{$sum:1},vw:{$sum:{$convert:{input:'$Total Views',to:'long',onError:0,onNull:0}}}}},{$sort:{tw:-1}}],{allowDiskUse:true}).toArray();const by={};rows.forEach(r=>{const k=r._id.c||'?';(by[k]=by[k]||{h:0,tw:0,vw:0});by[k].h++;by[k].tw+=r.tw;by[k].vw+=r.vw;});console.log('');Object.keys(by).forEach(k=>{const o=by[k];console.log('   '+k.padEnd(14)+o.h+' handle   '+o.tw.toLocaleString('en-IN')+' tweets   '+o.vw.toLocaleString('en-IN')+' views');});console.log('');console.log('   Sabse upar ke 12 handle:');rows.slice(0,12).forEach(r=>{console.log('      @'+String(r._id.h).padEnd(20)+String(r._id.c).padEnd(14)+String(r.tw).padStart(7)+' tweets');});console.log('');console.log('   Dashboard ke card par yahi ginti aani chahiye.');console.log('   (START_LIVE ki window me bhi ek line aati hai: \"mj-agg: N media/journalist handle ka jod aaya\")');await c.close();})();"

echo.
echo   ================================================================
echo   Output copy karke bhej dijiye.
echo   ================================================================
echo.
pause
