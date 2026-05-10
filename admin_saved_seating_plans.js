const EXAM_API = String(
  localStorage.getItem("examApiBaseUrl") || "https://exam-backend-117372286918.asia-south1.run.app"
).replace(/\/+$/, "");
const STUDENT_API = String(
  localStorage.getItem("studentApiBaseUrl") || "https://student-backend-117372286918.asia-south1.run.app"
).replace(/\/+$/, "");

const sessionSelect = document.getElementById("sessionSelect");
const planSelect = document.getElementById("planSelect");
const mappingBody = document.getElementById("mappingBody");
const roomMappingBody = document.getElementById("roomMappingBody");
const planHost = document.getElementById("planHost");
const planMeta = document.getElementById("planMeta");
const statusText = document.getElementById("statusText");
const remainingBody = document.getElementById("remainingBody");
const remainingStatus = document.getElementById("remainingStatus");

let SAVED_PLANS = [];
let CURRENT_PLAN = null;

function getStoredSession(){
  return String(localStorage.getItem("session") || "").trim();
}

function setStoredSession(session){
  localStorage.setItem("session", String(session || "").trim());
}

function setStatus(msg, bad){
  statusText.textContent = msg || "";
  statusText.style.color = bad ? "#b91c1c" : "#1f3b7a";
}

function setRemaining(leftMap){
  const entries = Object.keys(leftMap || {}).map(cls => ({
    className: cls,
    studentCount: Number(leftMap[cls] || 0)
  })).filter(item => item.studentCount > 0);
  if(!entries.length){
    remainingBody.innerHTML = '<tr><td colspan="2">No remaining students.</td></tr>';
    remainingStatus.textContent = "";
    return;
  }
  remainingBody.innerHTML = entries.map(item => `<tr><td>${esc(item.className)}</td><td>${esc(item.studentCount)}</td></tr>`).join("");
  const total = entries.reduce((sum, item) => sum + item.studentCount, 0);
  remainingStatus.textContent = `${total} students are still left without seats in this saved plan.`;
}

function getStudentDisplayRoll(student){
  return String(student && (student.exam_roll || student.roll) || "").trim();
}

function formatRollRange(students){
  const rolls = (students || []).map(getStudentDisplayRoll).filter(Boolean);
  if(!rolls.length) return "-";
  return rolls.length === 1 ? rolls[0] : `${rolls[0]}-${rolls[rolls.length - 1]}`;
}

function buildAssignmentSegments(assignmentRows, classStudentsMap){
  const remainingByClass = buildRemainingStudents(classStudentsMap);
  return (assignmentRows || []).map(row => {
    const cls = String(row.className || "");
    const count = Number(row.studentCount || 0);
    const source = remainingByClass[cls] || [];
    const students = source.splice(0, Math.max(0, count));
    remainingByClass[cls] = source;
    return {
      className: cls,
      subject: String(row.subject || ""),
      studentCount: students.length || count,
      roomNo: String(row.roomNo || ""),
      students,
      rollRange: formatRollRange(students)
    };
  });
}

