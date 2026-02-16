(function(window){
  function normalizedId(raw){
    if(raw == null) return "";
    if(typeof raw === "string") return raw.trim();
    if(typeof raw === "object"){
      if(typeof raw.$oid === "string") return raw.$oid.trim();
      if(typeof raw.oid === "string") return raw.oid.trim();
      if(typeof raw.id === "string") return raw.id.trim();
    }
    return String(raw).trim();
  }

  function getSessionCandidates(s){
    return Array.from(new Set([
      s,
      String(s || "").replace(/_/g, "-"),
      String(s || "").replace(/-/g, "_")
    ].filter(Boolean)));
  }

  function monthsFromSession(session){
    const raw = String(session || "").trim();
    const m = raw.match(/^(\d{4})[_-]?(\d{2,4})$/);
    if(!m){
      const now = new Date();
      const out = [];
      for(let i=0;i<12;i++){
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
        out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
      }
      return out.reverse();
    }
    const y1 = parseInt(m[1],10);
    let y2 = parseInt(m[2],10);
    if(m[2].length===2) y2 = Math.floor(y1/100)*100 + y2;
    const out = [];
    for(let mm=4; mm<=12; mm++) out.push(`${y1}-${String(mm).padStart(2,"0")}`);
    for(let mm=1; mm<=3; mm++) out.push(`${y2}-${String(mm).padStart(2,"0")}`);
    return out;
  }

  function cacheKey(studentId, session, className){
    return `attendance_cache_v2:${studentId}:${session}:${className}`;
  }

  function readCache(studentId, session, className, maxAgeMs){
    try{
      const raw = localStorage.getItem(cacheKey(studentId, session, className));
      if(!raw) return null;
      const payload = JSON.parse(raw);
      if(!payload || !Array.isArray(payload.records) || !payload.saved_at) return null;
      if(Date.now() - payload.saved_at > maxAgeMs) return null;
      return payload.records;
    }catch(e){ return null; }
  }

  function readAnyCache(studentId, session, className){
    try{
      const raw = localStorage.getItem(cacheKey(studentId, session, className));
      if(!raw) return null;
      const payload = JSON.parse(raw);
      if(!payload || !Array.isArray(payload.records)) return null;
      return payload.records;
    }catch(e){ return null; }
  }

  function writeCache(studentId, session, className, records){
    try{
      localStorage.setItem(cacheKey(studentId, session, className), JSON.stringify({
        saved_at: Date.now(),
        records: records || []
      }));
    }catch(e){}
  }

  function aggregateByDate(records){
    const byDate = {};
    (records || []).forEach(r=>{
      if(r && r.date && !byDate[r.date]) byDate[r.date] = (r.status || "-");
    });
    return byDate;
  }

  async function fetchMonthlyAll(api, session, className, matchFn){
    const sessions = getSessionCandidates(session);
    const months = monthsFromSession(session);
    const requests = [];
    for(const sess of sessions){
      for(const month of months){
        const url = `${api}/attendance/list-monthly?session=${encodeURIComponent(sess)}&class_name=${encodeURIComponent(className)}&month=${encodeURIComponent(month)}`;
        requests.push(
          fetch(url)
            .then(r=>r.json().catch(()=>({success:false,attendance:[]})))
            .then(j=>(j.success && Array.isArray(j.attendance)) ? j.attendance : [])
            .catch(()=>[])
        );
      }
    }
    const rows = (await Promise.all(requests)).flat();
    return rows.filter(matchFn).map(x=>({date:x.date, status:x.status || "-"}));
  }

  async function fetchDailyFallback(api, session, className, matchFn, concurrency){
    const sessions = getSessionCandidates(session);
    const months = monthsFromSession(session).slice(-4);
    const dates = [];
    months.forEach(m=>{
      const [y,mm] = m.split("-");
      const days = new Date(Number(y), Number(mm), 0).getDate();
      for(let d=1; d<=days; d++){
        const date = `${y}-${mm}-${String(d).padStart(2,"0")}`;
        const day = new Date(`${date}T00:00:00`).getDay();
        if(day !== 0) dates.push(date); // skip Sunday for speed
      }
    });

    const results = [];
    let idx = 0;

    async function worker(){
      while(idx < dates.length){
        const my = idx++;
        const date = dates[my];
        for(const sess of sessions){
          try{
            const url = `${api}/attendance/list?session=${encodeURIComponent(sess)}&class_name=${encodeURIComponent(className)}&date=${encodeURIComponent(date)}`;
            const r = await fetch(url);
            const j = await r.json().catch(()=>({success:false,attendance:[]}));
            if(!j.success || !Array.isArray(j.attendance) || !j.attendance.length) continue;
            const rec = j.attendance.find(matchFn);
            if(rec){
              results.push({date, status: rec.status || "-"});
              break;
            }
          }catch(e){}
        }
      }
    }

    const pool = [];
    const size = Math.max(8, Math.min(40, Number(concurrency) || 24));
    for(let i=0;i<size;i++) pool.push(worker());
    await Promise.all(pool);
    return results;
  }

  async function getQuickAttendanceData(opts){
    const {
      api, resolvedSession, resolvedClass, studentIdKeys, studentRollKeys
    } = opts;

    const matchFn = (x)=>{
      const sid = normalizedId(x.student_id);
      const sroll = String(x.student_roll || "").trim();
      return studentIdKeys.includes(sid) || studentRollKeys.includes(sid) || (sroll && studentRollKeys.includes(sroll));
    };

    const months = monthsFromSession(resolvedSession);
    const recent = months.slice(-2);
    const sessions = getSessionCandidates(resolvedSession);
    const requests = [];
    for(const sess of sessions){
      for(const month of recent){
        const url = `${api}/attendance/list-monthly?session=${encodeURIComponent(sess)}&class_name=${encodeURIComponent(resolvedClass)}&month=${encodeURIComponent(month)}`;
        requests.push(
          fetch(url)
            .then(r=>r.json().catch(()=>({success:false,attendance:[]})))
            .then(j=>(j.success && Array.isArray(j.attendance)) ? j.attendance : [])
            .catch(()=>[])
        );
      }
    }
    const rows = (await Promise.all(requests)).flat();
    return rows.filter(matchFn).map(x=>({date:x.date, status:x.status || "-"}));
  }

  function getCachedAttendanceData(opts){
    const {studentId, resolvedSession, resolvedClass, maxCacheMs = 10*60*1000} = opts;
    const fresh = readCache(studentId, resolvedSession, resolvedClass, maxCacheMs);
    if(fresh) return {records:fresh, source:'cache'};
    const stale = readAnyCache(studentId, resolvedSession, resolvedClass);
    if(stale) return {records:stale, source:'cache_stale'};
    return {records:[], source:'none'};
  }

  async function getAttendanceData(opts){
    const {
      api, studentId, resolvedSession, resolvedClass, studentIdKeys, studentRollKeys,
      maxCacheMs = 10*60*1000
    } = opts;

    const matchFn = (x)=>{
      const sid = normalizedId(x.student_id);
      const sroll = String(x.student_roll || "").trim();
      return studentIdKeys.includes(sid) || studentRollKeys.includes(sid) || (sroll && studentRollKeys.includes(sroll));
    };

    const cached = readCache(studentId, resolvedSession, resolvedClass, maxCacheMs);
    if(cached) return {records: cached, source: "cache"};

    let records = await fetchMonthlyAll(api, resolvedSession, resolvedClass, matchFn);
    if(records.length){
      writeCache(studentId, resolvedSession, resolvedClass, records);
      return {records, source: "monthly"};
    }

    records = await fetchDailyFallback(api, resolvedSession, resolvedClass, matchFn, 28);
    writeCache(studentId, resolvedSession, resolvedClass, records);
    return {records, source: "daily_fallback"};
  }

  window.StudentAttendanceData = {
    normalizedId,
    getAttendanceData,
    getQuickAttendanceData,
    getCachedAttendanceData,
    aggregateByDate
  };
})(window);