function esc(v){
  return String(v || "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
}

async function fetchJson(url, opts){
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if(!res.ok || data.success === false){
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data;
}

function getRoomBenchRows(room){
  if(room && Array.isArray(room.bench_rows) && room.bench_rows.length){
    return room.bench_rows.map(v => Number(v || 0)).filter(v => v > 0);
  }
  const rowCount = Number((room && room.rows) || 0);
  const perRow = Number((room && room.benches_per_row) || 0);
  return Array.from({ length: rowCount }, () => perRow).filter(v => v > 0);
}

function capacity(room){
  const benchRows = getRoomBenchRows(room);
  return benchRows.reduce((sum, value) => sum + value, 0) * Number((room && room.seats_per_bench) || 0);
}

function benchLetter(idx){
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if(idx < letters.length) return letters[idx];
  return letters[idx % letters.length] + letters[Math.floor(idx / letters.length) - 1];
}

function computeExamRoll(className, roll){
  const clsText = String(className || "");
  const clsNumMatch = clsText.match(/\d+/);
  const clsNum = clsNumMatch ? parseInt(clsNumMatch[0], 10) : 0;
  const secMatch = clsText.match(/\b([A-Z])\b/i);
  const secLetter = secMatch ? secMatch[1].toUpperCase() : "A";
  const secNum = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(secLetter) + 1 || 1;
  const r = String(roll || "").replace(/\D/g, "");
  return `${clsNum}${secNum}${r.padStart(2, "0").slice(-2)}`;
}

function formatSeat(st){
  if(!st) return "-";
  const name = String(st.name || "").replace(/\s+/g, " ").trim().replace(/ (.+)/, "<br>$1");
  return `<div class="seat-box"><div class="seat-label">${esc(st.exam_roll || st.roll || "-")}</div><div style="text-align:center;font-weight:700;font-size:11px;">${name}</div><div style="text-align:center;color:#64748b;">${esc(st.class_name || "-")}</div></div>`;
}

function buildSeatMatrix(room, queues){
  const benchRows = getRoomBenchRows(room);
  const columns = benchRows.length;
  const rows = columns ? Math.max.apply(null, benchRows) : 0;
  const seats = Number((room && room.seats_per_bench) || 0);
  const grid = [];
  const used = [];

  for(let r = 0; r < rows; r++) grid.push([]);

  if(queues.length === 1){
    const singleQueue = queues[0];
    for(let c = 0; c < columns; c++){
      const benchesInColumn = Number(benchRows[c] || 0);
      for(let r = 0; r < benchesInColumn; r++){
        const bench = [];
        const student = singleQueue.list.length ? singleQueue.list.shift() : null;
        bench.push(student || null);
        for(let s = 1; s < seats; s++) bench.push(null);
        if(student){
          if(!student.exam_roll) student.exam_roll = computeExamRoll(student.class_name, student.roll);
          used.push(student);
        }
        grid[r][c] = bench;
      }
    }
    return { grid, used };
  }

  function nextClass(exclude){
    const q = queues.find(item => item.list.length && item.cls !== exclude);
    return q ? q.cls : "";
  }

  function getQueue(cls){
    return queues.find(item => item.cls === cls) || null;
  }

  let leftClass = (queues[0] && queues[0].cls) || "";
  let rightClass = nextClass(leftClass);

  for(let c = 0; c < columns; c++){
    const benchesInColumn = Number(benchRows[c] || 0);
    for(let r = 0; r < benchesInColumn; r++){
      const bench = [];
      let leftQueue = getQueue(leftClass);
      if(!leftQueue || !leftQueue.list.length){
        leftClass = nextClass(rightClass);
        leftQueue = getQueue(leftClass);
      }
      const left = leftQueue && leftQueue.list.length ? leftQueue.list.shift() : null;
      if(rightClass === leftClass) rightClass = nextClass(leftClass);
      let rightQueue = getQueue(rightClass);
      if(!rightQueue || !rightQueue.list.length){
        rightClass = nextClass(leftClass);
        rightQueue = getQueue(rightClass);
      }
      const right = (seats >= 2 && rightQueue && rightQueue.list.length) ? rightQueue.list.shift() : null;
      bench.push(left || null);
      if(seats >= 2) bench.push(right || null);
      for(let s = 2; s < seats; s++) bench.push(null);
      if(left){
        if(!left.exam_roll) left.exam_roll = computeExamRoll(left.class_name, left.roll);
        used.push(left);
      }
      if(right){
        if(!right.exam_roll) right.exam_roll = computeExamRoll(right.class_name, right.roll);
        used.push(right);
      }
      grid[r][c] = bench;
    }
  }
  return { grid, used };
}

function renderRoom(room, grid, used, summaryText){
  const host = document.createElement("div");
  host.className = "room-card";
  host.innerHTML = `<div class="room-title">Room ${esc(room.room_no || "-")} (capacity ${esc(capacity(room))})</div>`;
  if(summaryText){
    const sm = document.createElement("div");
    sm.className = "room-summary";
    sm.innerHTML = String(summaryText).split("\n").map(line => `<div>${esc(line)}</div>`).join("");
    host.appendChild(sm);
  }
  const wrap = document.createElement("div");
  wrap.className = "bench-grid";
  const table = document.createElement("table");
  table.className = "bench-table";
  const thead = document.createElement("thead");
  const headRow1 = document.createElement("tr");
  const headRow2 = document.createElement("tr");
  const benchRows = getRoomBenchRows(room);
  const columnCount = benchRows.length;
  const singleSeatLayout = grid.every(row => {
    for(let c = 0; c < columnCount; c++){
      const bench = row[c];
      if(bench && bench[1]) return false;
    }
    return true;
  });

  headRow1.innerHTML = singleSeatLayout ? "<th>Row</th>" : '<th rowspan="2">Row</th>';
  for(let c = 0; c < columnCount; c++){
    const th = document.createElement("th");
    th.colSpan = singleSeatLayout ? 1 : 2;
    th.textContent = benchLetter(c);
    headRow1.appendChild(th);
    if(!singleSeatLayout) headRow2.innerHTML += '<th>A</th><th class="bench-gap">B</th>';
  }
  thead.appendChild(headRow1);
  if(!singleSeatLayout) thead.appendChild(headRow2);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  grid.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><b>${rowIndex + 1}</b></td>`;
    for(let c = 0; c < columnCount; c++){
      const bench = row[c] || null;
      const left = bench && bench[0] ? bench[0] : null;
      const right = bench && bench[1] ? bench[1] : null;
      if(singleSeatLayout){
        tr.innerHTML += `<td class="seat-cell">${formatSeat(left)}</td>`;
      }else{
        tr.innerHTML += `<td class="seat-cell">${formatSeat(left)}</td><td class="seat-cell bench-gap">${formatSeat(right)}</td>`;
      }
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  host.appendChild(wrap);
  return host;
}

function buildRemainingStudents(classStudentsMap){
  const remainingByClass = {};
  Object.keys(classStudentsMap || {}).forEach(cls => {
    remainingByClass[cls] = (classStudentsMap[cls] || []).map(item => Object.assign({}, item));
  });
  return remainingByClass;
}

function getRoomQueuesByAssignments(roomNo, assignmentRows, remainingByClass){
  return (assignmentRows || []).filter(row => String(row.roomNo || "") === String(roomNo || "")).map(row => {
    const cls = String(row.className || "");
    const count = Number(row.studentCount || 0);
    const source = (remainingByClass && remainingByClass[cls]) || [];
    const list = source.splice(0, Math.max(0, count));
    if(remainingByClass) remainingByClass[cls] = source;
    return { cls, list };
  }).filter(item => item.cls && item.list.length);
}

async function loadSessions(){
  try{
    setStatus(`Loading sessions from ${EXAM_API}...`);
    const data = await fetchJson(`${EXAM_API}/session/list`);
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const storedSession = getStoredSession();
    sessionSelect.innerHTML = '<option value="">Select Session</option>' + sessions.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    if(sessions.length){
      const preferredSession = storedSession && sessions.includes(storedSession)
        ? storedSession
        : sessions[sessions.length - 1];
      sessionSelect.value = preferredSession;
      setStoredSession(preferredSession);
      await loadPlans();
    }else{
      setStatus("No sessions found.", true);
    }
  }catch(e){
    sessionSelect.innerHTML = '<option value="">Unable to load sessions</option>';
    planSelect.innerHTML = '<option value="">Select saved plan</option>';
    setStatus(`${e.message || "Unable to load sessions."} (${EXAM_API})`, true);
  }
}

async function loadPlans(){
  const session = sessionSelect.value;
  if(!session){
    planSelect.innerHTML = '<option value="">Select saved plan</option>';
    return;
  }
  try{
    setStatus("Loading saved plans...");
    const data = await fetchJson(`${EXAM_API}/seating-plan/list?session=${encodeURIComponent(session)}`);
    SAVED_PLANS = Array.isArray(data.plans) ? data.plans : [];
    planSelect.innerHTML = '<option value="">Select saved plan</option>' + SAVED_PLANS.map(plan => `<option value="${esc(plan.id)}">${esc(plan.exam_date || "-")} | ${esc(plan.exam_name || "-")} | ${esc(plan.saved_by_role || "-")} | ${esc(plan.saved_by_name || "Admin")}</option>`).join("");
    setStatus(SAVED_PLANS.length ? "Saved plans loaded." : "No saved plans found.", !SAVED_PLANS.length);
    await renderSelectedPlan("");
  }catch(e){
    planSelect.innerHTML = '<option value="">Unable to load plans</option>';
    setStatus(e.message || "Unable to load saved plans.", true);
  }
}

async function renderSelectedPlan(id){
  CURRENT_PLAN = SAVED_PLANS.find(plan => plan.id === id) || null;
  mappingBody.innerHTML = '<tr><td colspan="5">No saved plan selected.</td></tr>';
  roomMappingBody.innerHTML = '<tr><td colspan="5">No saved plan selected.</td></tr>';
  planHost.innerHTML = "";
  planMeta.textContent = "";
  setRemaining({});
  if(!CURRENT_PLAN) return;

  try{
    planMeta.textContent = `Exam: ${CURRENT_PLAN.exam_name || "-"} | Date: ${CURRENT_PLAN.exam_date || "-"} | Saved By: ${CURRENT_PLAN.saved_by_role || "-"} ${CURRENT_PLAN.saved_by_name || ""}`;
    const roomData = await fetchJson(`${EXAM_API}/rooms/list?session=${encodeURIComponent(CURRENT_PLAN.session || "")}`);
    const rooms = Array.isArray(roomData.rooms) ? roomData.rooms : [];
    const classStudentsMap = {};
    await Promise.all((CURRENT_PLAN.selected_classes || []).map(async cls => {
      const res = await fetch(`${STUDENT_API}/students?session=${encodeURIComponent(CURRENT_PLAN.session || "")}&class_name=${encodeURIComponent(cls)}`);
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data) ? data : (Array.isArray(data.students) ? data.students : []);
      classStudentsMap[cls] = rows.map(item => ({
        name: item.student_name || item.name || "",
        roll: String(item.rollno != null ? item.rollno : item.roll != null ? item.roll : "").trim(),
        class_name: cls,
        exam_roll: String(item.exam_rollno != null ? item.exam_rollno : item.exam_roll != null ? item.exam_roll : "").trim()
      })).filter(item => item.roll).sort((a, b) => (parseInt(a.roll, 10) || 0) - (parseInt(b.roll, 10) || 0));
    }));
    const segments = buildAssignmentSegments(CURRENT_PLAN.assignment_rows || [], classStudentsMap);
    mappingBody.innerHTML = segments.map(row => `<tr><td>${esc(row.className)}</td><td>${esc(row.subject || "-")}</td><td>${esc(row.studentCount || 0)}</td><td>${esc(row.rollRange || "-")}</td><td>${esc(row.roomNo || "-")}</td></tr>`).join("");
    roomMappingBody.innerHTML = segments.length ? segments.map(row => `<tr><td>${esc(row.roomNo || "-")}</td><td>${esc(row.className)}</td><td>${esc(row.subject || "-")}</td><td>${esc(row.studentCount || 0)}</td><td>${esc(row.rollRange || "-")}</td></tr>`).join("") : '<tr><td colspan="5">No room mapping found.</td></tr>';

    const roomNames = Array.from(new Set((CURRENT_PLAN.assignment_rows || []).map(row => String(row.roomNo || "")).filter(Boolean)));
    const remainingByClass = buildRemainingStudents(classStudentsMap);
    roomNames.forEach(roomNo => {
      const room = rooms.find(item => item.room_no === roomNo);
      if(!room) return;
      const roomQueues = getRoomQueuesByAssignments(roomNo, CURRENT_PLAN.assignment_rows || [], remainingByClass);
      if(!roomQueues.length) return;

      const result = buildSeatMatrix(room, roomQueues);
      roomQueues.forEach(item => {
        if(item.list && item.list.length){
          remainingByClass[item.cls] = (remainingByClass[item.cls] || []).concat(item.list);
        }
      });
      const classCounts = result.used.reduce((acc, student) => {
        acc[student.class_name] = (acc[student.class_name] || 0) + 1;
        return acc;
      }, {});
      const summary = `Room: ${roomNo} | Total: ${result.used.length} | Date: ${CURRENT_PLAN.exam_date || "-"}` + "\n" + Object.keys(classCounts).map(cls => {
        const match = (CURRENT_PLAN.assignment_rows || []).find(item => item.className === cls && item.roomNo === roomNo);
        return `Class: ${cls} | Students: ${classCounts[cls]} | Subject: ${match ? match.subject : "-"}`;
      }).join("\n");
      planHost.appendChild(renderRoom(room, result.grid, result.used, summary));
    });
    const leftMap = {};
    Object.keys(remainingByClass).forEach(cls => {
      const count = Array.isArray(remainingByClass[cls]) ? remainingByClass[cls].length : 0;
      if(count) leftMap[cls] = count;
    });
    setRemaining(leftMap);
  }catch(e){
    planHost.innerHTML = '<div class="helper">Unable to load seating preview.</div>';
    setStatus(e.message || "Unable to load saved plan preview.", true);
  }
}

function buildPrintHeader(title){
  const examName = esc(CURRENT_PLAN && CURRENT_PLAN.exam_name || "-");
  const examDate = esc(CURRENT_PLAN && CURRENT_PLAN.exam_date || "-");
  const teacherName = esc(CURRENT_PLAN && CURRENT_PLAN.saved_by_name || (CURRENT_PLAN && CURRENT_PLAN.saved_by_role) || "-");
  return `<div style="text-align:center;margin-bottom:14px;">
    <div style="font-weight:700;font-size:22px;">P. S. PUBLIC SCHOOL</div>
    <div style="font-weight:700;font-size:18px;margin-top:4px;">${esc(title)}</div>
    <div style="font-size:13px;margin-top:6px;">Exam: ${examName} | Date: ${examDate} | Teacher: ${teacherName}</div>
  </div>`;
}

function openPrintWindow(title, bodyHtml, extraCss){
  const style = document.querySelector("style").textContent;
  const win = window.open("", "_blank", "width=1100,height=900");
  if(!win) return;
  win.document.write(`<html><head><title>${title}</title><style>${style}${extraCss || ""}</style></head><body><main style="max-width:none;margin:0;padding:0;border:none;box-shadow:none;">${buildPrintHeader(title)}${bodyHtml}</main></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function printMapping(){
  const meta = `<div style="margin-bottom:10px;font-size:13px;">${esc(planMeta.textContent || "")}</div>`;
  const mappingTable = document.querySelector("#mappingBody").closest(".table-wrap").outerHTML;
  const roomTable = document.querySelector("#roomMappingBody").closest(".table-wrap").outerHTML;
  openPrintWindow("Class To Room Mapping", meta + mappingTable + `<div style="height:16px;"></div><h3 style="margin:0 0 10px 0;">Room To Class Mapping</h3>` + roomTable);
}

function printPreview(){
  const rooms = Array.from(planHost.querySelectorAll(".room-card"));
  const bodyHtml = rooms.map(card => `<div class="print-room-page">${card.outerHTML}</div>`).join("");
  const extraCss = `
  .screen-only{display:none !important;}
  .print-room-page{page-break-after:always;}
  .print-room-page:last-child{page-break-after:auto;}
  .print-room-page .room-card{margin-top:0;border:1px solid #cbd5e1;box-shadow:none;}
  @page { size: A4 landscape; margin: 8mm; }`;
  openPrintWindow("Seating Plan Preview", bodyHtml || '<div>No seating preview available.</div>', extraCss);
}

document.getElementById("reloadBtn").onclick = loadPlans;
document.getElementById("printMappingBtn").onclick = printMapping;
document.getElementById("printPreviewBtn").onclick = printPreview;
sessionSelect.addEventListener("change", async () => {
  setStoredSession(sessionSelect.value);
  await loadPlans();
});
planSelect.addEventListener("change", e => renderSelectedPlan(e.target.value));

loadSessions();
