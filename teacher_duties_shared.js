(function(){
  var EXAM_API = String(
    localStorage.getItem("examApiBaseUrl") || "https://exam-backend-117372286918.asia-south1.run.app"
  ).replace(/\/+$/, "");
  var STUDENT_API = String(
    localStorage.getItem("studentApiBaseUrl") || "https://student-backend-117372286918.asia-south1.run.app"
  ).replace(/\/+$/, "");

  var FALLBACK_ACTIVITIES = [
    { key: "exam_seating_plan", title: "Exam Seating Plan Making", page: "admin_duty_exam_seating.html", teacherPage: "teacher_duty_exam_seating.html", description: "Prepare room-wise and class-wise seating arrangements before exams." },
    { key: "room_details", title: "Room Details Fill", page: "admin_duty_room_details.html", teacherPage: "teacher_duty_room_details.html", description: "Assign teachers to verify room numbers, capacity and readiness details." },
    { key: "exam_paper_allotment", title: "Exam Paper Allotment", page: "admin_duty_paper_allotment.html", teacherPage: "teacher_duty_paper_allotment.html", description: "Allocate question paper handling, packing and distribution responsibilities." },
    { key: "invigilation_duties", title: "Teachers Duties in Seating Plan", page: "admin_duty_invigilation.html", teacherPage: "teacher_duty_invigilation.html", description: "Assign invigilation and room supervision duties for the seating plan." },
    { key: "attendance_compilation", title: "Attendance and Absentee Compilation", page: "admin_duty_attendance_compilation.html", teacherPage: "teacher_duty_attendance_compilation.html", description: "Track present and absent students and compile daily attendance sheets." },
    { key: "result_file_checking", title: "Result File Checking", page: "admin_duty_result_checking.html", teacherPage: "teacher_duty_result_checking.html", description: "Review marks files, result bundles and final tabulation records." }
  ];

  var dutyState = {
    records: [],
    activities: FALLBACK_ACTIVITIES.slice(),
    invigilation: {
      teacherOptions: [],
      currentPlan: null,
      savedPlans: [],
      dutyRow: null,
      autoSaveTimer: null,
      isAutoSaving: false
    },
    attendance: {
      savedPlans: [],
      currentPlan: null,
      dutyRow: null
    },
    resultChecking: {
      classOptions: [],
      examRows: []
    },
    paperAllotment: {
      savedPlans: []
    },
    teacherSeating: {
      rooms: [],
      assignmentRows: [],
      classStudentsMap: {},
      dateClassSubjectMap: new Map(),
      savedPlans: [],
      currentPlanId: "",
      leftStudents: [],
      isSaving: false
    }
  };

  function parseDutyOptions(){
    var raw = document.body.dataset.dutyOptions || "";
    return raw.split("||").map(function(item){ return normalize(item); }).filter(Boolean);
  }

  function getSelectedDutyTypes(){
    var host = document.getElementById("dutyTypeSelect");
    if(!host) return [];
    if(host.tagName === "SELECT"){
      return Array.from(host.selectedOptions || []).map(function(opt){
        return normalize(opt.value);
      }).filter(Boolean);
    }
    return Array.from(host.querySelectorAll('input[type="checkbox"]:checked')).map(function(input){
      return normalize(input.value);
    }).filter(Boolean);
  }

  function setSelectedDutyTypes(values){
    var list = Array.isArray(values) ? values.map(normalize).filter(Boolean) : [];
    var host = document.getElementById("dutyTypeSelect");
    if(!host) return;
    if(host.tagName === "SELECT"){
      Array.from(host.options || []).forEach(function(opt){
        opt.selected = list.indexOf(normalize(opt.value)) !== -1;
      });
      return;
    }
    Array.from(host.querySelectorAll('input[type="checkbox"]')).forEach(function(input){
      input.checked = list.indexOf(normalize(input.value)) !== -1;
    });
  }

  function esc(v){
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalize(v){
    return String(v || "").trim();
  }

  function getTeacherStudentId(student){
    if(!student) return "";
    var raw = student._id != null ? student._id : (student.id != null ? student.id : student.student_id);
    if(typeof raw === "string") return raw;
    if(raw && typeof raw === "object"){
      if(typeof raw.$oid === "string") return raw.$oid;
      if(typeof raw.id === "string") return raw.id;
    }
    return String(raw || "");
  }

  function getSession(){
    return normalize(localStorage.getItem("session"));
  }

  async function resolveLatestSession(){
    var latestSession = getSession();
    try{
      var data = await fetchJson(EXAM_API + "/session/list");
      var sessions = data && Array.isArray(data.sessions) ? data.sessions : [];
      if(sessions.length){
        latestSession = normalize(sessions[sessions.length - 1]) || latestSession;
      }
    }catch(_e){}
    if(latestSession){
      try{ localStorage.setItem("session", latestSession); }catch(_e){}
    }
    return latestSession;
  }

  function getTeacherId(){
    return normalize(localStorage.getItem("teacher_id_latest")) || normalize(localStorage.getItem("teacher_id"));
  }

  function getTeacherCode(){
    return normalize(localStorage.getItem("teacher_id"));
  }

  function getTeacherName(){
    return normalize(localStorage.getItem("teacher_name")) || "Teacher";
  }

  async function fetchJson(url, opts){
    var res = await fetch(url, opts);
    var data = {};
    try{ data = await res.json(); }catch(_e){}
    if(!res.ok || data.success === false){
      throw new Error(data.message || ("Request failed: " + res.status));
    }
    return data;
  }

  async function resolveTeacherAliases(){
    var rawTeacherId = normalize(localStorage.getItem("teacher_id"));
    var latestTeacherId = normalize(localStorage.getItem("teacher_id_latest"));
    var teacherName = getTeacherName();
    var session = await resolveLatestSession();
    var ids = [latestTeacherId, rawTeacherId].filter(Boolean);
    var aliases = [];

    ids.forEach(function(id){
      if(aliases.indexOf(id) === -1) aliases.push(id);
    });

    for(var i = 0; i < ids.length; i++){
      try{
        var data = await fetchJson(EXAM_API + "/teacher/" + encodeURIComponent(ids[i]));
        var teacher = data && !data.error ? data : null;
        if(teacher){
          if(teacher.teacher_id && aliases.indexOf(normalize(teacher.teacher_id)) === -1){
            aliases.push(normalize(teacher.teacher_id));
          }
          if(teacher.id && aliases.indexOf(normalize(teacher.id)) === -1){
            aliases.push(normalize(teacher.id));
          }
          if(teacher.name) teacherName = normalize(teacher.name) || teacherName;
        }
      }catch(_e){}
    }

    return {
      ids: aliases.filter(Boolean),
      teacherName: teacherName,
      session: session
    };
  }

  async function loadActivities(){
    try{
      var data = await fetchJson(EXAM_API + "/teacher-duty/activities");
      var rows = Array.isArray(data.activities) ? data.activities : [];
      if(rows.length){
        dutyState.activities = FALLBACK_ACTIVITIES.map(function(item){
          var match = rows.find(function(r){ return r.key === item.key; });
          return match ? Object.assign({}, item, { title: match.title || item.title }) : item;
        });
      }
    }catch(_e){}
    return dutyState.activities;
  }

  function activityMeta(key){
    return dutyState.activities.find(function(item){ return item.key === key; }) || null;
  }

  function activityTeacherPage(key){
    var meta = activityMeta(key);
    return meta && meta.teacherPage ? meta.teacherPage : "teacher_duties.html";
  }

  function setText(id, value){
    var el = document.getElementById(id);
    if(el) el.textContent = value;
  }

  function setStatus(id, value, bad){
    var el = document.getElementById(id);
    if(!el) return;
    el.textContent = value || "";
    el.style.color = bad ? "#b91c1c" : "#1d4ed8";
  }

  function setHtml(id, value){
    var el = document.getElementById(id);
    if(el) el.innerHTML = value || "";
  }

  function populateActivityNav(selectId){
    var select = document.getElementById(selectId);
    if(!select) return;
    select.innerHTML = '<option value="">Select Activity Page</option>' + dutyState.activities.map(function(item){
      return '<option value="' + esc(item.page) + '">' + esc(item.title) + '</option>';
    }).join("");
    select.onchange = function(){
      if(this.value) location.href = this.value;
    };
  }

  async function initAdminHub(){
    await loadActivities();
    populateActivityNav("activityPageSelect");
    setText("currentSessionLabel", await resolveLatestSession() || "Session not selected");
    var wrap = document.getElementById("activityCards");
    if(!wrap) return;
    wrap.innerHTML = dutyState.activities.map(function(item){
      return (
        '<article class="duty-card">' +
          '<div class="duty-card-tag">Admin Activity</div>' +
          '<h3>' + esc(item.title) + '</h3>' +
          '<p>' + esc(item.description || "") + '</p>' +
          '<button type="button" onclick="location.href=\'' + esc(item.page) + '\'">Open Page</button>' +
        '</article>'
      );
    }).join("");
  }

  async function loadTeacherOptions(session){
    var select = document.getElementById("teacherSelect");
    if(!select) return [];
    select.innerHTML = '<option value="">Loading teachers...</option>';
    try{
      var data = await fetchJson(EXAM_API + "/teacher/list?session=" + encodeURIComponent(session));
      var rows = Array.isArray(data.teachers) ? data.teachers : [];
      rows.sort(function(a, b){
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      select.innerHTML = '<option value="">Select Teacher</option>' + rows.map(function(row){
        return '<option value="' + esc(row.teacher_id || "") + '" data-name="' + esc(row.name || "") + '">' +
          esc((row.name || "Teacher") + " (" + (row.teacher_id || "-") + ")") +
        '</option>';
      }).join("");
      return rows;
    }catch(e){
      select.innerHTML = '<option value="">No teachers found</option>';
      setStatus("formStatus", e.message || "Unable to load teachers", true);
      return [];
    }
  }

  async function loadExamOptions(session){
    var select = document.getElementById("examSelect");
    if(!select) return [];
    select.innerHTML = '<option value="">Loading exams...</option>';
    try{
      var data = await fetchJson(EXAM_API + "/exam/list-all");
      var rows = (Array.isArray(data.exams) ? data.exams : []).filter(function(row){
        return normalize(row.session) === normalize(session);
      });
      rows.sort(function(a, b){
        return String(a.exam_name || "").localeCompare(String(b.exam_name || ""));
      });
      select.innerHTML = '<option value="">Select Exam</option>' + rows.map(function(row){
        return '<option value="' + esc(row.exam_name || "") + '">' + esc(row.exam_name || "") + '</option>';
      }).join("");
      return rows;
    }catch(e){
      select.innerHTML = '<option value="">No exams found</option>';
      setStatus("formStatus", e.message || "Unable to load exams", true);
      return [];
    }
  }

  async function loadResultClassOptions(session){
    var select = document.getElementById("resultClassSelect");
    if(!select) return [];
    select.innerHTML = '<option value="">Loading classes...</option>';
    try{
      var res = await fetch(STUDENT_API + "/students?session=" + encodeURIComponent(session || ""));
      var data = await res.json().catch(function(){ return []; });
      var rows = Array.isArray(data) ? data : (Array.isArray(data.students) ? data.students : []);
      var classes = Array.from(new Set(rows.map(function(item){
        return normalize(item.class_name || item.class);
      }).filter(Boolean))).sort(classSort);
      dutyState.resultChecking.classOptions = classes.slice();
      select.innerHTML = '<option value="">Select Class</option>' + classes.map(function(cls){
        return '<option value="' + esc(cls) + '">' + esc(cls) + '</option>';
      }).join("");
      return classes;
    }catch(e){
      select.innerHTML = '<option value="">No classes found</option>';
      setStatus("formStatus", e.message || "Unable to load classes", true);
      return [];
    }
  }

  function loadDutyTypeOptions(){
    var select = document.getElementById("dutyTypeSelect");
    if(!select) return;
    var options = parseDutyOptions();
    if(select.tagName === "SELECT"){
      select.multiple = true;
      select.size = Math.min(Math.max(options.length, 3), 6);
      select.innerHTML = options.map(function(item){
        return '<option value="' + esc(item) + '">' + esc(item) + '</option>';
      }).join("");
      return;
    }
    select.innerHTML = options.map(function(item, idx){
      var id = "duty_option_" + idx;
      return (
        '<label class="duty-check-item" for="' + id + '">' +
          '<input type="checkbox" id="' + id + '" value="' + esc(item) + '">' +
          '<span>' + esc(item) + '</span>' +
        '</label>'
      );
    }).join("");
  }

  async function loadAdminDutyList(session, activityKey){
    var table = document.getElementById("dutyTableBody");
    if(!table) return;
    table.innerHTML = '<tr><td colspan="8">Loading duties...</td></tr>';
    try{
      var data = await fetchJson(
        EXAM_API + "/teacher-duty/list?session=" + encodeURIComponent(session) + "&activity_key=" + encodeURIComponent(activityKey)
      );
      dutyState.records = Array.isArray(data.duties) ? data.duties : [];
      if(!dutyState.records.length){
        table.innerHTML = '<tr><td colspan="8">No duties assigned yet.</td></tr>';
        return;
      }
      table.innerHTML = dutyState.records.map(function(row){
        var statusLabel = normalize(row.status) || "assigned";
        var description = normalize(getTeacherDutyCardDescription(row));
        var assignedBy = normalize(row.assigned_by);
        var roomLabel = activityKey === "result_file_checking" ? "Class" : "Room";
        return (
          "<tr>" +
            "<td>" + esc(row.teacher_name || "-") + "</td>" +
            "<td>" + esc(row.teacher_id || "-") + "</td>" +
            "<td><strong>" + esc(row.title || "-") + "</strong>" +
              (description ? "<div class='helper'>" + esc(description) + "</div>" : "") +
            "</td>" +
            "<td>" + esc(row.exam_name || "-") + "</td>" +
            "<td>" + esc(row.room_no || "-") +
              "<div class='helper'>" + roomLabel + " | Status: " + esc(statusLabel) + (assignedBy ? " | Updated By: " + esc(assignedBy) : "") + "</div>" +
            "</td>" +
            "<td>" + esc(row.duty_date || "-") + "</td>" +
            "<td>" + esc(row.due_date || "-") + "</td>" +
            "<td class='action-cell'>" +
              "<button type='button' class='secondary-btn' onclick=\"editDutyRecord('" + esc(row.id) + "')\">Edit</button>" +
              "<button type='button' class='danger-btn' onclick=\"deleteDutyRecord('" + esc(row.id) + "')\">Delete</button>" +
            "</td>" +
          "</tr>"
        );
      }).join("");
    }catch(e){
      table.innerHTML = '<tr><td colspan="8">Failed to load duties.</td></tr>';
      setStatus("listStatus", e.message || "Unable to load duties", true);
    }
  }

  function fillAdminForm(row){
    document.getElementById("dutyId").value = row.id || "";
    document.getElementById("teacherSelect").value = row.teacher_id || "";
    setSelectedDutyTypes(String(row.title || "").split("|").map(function(item){ return normalize(item); }));
    document.getElementById("examSelect").value = row.exam_name || "";
    var resultClassSelect = document.getElementById("resultClassSelect");
    if(resultClassSelect) resultClassSelect.value = row.room_no || "";
    document.getElementById("dutyDate").value = row.duty_date || "";
    document.getElementById("dueDate").value = row.due_date || "";
    setStatus("formStatus", "Editing duty for " + (row.teacher_name || "teacher"), false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAdminDuty(){
    var session = getSession();
    var body = document.body;
    var activityKey = body.dataset.activityKey || "";
    var activityTitle = body.dataset.activityTitle || "";
    var teacherSelect = document.getElementById("teacherSelect");
    var teacherId = normalize(teacherSelect.value);
    var teacherName = teacherId ? normalize(teacherSelect.options[teacherSelect.selectedIndex].dataset.name) : "";
    var selectedDuties = getSelectedDutyTypes();
    var selectedDuty = selectedDuties.join(" | ");
    var examName = normalize(document.getElementById("examSelect").value);
    var resultClass = normalize((document.getElementById("resultClassSelect") || {}).value);
    var dutyDate = normalize(document.getElementById("dutyDate").value);
    var dueDate = normalize(document.getElementById("dueDate").value);
    var assignedRoom = activityKey === "result_file_checking" ? resultClass : "";
    var roomLabel = activityKey === "result_file_checking" ? "Class" : "Room";
    var autoDescription = [
      "Duties: " + selectedDuty,
      "Exam: " + examName,
      (assignedRoom ? roomLabel + ": " + assignedRoom : ""),
      "Duty Date: " + dutyDate,
      "Submission Date: " + dueDate
    ].filter(Boolean).join(" | ");
    var payload = {
      id: normalize(document.getElementById("dutyId").value),
      session: session,
      activity_key: activityKey,
      activity_title: activityTitle,
      teacher_id: teacherId,
      teacher_name: teacherName,
      title: selectedDuty,
      exam_name: examName,
      room_no: assignedRoom,
      duty_date: dutyDate,
      due_date: dueDate,
      description: autoDescription,
      assigned_by: "Admin"
    };

    if(!session) return setStatus("formStatus", "Select current session first on admin login.", true);
    if(!payload.title || !payload.teacher_id || !payload.exam_name || !payload.duty_date || !payload.due_date){
      return setStatus("formStatus", "Select one or more duties, teacher, exam, duty date and submission date.", true);
    }
    if(activityKey === "result_file_checking" && !resultClass){
      return setStatus("formStatus", "Select class for result checking duty.", true);
    }

    try{
      await fetchJson(EXAM_API + "/teacher-duty/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setStatus("formStatus", "Duty saved successfully.", false);
      document.getElementById("dutyForm").reset();
      document.getElementById("dutyId").value = "";
      setSelectedDutyTypes([]);
      await loadTeacherOptions(session);
      await loadResultClassOptions(session);
      await loadAdminDutyList(session, activityKey);
    }catch(e){
      setStatus("formStatus", e.message || "Unable to save duty", true);
    }
  }

  async function deleteAdminDuty(id){
    if(!id) return;
    if(!confirm("Delete this duty assignment?")) return;
    try{
      await fetchJson(EXAM_API + "/teacher-duty/delete/" + encodeURIComponent(id), { method: "DELETE" });
      setStatus("listStatus", "Duty deleted.", false);
      await loadAdminDutyList(getSession(), document.body.dataset.activityKey || "");
    }catch(e){
      setStatus("listStatus", e.message || "Unable to delete duty", true);
    }
  }

  async function initAdminAssign(){
    await loadActivities();
    populateActivityNav("activityPageSelect");
    var session = await resolveLatestSession();
    var activityTitle = document.body.dataset.activityTitle || "Teacher Duties";
    setText("activityTitle", activityTitle);
    setText("activitySubtitle", "Assign " + activityTitle.toLowerCase() + " to teachers.");
    setText("currentSessionLabel", session || "Session not selected");
    loadDutyTypeOptions();
    await loadTeacherOptions(session);
    await loadExamOptions(session);
    if((document.body.dataset.activityKey || "") === "result_file_checking"){
      await loadResultClassOptions(session);
    }
    await loadAdminDutyList(session, document.body.dataset.activityKey || "");
    var form = document.getElementById("dutyForm");
    if(form){
      form.addEventListener("submit", function(ev){
        ev.preventDefault();
        saveAdminDuty();
      });
    }
    var resetBtn = document.getElementById("resetDutyBtn");
    if(resetBtn){
      resetBtn.onclick = function(){
        form.reset();
        document.getElementById("dutyId").value = "";
        setStatus("formStatus", "", false);
      };
    }
  }

  async function initTeacherDutyPage(){
    await loadActivities();
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var teacherName = aliasInfo.teacherName || getTeacherName();
    setText("teacherDutySession", session || "Session not selected");
    setText("teacherDutyName", teacherName);
    if(!(Array.isArray(aliasInfo.ids) && aliasInfo.ids.length)){
      setStatus("teacherDutyStatus", "Teacher login details are missing.", true);
      return;
    }
    try{
      var rows = await loadTeacherDutyRows(aliasInfo);
      setText("teacherDutyCount", String(rows.length));
      var wrap = document.getElementById("teacherDutyList");
      if(!wrap) return;
      if(!rows.length){
        wrap.innerHTML = '<div class="teacher-empty">No duty assignments are available for your login in this session.</div>';
        return;
      }
      wrap.innerHTML = rows.map(function(row){
        var meta = activityMeta(row.activity_key);
        var page = activityTeacherPage(row.activity_key);
        var cardDescription = getTeacherDutyCardDescription(row);
        return (
          '<article class="teacher-duty-card">' +
            '<div class="teacher-duty-head">' +
              '<span class="teacher-duty-badge">' + esc((meta && meta.title) || row.activity_title || "Duty") + '</span>' +
              '<span class="teacher-duty-date">' + esc(row.duty_date || row.due_date || "Date not set") + '</span>' +
            '</div>' +
            '<h3>' + esc(row.title || "Duty Assignment") + '</h3>' +
            '<p>' + esc(cardDescription) + '</p>' +
            '<div class="teacher-duty-meta">' +
              '<span>Exam: ' + esc(row.exam_name || "-") + '</span>' +
              '<span>Room: ' + esc(row.room_no || "-") + '</span>' +
              '<span>Status: ' + esc(row.status || "assigned") + '</span>' +
              '<span>Due: ' + esc(row.due_date || "-") + '</span>' +
            '</div>' +
            '<div style="margin-top:18px;">' +
              '<button type="button" class="teacher-duty-open-btn" onclick="openTeacherDutyPage(\'' + esc(page) + '\', \'' + esc(row.activity_key || "") + '\', \'' + esc(row.id || "") + '\')">Open</button>' +
            '</div>' +
          '</article>'
        );
      }).join("");
    }catch(e){
      setStatus("teacherDutyStatus", e.message || "Unable to load duties.", true);
    }
  }

  window.editDutyRecord = function(id){
    var row = dutyState.records.find(function(item){ return item.id === id; });
    if(row) fillAdminForm(row);
  };

  window.deleteDutyRecord = function(id){
    deleteAdminDuty(id);
  };

  async function loadTeacherDutyRows(aliasInfo, activityKey){
    aliasInfo = aliasInfo || await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var teacherName = aliasInfo.teacherName || getTeacherName();
    var teacherIds = Array.isArray(aliasInfo.ids) ? aliasInfo.ids : [];
    var rows = [];

    for(var i = 0; i < teacherIds.length; i++){
      var teacherId = teacherIds[i];
      var sessionUrl = EXAM_API + "/teacher-duty/list?teacher_id=" + encodeURIComponent(teacherId);
      if(session){
        sessionUrl += "&session=" + encodeURIComponent(session);
      }
      if(activityKey){
        sessionUrl += "&activity_key=" + encodeURIComponent(activityKey);
      }
      try{
        var data = await fetchJson(sessionUrl);
        rows = Array.isArray(data.duties) ? data.duties : [];
      }catch(_e){}
      if(rows.length) break;
    }

    if(!rows.length && teacherName && session){
      try{
        var bySession = await fetchJson(
          EXAM_API + "/teacher-duty/list?session=" + encodeURIComponent(session) + (activityKey ? "&activity_key=" + encodeURIComponent(activityKey) : "")
        );
        var dutyRows = Array.isArray(bySession.duties) ? bySession.duties : [];
        rows = dutyRows.filter(function(row){
          return normalize(row.teacher_name) === teacherName;
        });
      }catch(_e){}
    }

    return rows;
  }

  function fillTeacherDutyForm(row){
    var activityKey = document.body.dataset.activityKey || "";
    document.getElementById("teacherDutyId").value = row.id || "";
    document.getElementById("teacherDutyTeacherId").value = row.teacher_id || "";
    document.getElementById("teacherDutyTitle").value = row.title || "";
    document.getElementById("teacherDutyExam").value = row.exam_name || "";
    document.getElementById("teacherDutyDate").value = row.duty_date || "";
    document.getElementById("teacherDutyDueDate").value = row.due_date || "";
    var roomEl = document.getElementById("teacherDutyRoom");
    if(roomEl) roomEl.value = row.room_no || "";
    var statusEl = document.getElementById("teacherDutyStatusSelect");
    if(statusEl) statusEl.value = row.status || "assigned";
    var descEl = document.getElementById("teacherDutyDescription");
    if(descEl) descEl.value = activityKey === "exam_seating_plan" ? "" : (row.description || "");
    var assignedClassEl = document.getElementById("teacherAssignedClass");
    if(assignedClassEl) assignedClassEl.value = row.room_no || "";
    var info = [
      "Teacher: " + (row.teacher_name || getTeacherName() || "-"),
      "Assigned By: " + (row.assigned_by || "Admin"),
      "Exam: " + (row.exam_name || "-"),
      "Class: " + (row.room_no || "-"),
      "Status: " + (row.status || "assigned")
    ];
    setText("teacherDutyCurrentInfo", info.join(" | "));
    setStatus("teacherDutyFormStatus", "Editing assigned duty details.", false);
    if(activityKey === "exam_paper_allotment"){
      loadTeacherPaperAllotmentSummary(row);
    }else if(activityKey === "invigilation_duties"){
      loadTeacherInvigilationSummary(row);
    }else if(activityKey === "attendance_compilation"){
      loadTeacherAttendanceTools(row);
    }else if(activityKey === "result_file_checking"){
      loadTeacherResultCheckingSheet(row);
    }
  }

  function fillTeacherRoomDutyForm(row, session){
    fillTeacherDutyForm(row);
    var roomInput = document.getElementById("teacherRoomNo");
    if(roomInput) roomInput.value = row.room_no || "";
    var benchRows = getRoomBenchRows(row);
    var rowsInput = document.getElementById("teacherRoomRows");
    if(rowsInput) rowsInput.value = benchRows.length || row.rows || "";
    renderTeacherBenchRowInputs(benchRows.length || row.rows || 0, benchRows);
  }

  function getRoomBenchRows(row){
    if(row && Array.isArray(row.bench_rows) && row.bench_rows.length){
      return row.bench_rows.map(function(value){ return Number(value || 0); }).filter(function(value){ return value > 0; });
    }
    var rowCount = Number(row && row.rows || 0);
    var perRow = Number(row && row.benches_per_row || 0);
    return Array.from({ length: rowCount }, function(){ return perRow; }).filter(function(value){ return value > 0; });
  }

  function renderTeacherBenchRowInputs(count, values){
    var wrap = document.getElementById("teacherBenchRowsWrap");
    if(!wrap) return;
    var total = Math.max(0, Number(count || 0));
    var list = Array.isArray(values) ? values : [];
    if(!total){
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = Array.from({ length: total }).map(function(_item, idx){
      return '<div><label for="teacherBenchRow_' + idx + '">Benches Row ' + (idx + 1) + '</label><input id="teacherBenchRow_' + idx + '" class="teacher-bench-row-input" type="number" min="1" value="' + esc(list[idx] || "") + '" placeholder="e.g. 4"></div>';
    }).join("");
  }

  function getTeacherBenchRowValues(){
    return Array.from(document.querySelectorAll(".teacher-bench-row-input")).map(function(input){
      return Number(input.value || 0);
    }).filter(function(value){
      return value > 0;
    });
  }

  function renderTeacherDutyAssignmentList(rows){
    var table = document.getElementById("teacherDutyAssignmentBody");
    if(!table) return;
    if(!rows.length){
      table.innerHTML = '<tr><td colspan="7">No assigned duties found for this activity.</td></tr>';
      return;
    }
    table.innerHTML = rows.map(function(row){
      return (
        "<tr>" +
          "<td>" + esc(row.title || "-") + "</td>" +
          "<td>" + esc(row.exam_name || "-") + "</td>" +
          "<td>" + esc(row.room_no || "-") + "</td>" +
          "<td>" + esc(row.duty_date || "-") + "</td>" +
          "<td>" + esc(row.due_date || "-") + "</td>" +
          "<td>" + esc(row.status || "assigned") + "</td>" +
          "<td><button type='button' class='secondary-btn' onclick=\"editTeacherDutyRecord('" + esc(row.id) + "')\">Fill Details</button></td>" +
        "</tr>"
      );
    }).join("");
  }

  function renderTeacherPaperAllotmentSummaryFromPlan(plan){
    var body = document.getElementById("teacherPaperSummaryBody");
    var statusEl = document.getElementById("teacherPaperSummaryStatus");
    if(!body || !statusEl) return;
    if(!plan){
      body.innerHTML = '<tr><td colspan="5">Select a saved seating plan to view room-wise paper summary.</td></tr>';
      statusEl.textContent = "Choose a saved seating plan first.";
      return;
    }
    var rows = Array.isArray(plan.assignment_rows) ? plan.assignment_rows.slice() : [];
    rows.sort(function(a, b){
      var roomCmp = normalize(a.roomNo || a.room_no).localeCompare(normalize(b.roomNo || b.room_no));
      if(roomCmp !== 0) return roomCmp;
      return normalize(a.className || a.class_name).localeCompare(normalize(b.className || b.class_name));
    });

    if(!rows.length){
      body.innerHTML = '<tr><td colspan="5">No room-wise seating rows found.</td></tr>';
      statusEl.textContent = "Saved seating plan has no assignment rows.";
      return;
    }

    var roomTotals = {};
    rows.forEach(function(item){
      var roomNo = normalize(item.roomNo || item.room_no) || "-";
      roomTotals[roomNo] = (roomTotals[roomNo] || 0) + Number(item.studentCount || item.student_count || 0);
    });
    var groupedRows = {};
    rows.forEach(function(item){
      var roomNo = normalize(item.roomNo || item.room_no) || "-";
      if(!groupedRows[roomNo]) groupedRows[roomNo] = [];
      groupedRows[roomNo].push(item);
    });
    body.innerHTML = Object.keys(groupedRows).sort().map(function(roomNo){
      var roomHeader = '<tr class="room-group-row"><td colspan="5">Room ' + esc(roomNo) + '<span class="room-group-total">' + esc(roomTotals[roomNo] + " papers total") + '</span></td></tr>';
      var roomRows = groupedRows[roomNo].map(function(item){
        var className = normalize(item.className || item.class_name) || "-";
        var subject = normalize(item.subject) || "-";
        var count = Number(item.studentCount || item.student_count || 0);
        var paperText = count + " paper " + className + " class " + subject + " subject";
        return '<tr><td>' + esc(roomNo) + '</td><td>' + esc(className) + '</td><td>' + esc(subject) + '</td><td>' + esc(count) + '</td><td>' + esc(paperText) + '</td></tr>';
      }).join("");
      return roomHeader + roomRows;
    }).join("");

    var totalPapers = rows.reduce(function(sum, item){
      return sum + Number(item.studentCount || item.student_count || 0);
    }, 0);
    var roomSummary = Object.keys(roomTotals).sort().map(function(roomNo){
      return roomNo + ": " + roomTotals[roomNo];
    }).join(" | ");
    statusEl.textContent = "Selected plan: " + normalize(plan.exam_date || "-") + " (" + normalize(plan.exam_name || "-") + "). Total papers needed: " + totalPapers + ". Room-wise: " + roomSummary;
  }

  async function loadTeacherPaperAllotmentSummary(row){
    var body = document.getElementById("teacherPaperSummaryBody");
    var statusEl = document.getElementById("teacherPaperSummaryStatus");
    var planSelect = document.getElementById("teacherPaperPlanSelect");
    if(!body || !statusEl || !planSelect) return;
    body.innerHTML = '<tr><td colspan="5">Loading room-wise paper summary...</td></tr>';
    statusEl.textContent = "";
    planSelect.innerHTML = '<option value="">Loading saved seating plans...</option>';

    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var examName = normalize((row && row.exam_name) || (document.getElementById("teacherDutyExam") || {}).value);
    var examDate = normalize((row && row.duty_date) || (document.getElementById("teacherDutyDate") || {}).value);
    if(!session){
      body.innerHTML = '<tr><td colspan="5">Exam session is missing.</td></tr>';
      statusEl.textContent = "Paper summary needs session.";
      planSelect.innerHTML = '<option value="">Select saved seating plan</option>';
      return;
    }

    try{
      var url = EXAM_API + "/seating-plan/list?session=" + encodeURIComponent(session);
      if(examName){
        url += "&exam_name=" + encodeURIComponent(examName);
      }
      var data = await fetchJson(url);
      var plans = Array.isArray(data.plans) ? data.plans : [];
      if(!plans.length){
        dutyState.paperAllotment.savedPlans = [];
        planSelect.innerHTML = '<option value="">No saved seating plans found</option>';
        body.innerHTML = '<tr><td colspan="5">No saved seating plan found.</td></tr>';
        statusEl.textContent = "No seating plan found, so paper count cannot be prepared.";
        return;
      }
      dutyState.paperAllotment.savedPlans = plans.slice().sort(function(a, b){
        var dateCmp = normalize(a.exam_date).localeCompare(normalize(b.exam_date));
        if(dateCmp !== 0) return dateCmp;
        return normalize(a.exam_name).localeCompare(normalize(b.exam_name));
      });
      planSelect.innerHTML = '<option value="">Select saved seating plan</option>' + dutyState.paperAllotment.savedPlans.map(function(plan){
        return '<option value="' + esc(plan.id || "") + '">' + esc((plan.exam_date || "-") + " (" + (plan.exam_name || "-") + ")") + '</option>';
      }).join("");
      var preferredPlan = dutyState.paperAllotment.savedPlans.find(function(plan){
        return normalize(plan.exam_name) === examName && normalize(plan.exam_date) === examDate;
      }) || dutyState.paperAllotment.savedPlans[0] || null;
      if(preferredPlan){
        planSelect.value = preferredPlan.id || "";
      }
      planSelect.onchange = function(){
        var selectedPlan = dutyState.paperAllotment.savedPlans.find(function(item){
          return String(item.id || "") === String(planSelect.value || "");
        }) || null;
        renderTeacherPaperAllotmentSummaryFromPlan(selectedPlan);
      };
      renderTeacherPaperAllotmentSummaryFromPlan(preferredPlan);
    }catch(e){
      dutyState.paperAllotment.savedPlans = [];
      planSelect.innerHTML = '<option value="">Unable to load saved seating plans</option>';
      body.innerHTML = '<tr><td colspan="5">Unable to load paper summary.</td></tr>';
      statusEl.textContent = e.message || "Unable to load room-wise paper summary.";
    }
  }

  async function loadTeacherInvigilationTeacherOptions(session){
    if(dutyState.invigilation.teacherOptions.length) return dutyState.invigilation.teacherOptions;
    try{
      var data = await fetchJson(EXAM_API + "/teacher/list?session=" + encodeURIComponent(session || ""));
      var rows = Array.isArray(data.teachers) ? data.teachers : [];
      dutyState.invigilation.teacherOptions = rows.map(function(item){
        return {
          teacher_id: normalize(item.teacher_id || item.id),
          name: normalize(item.name) || "Teacher"
        };
      }).filter(function(item){
        return item.teacher_id;
      }).sort(function(a, b){
        return a.name.localeCompare(b.name);
      });
    }catch(_e){
      dutyState.invigilation.teacherOptions = [];
    }
    return dutyState.invigilation.teacherOptions;
  }

  function getInvigilationTeacherLabel(teacherId){
    var id = normalize(teacherId);
    var match = (dutyState.invigilation.teacherOptions || []).find(function(item){
      return normalize(item.teacher_id) === id;
    });
    return match ? (match.name + " (" + match.teacher_id + ")") : id;
  }

  function parseInvigilationTeacherMap(text){
    var marker = "__INVIGILATION_JSON__:";
    var raw = String(text || "");
    var index = raw.indexOf(marker);
    if(index === -1) return {};
    try{
      return JSON.parse(decodeURIComponent(raw.slice(index + marker.length))) || {};
    }catch(_e){
      return {};
    }
  }

  function buildInvigilationTeacherDescription(roomTeacherMap){
    var map = roomTeacherMap || {};
    var summary = Object.keys(map).sort().map(function(roomNo){
      var teachers = (map[roomNo] || []).map(getInvigilationTeacherLabel).filter(Boolean);
      return "Room " + roomNo + ": " + (teachers.join(", ") || "No teacher added");
    }).join(" | ");
    return [
      "Invigilation Teachers: " + (summary || "No teacher added"),
      "__INVIGILATION_JSON__:" + encodeURIComponent(JSON.stringify(map))
    ].join("\n");
  }

  function getTeacherDutyCardDescription(row){
    var activityKey = normalize(row && row.activity_key);
    var description = String((row && row.description) || "").trim();
    if(activityKey === "invigilation_duties"){
      description = description.split("__INVIGILATION_JSON__:")[0].trim();
    }
    return description || "No details added by admin.";
  }

  function saveLocalInvigilationNotifications(session, sourceDuty, desired){
    try{
      var key = "teacher_local_notifications_v1";
      var raw = localStorage.getItem(key);
      var existing = [];
      try{
        existing = JSON.parse(raw || "[]");
      }catch(_e){
        existing = [];
      }
      existing = Array.isArray(existing) ? existing : [];
      var sourceDutyId = normalize(sourceDuty && sourceDuty.id);
      var next = existing.filter(function(item){
        return !(normalize(item.type) === "invigilation" &&
          normalize(item.session) === normalize(session) &&
          normalize(item.source_duty_id) === sourceDutyId);
      });
      var nowIso = new Date().toISOString();
      desired.forEach(function(item){
        next.push({
          type: "invigilation",
          session: session,
          source_duty_id: sourceDutyId,
          teacher_id: item.teacher_id,
          teacher_name: item.teacher_name,
          room_no: item.room_no,
          title: item.title,
          message: item.message,
          exam_name: normalize(sourceDuty && sourceDuty.exam_name),
          duty_date: normalize(sourceDuty && sourceDuty.duty_date),
          due_date: normalize(sourceDuty && sourceDuty.due_date),
          updated_at: nowIso
        });
      });
      localStorage.setItem(key, JSON.stringify(next));
    }catch(_e){}
  }

  async function syncInvigilationTeacherAssignments(sourceDuty){
    var roomTeacherMap = collectInvigilationTeacherMap();
    var session = normalize(sourceDuty && sourceDuty.session);
    var examName = normalize(sourceDuty && sourceDuty.exam_name);
    var dutyDate = normalize(sourceDuty && sourceDuty.duty_date);
    var dueDate = normalize(sourceDuty && sourceDuty.due_date);
    var sourceDutyId = normalize(sourceDuty && sourceDuty.id);
    var sourceTeacherId = normalize(sourceDuty && sourceDuty.teacher_id);
    var sourceTeacherName = normalize(sourceDuty && sourceDuty.teacher_name);
    var title = normalize(sourceDuty && sourceDuty.title) || "Invigilation Duty";
    var activityKey = "invigilation_duties";
    var activityTitle = "Teachers Duties in Seating Plan";
    var marker = "__INVIGILATION_ROOM_ASSIGN__:";
    if(!session || !sourceDutyId) return;

    var teacherById = {};
    (dutyState.invigilation.teacherOptions || []).forEach(function(item){
      var id = normalize(item.teacher_id);
      if(id) teacherById[id] = normalize(item.name) || "Teacher";
    });

    var desired = [];
    Object.keys(roomTeacherMap).forEach(function(roomNo){
      (roomTeacherMap[roomNo] || []).forEach(function(assignedTeacherId){
        var tid = normalize(assignedTeacherId);
        if(!tid) return;
        desired.push({
          teacher_id: tid,
          teacher_name: teacherById[tid] || "Teacher",
          room_no: normalize(roomNo),
          notification_key: [
            "invigilation",
            sourceDutyId,
            normalize(roomNo),
            tid
          ].join("||"),
          title: "Examiner Duty Appointment",
          message: [
            "You are assigned for examiner duty.",
            "Role: " + title,
            examName ? "Exam: " + examName : "",
            roomNo ? "Room: " + roomNo : "",
            dutyDate ? "Date: " + dutyDate : ""
          ].filter(Boolean).join(" | ")
        });
      });
    });

    var existingData = await fetchJson(
      EXAM_API + "/teacher-duty/list?session=" + encodeURIComponent(session) +
      "&activity_key=" + encodeURIComponent(activityKey)
    );
    var existingRows = Array.isArray(existingData.duties) ? existingData.duties : [];
    var generatedRows = existingRows.filter(function(row){
      return normalize(row.exam_name) === examName &&
        normalize(row.duty_date) === dutyDate &&
        normalize(row.activity_key) === activityKey &&
        String(row.description || "").indexOf(marker) !== -1 &&
        String(row.description || "").indexOf(sourceDutyId) !== -1;
    });

    var desiredKeys = {};
    desired.forEach(function(item){
      desiredKeys[item.teacher_id + "||" + item.room_no] = item;
    });

    for(var i = 0; i < generatedRows.length; i++){
      var oldKey = normalize(generatedRows[i].teacher_id) + "||" + normalize(generatedRows[i].room_no);
      if(!desiredKeys[oldKey]){
        try{
          await fetchJson(EXAM_API + "/teacher-duty/delete/" + encodeURIComponent(generatedRows[i].id), { method: "DELETE" });
        }catch(_e){}
      }
    }

    var existingNotificationsData = await fetchJson(
      EXAM_API + "/teacher-notification/list?session=" + encodeURIComponent(session)
    );
    var existingNotifications = Array.isArray(existingNotificationsData.notifications) ? existingNotificationsData.notifications : [];
    var generatedNotifications = existingNotifications.filter(function(row){
      return normalize(row.activity_key) === activityKey &&
        normalize(row.exam_name) === examName &&
        normalize(row.duty_date) === dutyDate &&
        normalize(row.source_duty_id) === sourceDutyId;
    });

    for(var j = 0; j < desired.length; j++){
      var assignment = desired[j];
      var key = assignment.teacher_id + "||" + assignment.room_no;
      await fetchJson(EXAM_API + "/teacher-notification/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: session,
          teacher_id: assignment.teacher_id,
          teacher_name: assignment.teacher_name,
          notification_key: assignment.notification_key,
          title: assignment.title,
          message: assignment.message,
          activity_key: activityKey,
          activity_title: activityTitle,
          exam_name: examName,
          room_no: assignment.room_no,
          duty_date: dutyDate,
          assigned_by: sourceTeacherName || "Teacher",
          source_duty_id: sourceDutyId
        })
      });
      delete desiredKeys[key];
    }

    for(var k = 0; k < generatedNotifications.length; k++){
      var existingNotification = generatedNotifications[k];
      var existingKey = [
        "invigilation",
        sourceDutyId,
        normalize(existingNotification.room_no),
        normalize(existingNotification.teacher_id)
      ].join("||");
      if(desired.some(function(item){ return item.notification_key === existingKey; })){
        continue;
      }
      try{
        await fetchJson(EXAM_API + "/teacher-notification/delete/" + encodeURIComponent(existingNotification.id), {
          method: "DELETE"
        });
      }catch(_e){}
    }

    saveLocalInvigilationNotifications(session, sourceDuty, desired);
  }

  function getInvigilationTeacherListHost(roomNo){
    return Array.from(document.querySelectorAll("[data-room-teacher-list]")).find(function(el){
      return normalize(el.getAttribute("data-room-teacher-list")) === normalize(roomNo);
    }) || null;
  }

  function renderInvigilationTeacherInputs(roomNo, values){
    var host = getInvigilationTeacherListHost(roomNo);
    if(!host) return;
    var teacherValues = Array.isArray(values) && values.length ? values.map(normalize) : [""];
    var optionHtml = '<option value="">Select Teacher</option>' + (dutyState.invigilation.teacherOptions || []).map(function(item){
      return '<option value="' + esc(item.teacher_id) + '">' + esc(item.name + " (" + item.teacher_id + ")") + '</option>';
    }).join("");
    host.innerHTML = teacherValues.map(function(value, idx){
      var fallbackOption = value && optionHtml.indexOf('value="' + esc(value) + '"') === -1
        ? '<option value="' + esc(value) + '">' + esc(value) + '</option>'
        : "";
      return '<div class="invig-teacher-entry"><select class="invig-room-teacher">' + fallbackOption + optionHtml + '</select>' + (teacherValues.length > 1 ? '<button type="button" class="mini-btn remove-btn" data-room-teacher-remove="' + esc(roomNo) + '" data-room-teacher-index="' + idx + '">Remove</button>' : '') + '</div>';
    }).join("");
    Array.from(host.querySelectorAll(".invig-room-teacher")).forEach(function(select, idx){
      select.value = teacherValues[idx] || "";
      select.onchange = function(){};
    });
    Array.from(host.querySelectorAll("[data-room-teacher-remove]")).forEach(function(btn){
      btn.onclick = function(){
        var current = collectInvigilationTeacherMap();
        var list = Array.isArray(current[roomNo]) ? current[roomNo].slice() : [];
        list.splice(Number(this.getAttribute("data-room-teacher-index") || 0), 1);
        renderInvigilationTeacherInputs(roomNo, list.length ? list : [""]);
      };
    });
  }

  function collectInvigilationTeacherMap(){
    var map = {};
    Array.from(document.querySelectorAll("[data-room-summary]")).forEach(function(row){
      var roomNo = normalize(row.getAttribute("data-room-summary"));
      var host = getInvigilationTeacherListHost(roomNo);
      if(!roomNo || !host) return;
      map[roomNo] = Array.from(host.querySelectorAll(".invig-room-teacher")).map(function(select){
        return normalize(select.value);
      }).filter(Boolean);
    });
    return map;
  }

  function setInvigilationInlineStatus(message, bad){
    var el = document.getElementById("teacherInvigilationStatus");
    if(!el) return;
    el.textContent = message || "";
    el.style.color = bad ? "#b91c1c" : "#1d4ed8";
  }

  async function saveInvigilationAssignmentsOnly(silent){
    if(dutyState.invigilation.isAutoSaving) return;
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var dutyId = normalize(document.getElementById("teacherDutyId").value);
    var title = normalize(document.getElementById("teacherDutyTitle").value);
    var examName = normalize(document.getElementById("teacherDutyExam").value);
    var dutyDate = normalize(document.getElementById("teacherDutyDate").value);
    var dueDate = normalize(document.getElementById("teacherDutyDueDate").value);
    var teacherId = normalize(document.getElementById("teacherDutyTeacherId").value) || (Array.isArray(aliasInfo.ids) && aliasInfo.ids.length ? aliasInfo.ids[0] : getTeacherId());
    var teacherName = aliasInfo.teacherName || getTeacherName();
    var activityKey = "invigilation_duties";
    var roomTeacherMap = collectInvigilationTeacherMap();
    var roomNo = Object.keys(roomTeacherMap).sort(function(a, b){
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    }).join(", ");
    var description = buildInvigilationTeacherDescription(roomTeacherMap);
    var status = "completed";

    if(!session || !teacherId || !dutyId || !title){
      return;
    }

    dutyState.invigilation.isAutoSaving = true;
    setStatus("teacherDutyFormStatus", "Saving examiner duty assignment...", false);
    setInvigilationInlineStatus("Saving examiner duty assignment...", false);
    try{
      var payload = {
        id: dutyId,
        session: session,
        activity_key: activityKey,
        activity_title: document.body.dataset.activityTitle || "",
        teacher_id: teacherId,
        teacher_name: teacherName,
        title: title,
        exam_name: examName,
        room_no: roomNo,
        duty_date: dutyDate,
        due_date: dueDate,
        description: description,
        status: status,
        assigned_by: "Teacher"
      };
      try{
        console.log("Invigilation save payload", payload);
      }catch(_e){}
      await fetchJson(EXAM_API + "/teacher-duty/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if(document.getElementById("teacherDutyRoom")) document.getElementById("teacherDutyRoom").value = roomNo;
      if(document.getElementById("teacherDutyStatusSelect")) document.getElementById("teacherDutyStatusSelect").value = status;
      if(document.getElementById("teacherDutyDescription")) document.getElementById("teacherDutyDescription").value = description;

      setStatus("teacherDutyFormStatus", "Examiner duty assignment saved. Use Send Notification to notify teachers.", false);
      setInvigilationInlineStatus("Examiner duty assignment saved. Notification not sent yet.", false);
    }catch(e){
      setStatus("teacherDutyFormStatus", e.message || "Unable to send examiner duty notification.", true);
      setInvigilationInlineStatus(e.message || "Unable to save examiner duty assignment.", true);
      try{
        console.error("Invigilation save failed", e);
      }catch(_e){}
    }finally{
      dutyState.invigilation.isAutoSaving = false;
    }
  }

  async function sendInvigilationNotificationsOnly(){
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var dutyId = normalize(document.getElementById("teacherDutyId").value);
    var title = normalize(document.getElementById("teacherDutyTitle").value);
    var examName = normalize(document.getElementById("teacherDutyExam").value);
    var dutyDate = normalize(document.getElementById("teacherDutyDate").value);
    var dueDate = normalize(document.getElementById("teacherDutyDueDate").value);
    var teacherId = normalize(document.getElementById("teacherDutyTeacherId").value) || (Array.isArray(aliasInfo.ids) && aliasInfo.ids.length ? aliasInfo.ids[0] : getTeacherId());
    var teacherName = aliasInfo.teacherName || getTeacherName();

    if(!session || !teacherId || !dutyId || !title){
      return setInvigilationInlineStatus("Save the invigilation duty first.", true);
    }

    setStatus("teacherDutyFormStatus", "Sending examiner duty notifications...", false);
    setInvigilationInlineStatus("Sending examiner duty notifications...", false);
    try{
      await syncInvigilationTeacherAssignments({
        id: dutyId,
        session: session,
        exam_name: examName,
        duty_date: dutyDate,
        due_date: dueDate,
        teacher_id: teacherId,
        teacher_name: teacherName,
        title: title
      });
      if(typeof window.refreshTeacherNotifications === "function"){
        try{
          await window.refreshTeacherNotifications();
        }catch(_e){}
      }
      setStatus("teacherDutyFormStatus", "Examiner duty notifications sent.", false);
      setInvigilationInlineStatus("Examiner duty notifications sent successfully.", false);
    }catch(e){
      setStatus("teacherDutyFormStatus", e.message || "Unable to send examiner duty notifications.", true);
      setInvigilationInlineStatus(e.message || "Unable to send examiner duty notifications.", true);
    }
  }

  async function renderTeacherInvigilationSummaryFromPlan(plan, row){
    var body = document.getElementById("teacherInvigilationRoomBody");
    var statusEl = document.getElementById("teacherInvigilationStatus");
    var seatHost = document.getElementById("teacherInvigilationSeatHost");
    var seatStatus = document.getElementById("teacherInvigilationSeatStatus");
    if(!body || !statusEl || !seatHost || !seatStatus) return;
    if(!plan){
      dutyState.invigilation.currentPlan = null;
      body.innerHTML = '<tr><td colspan="5">Select a saved seating plan to view invigilation summary.</td></tr>';
      seatHost.innerHTML = '<div class="helper">Select a saved seating plan to view room-wise seating plan.</div>';
      statusEl.textContent = "Choose a saved seating plan first.";
      seatStatus.textContent = "";
      return;
    }

    try{
      dutyState.invigilation.currentPlan = plan;
      dutyState.invigilation.dutyRow = row || dutyState.invigilation.dutyRow || null;
      var aliasInfo = await resolveTeacherAliases();
      var session = aliasInfo.session || await resolveLatestSession();
      await loadTeacherInvigilationTeacherOptions(session);
      var roomData = await fetchJson(EXAM_API + "/rooms/list?session=" + encodeURIComponent(session || ""));
      dutyState.teacherSeating.rooms = Array.isArray(roomData.rooms) ? roomData.rooms.slice() : [];
      var selectedClasses = Array.isArray(plan.selected_classes) && plan.selected_classes.length ? plan.selected_classes.slice() : Array.from(new Set((plan.assignment_rows || []).map(function(item){
        return normalize(item.className || item.class_name);
      }).filter(Boolean)));
      await loadTeacherSeatingStudents(session, selectedClasses);

      var assignmentRows = Array.isArray(plan.assignment_rows) ? plan.assignment_rows.map(function(item){
        return {
          className: normalize(item.className || item.class_name),
          subject: normalize(item.subject) || "-",
          studentCount: Number(item.studentCount || item.student_count || 0),
          roomNo: normalize(item.roomNo || item.room_no)
        };
      }).filter(function(item){
        return item.className && item.roomNo && Number(item.studentCount || 0) > 0;
      }) : [];
      dutyState.teacherSeating.assignmentRows = assignmentRows.slice();
      if(!assignmentRows.length){
        body.innerHTML = '<tr><td colspan="5">No room-wise seating rows found.</td></tr>';
        seatHost.innerHTML = '<div class="helper">Saved seating plan has no assignment rows.</div>';
        statusEl.textContent = "Saved seating plan has no assignment rows.";
        return;
      }

      var teacherMap = parseInvigilationTeacherMap((row && row.description) || "");
      var segments = buildTeacherAssignmentSegments(assignmentRows, dutyState.teacherSeating.classStudentsMap);
      var roomGroups = {};
      segments.forEach(function(segment){
        var roomNo = normalize(segment.roomNo) || "-";
        if(!roomGroups[roomNo]){
          roomGroups[roomNo] = {
            roomNo: roomNo,
            students: 0,
            rolls: [],
            studentRows: []
          };
        }
        roomGroups[roomNo].students += Number(segment.studentCount || 0);
        roomGroups[roomNo].rolls = roomGroups[roomNo].rolls.concat(segment.students || []);
        roomGroups[roomNo].studentRows.push(segment);
      });
      var roomNos = Object.keys(roomGroups).sort(function(a, b){
        return normalize(a).localeCompare(normalize(b), undefined, { numeric: true, sensitivity: "base" });
      });
      body.innerHTML = roomNos.map(function(roomNo){
        var group = roomGroups[roomNo];
        var masterRow = '<tr class="room-master-row" data-room-summary="' + esc(roomNo) + '"><td colspan="4">Room ' + esc(roomNo) + ' | Total Students: ' + esc(group.students) + '</td><td><div class="invig-teacher-list" data-room-teacher-list="' + esc(roomNo) + '"></div><button type="button" class="secondary-btn" data-room-teacher-add="' + esc(roomNo) + '">Add Teacher</button></td></tr>';
        var classRows = group.studentRows.map(function(item){
          return '<tr class="room-class-row"><td></td><td>' + esc(item.className + " (" + item.subject + ")") + '</td><td>' + esc(item.studentCount) + '</td><td>' + esc(item.rollRange || "-") + '</td><td></td></tr>';
        }).join("");
        return masterRow + classRows;
      }).join("");

      roomNos.forEach(function(roomNo){
        var values = Array.isArray(teacherMap[roomNo]) && teacherMap[roomNo].length ? teacherMap[roomNo] : [""];
        renderInvigilationTeacherInputs(roomNo, values);
      });
      Array.from(document.querySelectorAll("[data-room-teacher-add]")).forEach(function(btn){
        btn.onclick = function(){
          var roomNo = normalize(this.getAttribute("data-room-teacher-add"));
          var current = collectInvigilationTeacherMap();
          var list = Array.isArray(current[roomNo]) ? current[roomNo].slice() : [];
          list.push("");
          renderInvigilationTeacherInputs(roomNo, list);
        };
      });

      seatHost.innerHTML = "";
      var remainingByClass = buildTeacherRemainingStudents(dutyState.teacherSeating.classStudentsMap);
      roomNos.forEach(function(roomNo){
        var room = dutyState.teacherSeating.rooms.find(function(item){
          return normalize(item.room_no) === normalize(roomNo);
        });
        if(!room) return;
        var laneState = buildLaneSegmentsForRoom(room.room_no, assignmentRows, remainingByClass);
        var result = buildSeatMatrixFromRoom(room, { laneA: laneState.laneA, laneB: laneState.laneB });
        var summaryLines = roomGroups[roomNo].studentRows.map(function(item){
          return "Class: " + item.className + " | Students: " + item.studentCount + " | Subject: " + item.subject;
        }).join("\n");
        var summary = "Room: " + roomNo + " | Total: " + roomGroups[roomNo].students + " | Date: " + normalize(plan.exam_date) + "\n" + summaryLines;
        seatHost.appendChild(renderSeatPlanRoom(room, result.grid, result.used, summary));
      });
      if(!seatHost.innerHTML){
        seatHost.innerHTML = '<div class="helper">No room preview available.</div>';
      }
      statusEl.textContent = "Selected plan: " + normalize(plan.exam_date || "-") + " (" + normalize(plan.exam_name || "-") + "). " + roomNos.length + " rooms loaded for invigilation allocation.";
      seatStatus.textContent = "Room-wise seating plan loaded successfully.";
    }catch(e){
      dutyState.invigilation.currentPlan = null;
      body.innerHTML = '<tr><td colspan="5">Unable to load invigilation summary.</td></tr>';
      seatHost.innerHTML = '<div class="helper">Unable to load room-wise seating plan.</div>';
      statusEl.textContent = e.message || "Unable to load invigilation summary.";
      seatStatus.textContent = e.message || "Unable to load room-wise seating plan.";
    }
  }

  async function loadTeacherInvigilationSummary(row){
    var body = document.getElementById("teacherInvigilationRoomBody");
    var statusEl = document.getElementById("teacherInvigilationStatus");
    var seatHost = document.getElementById("teacherInvigilationSeatHost");
    var seatStatus = document.getElementById("teacherInvigilationSeatStatus");
    var planSelect = document.getElementById("teacherInvigilationPlanSelect");
    if(!body || !statusEl || !seatHost || !seatStatus || !planSelect) return;
    body.innerHTML = '<tr><td colspan="5">Loading room-wise invigilation summary...</td></tr>';
    seatHost.innerHTML = '<div class="helper">Loading room-wise seating plan...</div>';
    statusEl.textContent = "";
    seatStatus.textContent = "";
    planSelect.innerHTML = '<option value="">Loading saved seating plans...</option>';
    dutyState.invigilation.dutyRow = row || null;

    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var examName = normalize((row && row.exam_name) || (document.getElementById("teacherDutyExam") || {}).value);
    var examDate = normalize((row && row.duty_date) || (document.getElementById("teacherDutyDate") || {}).value);
    if(!session){
      body.innerHTML = '<tr><td colspan="5">Exam session is missing.</td></tr>';
      seatHost.innerHTML = '<div class="helper">Exam session is missing.</div>';
      statusEl.textContent = "Invigilation summary needs session.";
      planSelect.innerHTML = '<option value="">Select saved seating plan</option>';
      return;
    }

    try{
      var url = EXAM_API + "/seating-plan/list?session=" + encodeURIComponent(session);
      if(examName){
        url += "&exam_name=" + encodeURIComponent(examName);
      }
      var data = await fetchJson(url);
      var plans = Array.isArray(data.plans) ? data.plans : [];
      if(!plans.length){
        dutyState.invigilation.savedPlans = [];
        planSelect.innerHTML = '<option value="">No saved seating plans found</option>';
        body.innerHTML = '<tr><td colspan="5">No saved seating plan found.</td></tr>';
        seatHost.innerHTML = '<div class="helper">No saved seating plan found.</div>';
        statusEl.textContent = "No seating plan found for this invigilation duty.";
        return;
      }
      dutyState.invigilation.savedPlans = plans.slice().sort(function(a, b){
        var dateCmp = normalize(a.exam_date).localeCompare(normalize(b.exam_date));
        if(dateCmp !== 0) return dateCmp;
        return normalize(a.exam_name).localeCompare(normalize(b.exam_name));
      });
      planSelect.innerHTML = '<option value="">Select saved seating plan</option>' + dutyState.invigilation.savedPlans.map(function(plan){
        return '<option value="' + esc(plan.id || "") + '">' + esc((plan.exam_date || "-") + " (" + (plan.exam_name || "-") + ")") + '</option>';
      }).join("");
      var preferredPlan = dutyState.invigilation.savedPlans.find(function(plan){
        return normalize(plan.exam_name) === examName && normalize(plan.exam_date) === examDate;
      }) || dutyState.invigilation.savedPlans[0] || null;
      if(preferredPlan){
        planSelect.value = preferredPlan.id || "";
      }
      planSelect.onchange = function(){
        var selectedPlan = dutyState.invigilation.savedPlans.find(function(item){
          return String(item.id || "") === String(planSelect.value || "");
        }) || null;
        renderTeacherInvigilationSummaryFromPlan(selectedPlan, row);
      };
      await renderTeacherInvigilationSummaryFromPlan(preferredPlan, row);
    }catch(e){
      dutyState.invigilation.savedPlans = [];
      planSelect.innerHTML = '<option value="">Unable to load saved seating plans</option>';
      body.innerHTML = '<tr><td colspan="5">Unable to load invigilation summary.</td></tr>';
      seatHost.innerHTML = '<div class="helper">Unable to load room-wise seating plan.</div>';
      statusEl.textContent = e.message || "Unable to load invigilation summary.";
      seatStatus.textContent = e.message || "Unable to load room-wise seating plan.";
    }
  }

  async function renderTeacherInvigilationReadonlyFromPlan(plan, row, focusRoom){
    var body = document.getElementById("teacherInvigilationRoomBody");
    var statusEl = document.getElementById("teacherInvigilationStatus");
    var seatHost = document.getElementById("teacherInvigilationSeatHost");
    var seatStatus = document.getElementById("teacherInvigilationSeatStatus");
    if(!body || !statusEl || !seatHost || !seatStatus) return;
    if(!plan){
      body.innerHTML = '<tr><td colspan="5">No seating plan found for this examiner duty.</td></tr>';
      seatHost.innerHTML = '<div class="helper">No seating plan available.</div>';
      statusEl.textContent = "No seating plan found.";
      seatStatus.textContent = "";
      return;
    }

    try{
      dutyState.invigilation.currentPlan = plan;
      var aliasInfo = await resolveTeacherAliases();
      var session = aliasInfo.session || await resolveLatestSession();
      await loadTeacherInvigilationTeacherOptions(session);
      var roomData = await fetchJson(EXAM_API + "/rooms/list?session=" + encodeURIComponent(session || ""));
      dutyState.teacherSeating.rooms = Array.isArray(roomData.rooms) ? roomData.rooms.slice() : [];
      var selectedClasses = Array.isArray(plan.selected_classes) && plan.selected_classes.length ? plan.selected_classes.slice() : Array.from(new Set((plan.assignment_rows || []).map(function(item){
        return normalize(item.className || item.class_name);
      }).filter(Boolean)));
      await loadTeacherSeatingStudents(session, selectedClasses);

      var assignmentRows = Array.isArray(plan.assignment_rows) ? plan.assignment_rows.map(function(item){
        return {
          className: normalize(item.className || item.class_name),
          subject: normalize(item.subject) || "-",
          studentCount: Number(item.studentCount || item.student_count || 0),
          roomNo: normalize(item.roomNo || item.room_no)
        };
      }).filter(function(item){
        return item.className && item.roomNo && Number(item.studentCount || 0) > 0;
      }) : [];
      dutyState.teacherSeating.assignmentRows = assignmentRows.slice();
      var teacherMap = parseInvigilationTeacherMap((row && row.description) || "");
      var segments = buildTeacherAssignmentSegments(assignmentRows, dutyState.teacherSeating.classStudentsMap);
      var roomGroups = {};
      segments.forEach(function(segment){
        var roomNo = normalize(segment.roomNo) || "-";
        if(!roomGroups[roomNo]){
          roomGroups[roomNo] = { roomNo: roomNo, students: 0, studentRows: [] };
        }
        roomGroups[roomNo].students += Number(segment.studentCount || 0);
        roomGroups[roomNo].studentRows.push(segment);
      });
      var roomNos = Object.keys(roomGroups).sort(function(a, b){
        return normalize(a).localeCompare(normalize(b), undefined, { numeric: true, sensitivity: "base" });
      });
      if(focusRoom){
        roomNos = roomNos.filter(function(roomNo){ return normalize(roomNo) === normalize(focusRoom); });
      }
      if(!roomNos.length){
        body.innerHTML = '<tr><td colspan="5">No room-wise assignment found for this examiner duty.</td></tr>';
        seatHost.innerHTML = '<div class="helper">No room-wise seating plan found.</div>';
        statusEl.textContent = "No matching room found.";
        seatStatus.textContent = "";
        return;
      }

      body.innerHTML = roomNos.map(function(roomNo){
        var group = roomGroups[roomNo];
        var teachers = Array.isArray(teacherMap[roomNo]) ? teacherMap[roomNo].map(getInvigilationTeacherLabel).filter(Boolean) : [];
        var teacherText = teachers.length ? teachers.join(", ") : "No teacher assigned";
        var masterRow = '<tr class="room-master-row"><td colspan="4">Room ' + esc(roomNo) + ' | Total Students: ' + esc(group.students) + '</td><td>' + esc(teacherText) + '</td></tr>';
        var classRows = group.studentRows.map(function(item){
          return '<tr class="room-class-row"><td></td><td>' + esc(item.className + " (" + item.subject + ")") + '</td><td>' + esc(item.studentCount) + '</td><td>' + esc(item.rollRange || "-") + '</td><td></td></tr>';
        }).join("");
        return masterRow + classRows;
      }).join("");

      seatHost.innerHTML = "";
      var remainingByClass = buildTeacherRemainingStudents(dutyState.teacherSeating.classStudentsMap);
      roomNos.forEach(function(roomNo){
        var room = dutyState.teacherSeating.rooms.find(function(item){
          return normalize(item.room_no) === normalize(roomNo);
        });
        if(!room) return;
        var laneState = buildLaneSegmentsForRoom(room.room_no, assignmentRows, remainingByClass);
        var result = buildSeatMatrixFromRoom(room, { laneA: laneState.laneA, laneB: laneState.laneB });
        var summaryLines = roomGroups[roomNo].studentRows.map(function(item){
          return "Class: " + item.className + " | Students: " + item.studentCount + " | Subject: " + item.subject;
        }).join("\n");
        var summary = "Room: " + roomNo + " | Total: " + roomGroups[roomNo].students + " | Date: " + normalize(plan.exam_date) + "\n" + summaryLines;
        seatHost.appendChild(renderSeatPlanRoom(room, result.grid, result.used, summary));
      });
      statusEl.textContent = "Read-only seating plan for " + (focusRoom ? ("Room " + focusRoom + ". ") : "") + "Exam: " + normalize(plan.exam_name || "-") + " | Date: " + normalize(plan.exam_date || "-");
      seatStatus.textContent = "This is a read-only copy of the examiner duty seating plan.";
    }catch(e){
      body.innerHTML = '<tr><td colspan="5">Unable to load examiner duty view.</td></tr>';
      seatHost.innerHTML = '<div class="helper">Unable to load room-wise seating plan.</div>';
      statusEl.textContent = e.message || "Unable to load examiner duty view.";
      seatStatus.textContent = e.message || "Unable to load room-wise seating plan.";
    }
  }

  async function initTeacherInvigilationReadonlyPage(){
    await loadActivities();
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var teacherName = aliasInfo.teacherName || getTeacherName();
    var params = new URLSearchParams(location.search || "");
    var dutyId = normalize(params.get("duty_id"));
    var sourceDutyId = normalize(params.get("source_duty_id"));
    var focusRoom = normalize(params.get("room"));
    setText("teacherFillTitle", "Examiner Duty Read-only Copy");
    setText("teacherFillSubtitle", "This page shows the saved room-wise seating plan and assigned examiner duty in read-only mode.");
    setText("teacherFillSession", session || "Session not selected");
    setText("teacherFillTeacherName", teacherName || "Teacher");
    setText("teacherFillTeacherId", (Array.isArray(aliasInfo.ids) && aliasInfo.ids[0]) || getTeacherId() || "-");

    try{
      var dutyData = await fetchJson(
        EXAM_API + "/teacher-duty/list?session=" + encodeURIComponent(session) + "&activity_key=invigilation_duties"
      );
      var rows = Array.isArray(dutyData.duties) ? dutyData.duties : [];
      var row = rows.find(function(item){ return normalize(item.id) === dutyId || normalize(item.id) === sourceDutyId; }) || rows[0] || null;
      if(!row){
        setText("teacherFillCount", "0");
        setStatus("teacherInvigilationStatus", "No invigilation duty found.", true);
        return;
      }
      setText("teacherFillCount", "1");
      var planUrl = EXAM_API + "/seating-plan/list?session=" + encodeURIComponent(session);
      if(normalize(row.exam_name)){
        planUrl += "&exam_name=" + encodeURIComponent(normalize(row.exam_name));
      }
      var planData = await fetchJson(planUrl);
      var plans = Array.isArray(planData.plans) ? planData.plans : [];
      var plan = plans.find(function(item){
        return normalize(item.exam_name) === normalize(row.exam_name) && normalize(item.exam_date) === normalize(row.duty_date);
      }) || plans[0] || null;
      await renderTeacherInvigilationReadonlyFromPlan(plan, row, focusRoom);
    }catch(e){
      setStatus("teacherInvigilationStatus", e.message || "Unable to load examiner duty read-only copy.", true);
    }
  }

  function renderTeacherAttendanceSummaryFromPlan(plan){
    var body = document.getElementById("teacherAttendanceBody");
    var statusEl = document.getElementById("teacherAttendanceStatus");
    if(!body || !statusEl) return;
    if(!plan){
      dutyState.attendance.currentPlan = null;
      body.innerHTML = '<tr><td colspan="5">Select a saved seating plan to view room-wise attendance summary.</td></tr>';
      statusEl.textContent = "Choose a saved seating plan first.";
      return;
    }
    dutyState.attendance.currentPlan = plan;
    var rows = Array.isArray(plan.assignment_rows) ? plan.assignment_rows.slice() : [];
    rows.sort(function(a, b){
      var roomCmp = normalize(a.roomNo || a.room_no).localeCompare(normalize(b.roomNo || b.room_no), undefined, { numeric: true, sensitivity: "base" });
      if(roomCmp !== 0) return roomCmp;
      return normalize(a.className || a.class_name).localeCompare(normalize(b.className || b.class_name), undefined, { numeric: true, sensitivity: "base" });
    });
    if(!rows.length){
      body.innerHTML = '<tr><td colspan="5">Saved seating plan has no assignment rows.</td></tr>';
      statusEl.textContent = "Saved seating plan has no assignment rows.";
      return;
    }
    var roomTotals = {};
    rows.forEach(function(item){
      var roomNo = normalize(item.roomNo || item.room_no) || "-";
      roomTotals[roomNo] = (roomTotals[roomNo] || 0) + Number(item.studentCount || item.student_count || 0);
    });
    var groupedRows = {};
    rows.forEach(function(item){
      var roomNo = normalize(item.roomNo || item.room_no) || "-";
      if(!groupedRows[roomNo]) groupedRows[roomNo] = [];
      groupedRows[roomNo].push(item);
    });
    body.innerHTML = Object.keys(groupedRows).sort(function(a, b){
      return normalize(a).localeCompare(normalize(b), undefined, { numeric: true, sensitivity: "base" });
    }).map(function(roomNo){
      var roomHeader = '<tr class="room-group-row"><td colspan="5">Room ' + esc(roomNo) + '<span class="room-group-total">' + esc(roomTotals[roomNo] + " students total") + '</span></td></tr>';
      var roomRows = groupedRows[roomNo].map(function(item){
        var className = normalize(item.className || item.class_name) || "-";
        var subject = normalize(item.subject) || "-";
        var count = Number(item.studentCount || item.student_count || 0);
        var students = Array.isArray(item.students) ? item.students : [];
        var rollRange = students.length ? formatTeacherRollRange(students) : "-";
        return '<tr><td>' + esc(roomNo) + '</td><td>' + esc(className) + '</td><td>' + esc(subject) + '</td><td>' + esc(count) + '</td><td>' + esc(rollRange) + '</td></tr>';
      }).join("");
      return roomHeader + roomRows;
    }).join("");
    statusEl.textContent = "Selected plan: " + normalize(plan.exam_date || "-") + " (" + normalize(plan.exam_name || "-") + ").";
  }

  function parseAttendanceRecordMap(text){
    var marker = "__ATTENDANCE_JSON__:";
    var raw = String(text || "");
    var index = raw.indexOf(marker);
    if(index === -1) return {};
    try{
      return JSON.parse(decodeURIComponent(raw.slice(index + marker.length))) || {};
    }catch(_e){
      return {};
    }
  }

  function buildAttendanceRecordDescription(recordMap){
    var total = Object.keys(recordMap || {}).length;
    return [
      "Attendance Records: " + total,
      "__ATTENDANCE_JSON__:" + encodeURIComponent(JSON.stringify(recordMap || {}))
    ].join("\n");
  }

  function collectTeacherAttendanceSelections(){
    var map = {};
    Array.from(document.querySelectorAll(".teacher-attendance-select")).forEach(function(select){
      var key = normalize(select.getAttribute("data-attendance-key"));
      if(!key) return;
      map[key] = normalize(select.value) || "P";
    });
    return map;
  }

  function renderTeacherAttendanceFill(plan, recordMap){
    var host = document.getElementById("teacherAttendanceFillHost");
    var statusEl = document.getElementById("teacherAttendanceFillStatus");
    if(!host || !statusEl) return;
    if(!plan){
      host.innerHTML = '<div class="helper">Select a saved seating plan to fill attendance.</div>';
      statusEl.textContent = "";
      return;
    }
    var grouped = {};
    (plan.assignment_rows || []).forEach(function(item){
      var roomNo = normalize(item.roomNo || item.room_no) || "-";
      if(!grouped[roomNo]) grouped[roomNo] = [];
      grouped[roomNo].push(item);
    });
    host.innerHTML = Object.keys(grouped).sort(function(a, b){
      return normalize(a).localeCompare(normalize(b), undefined, { numeric: true, sensitivity: "base" });
    }).map(function(roomNo){
      var roomRows = grouped[roomNo].map(function(item){
        var studentRows = (item.students || []).map(function(student, idx){
          var examRoll = getTeacherStudentDisplayRoll(student);
          var attendanceKey = roomNo + "||" + normalize(item.className) + "||" + normalize(examRoll || student.roll || idx + 1);
          var selected = normalize((recordMap || {})[attendanceKey]) || "P";
          return '<tr><td>' + (idx + 1) + '</td><td>' + esc(student.name || "-") + '</td><td>' + esc(student.roll || "-") + '</td><td>' + esc(examRoll || "-") + '</td><td>' + esc(item.className || "-") + '</td><td><select class="teacher-attendance-select" data-attendance-key="' + esc(attendanceKey) + '"><option value="P"' + (selected === "P" ? " selected" : "") + '>P</option><option value="A"' + (selected === "A" ? " selected" : "") + '>A</option><option value="L"' + (selected === "L" ? " selected" : "") + '>L</option></select></td></tr>';
        }).join("");
        return '<div class="table-wrap" style="margin-bottom:14px;"><h3 style="margin:10px 0 6px;">Room ' + esc(roomNo) + ' | ' + esc(item.className || "-") + ' | ' + esc(item.subject || "-") + '</h3><table><thead><tr><th>S.No.</th><th>Student Name</th><th>Roll No</th><th>Exam Roll No</th><th>Class</th><th>Present</th></tr></thead><tbody>' + studentRows + '</tbody></table></div>';
      }).join("");
      return '<div class="room-card"><div class="room-title">Room ' + esc(roomNo) + '</div>' + roomRows + '</div>';
    }).join("");
    statusEl.textContent = "Attendance entry ready for selected seating plan.";
  }

  async function loadTeacherAttendanceTools(row){
    var body = document.getElementById("teacherAttendanceBody");
    var statusEl = document.getElementById("teacherAttendanceStatus");
    var planSelect = document.getElementById("teacherAttendancePlanSelect");
    if(!body || !statusEl || !planSelect) return;
    body.innerHTML = '<tr><td colspan="5">Loading attendance sheet data...</td></tr>';
    statusEl.textContent = "";
    planSelect.innerHTML = '<option value="">Loading saved seating plans...</option>';
    dutyState.attendance.dutyRow = row || null;
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var examName = normalize((row && row.exam_name) || (document.getElementById("teacherDutyExam") || {}).value);
    var examDate = normalize((row && row.duty_date) || (document.getElementById("teacherDutyDate") || {}).value);
    if(!session){
      body.innerHTML = '<tr><td colspan="5">Session is missing.</td></tr>';
      statusEl.textContent = "Attendance sheet needs session.";
      planSelect.innerHTML = '<option value="">Select saved seating plan</option>';
      return;
    }
    try{
      var url = EXAM_API + "/seating-plan/list?session=" + encodeURIComponent(session);
      if(examName){
        url += "&exam_name=" + encodeURIComponent(examName);
      }
      var data = await fetchJson(url);
      var plans = Array.isArray(data.plans) ? data.plans : [];
      if(!plans.length){
        dutyState.attendance.savedPlans = [];
        planSelect.innerHTML = '<option value="">No saved seating plans found</option>';
        body.innerHTML = '<tr><td colspan="5">No saved seating plan found.</td></tr>';
        statusEl.textContent = "No seating plan found for attendance sheet.";
        return;
      }
      dutyState.attendance.savedPlans = plans.slice().sort(function(a, b){
        var dateCmp = normalize(a.exam_date).localeCompare(normalize(b.exam_date));
        if(dateCmp !== 0) return dateCmp;
        return normalize(a.exam_name).localeCompare(normalize(b.exam_name));
      });
      planSelect.innerHTML = '<option value="">Select saved seating plan</option>' + dutyState.attendance.savedPlans.map(function(plan){
        return '<option value="' + esc(plan.id || "") + '">' + esc((plan.exam_date || "-") + " (" + (plan.exam_name || "-") + ")") + '</option>';
      }).join("");
      var preferredPlan = dutyState.attendance.savedPlans.find(function(plan){
        return normalize(plan.exam_name) === examName && normalize(plan.exam_date) === examDate;
      }) || dutyState.attendance.savedPlans[0] || null;
      if(preferredPlan){
        planSelect.value = preferredPlan.id || "";
      }
      planSelect.onchange = async function(){
        var selectedPlan = dutyState.attendance.savedPlans.find(function(item){
          return String(item.id || "") === String(planSelect.value || "");
        }) || null;
        await prepareTeacherAttendancePlan(selectedPlan);
      };
      await prepareTeacherAttendancePlan(preferredPlan);
    }catch(e){
      dutyState.attendance.savedPlans = [];
      planSelect.innerHTML = '<option value="">Unable to load saved seating plans</option>';
      body.innerHTML = '<tr><td colspan="5">Unable to load attendance sheet data.</td></tr>';
      statusEl.textContent = e.message || "Unable to load attendance sheet data.";
    }
  }

  async function prepareTeacherAttendancePlan(plan){
    if(!plan){
      renderTeacherAttendanceSummaryFromPlan(null);
      renderTeacherAttendanceFill(null, {});
      return;
    }
    var session = await resolveLatestSession();
    var selectedClasses = Array.isArray(plan.selected_classes) && plan.selected_classes.length ? plan.selected_classes.slice() : Array.from(new Set((plan.assignment_rows || []).map(function(item){
      return normalize(item.className || item.class_name);
    }).filter(Boolean)));
    await loadTeacherSeatingStudents(session, selectedClasses);
    var assignmentRows = Array.isArray(plan.assignment_rows) ? plan.assignment_rows.map(function(item){
      return {
        className: normalize(item.className || item.class_name),
        subject: normalize(item.subject) || "-",
        studentCount: Number(item.studentCount || item.student_count || 0),
        roomNo: normalize(item.roomNo || item.room_no)
      };
    }).filter(function(item){
      return item.className && item.roomNo && Number(item.studentCount || 0) > 0;
    }) : [];
    var segments = buildTeacherAssignmentSegments(assignmentRows, dutyState.teacherSeating.classStudentsMap);
    var preparedPlan = Object.assign({}, plan, { assignment_rows: segments });
    dutyState.attendance.currentPlan = preparedPlan;
    renderTeacherAttendanceSummaryFromPlan(preparedPlan);
    renderTeacherAttendanceFill(preparedPlan, parseAttendanceRecordMap((dutyState.attendance.dutyRow && dutyState.attendance.dutyRow.description) || ""));
  }

  function downloadTeacherAttendanceSheetPdf(){
    var plan = dutyState.attendance.currentPlan;
    var statusEl = document.getElementById("teacherAttendanceStatus");
    if(!plan){
      if(statusEl) statusEl.textContent = "Select a saved seating plan first.";
      return;
    }
    var grouped = {};
    (plan.assignment_rows || []).forEach(function(item){
      var roomNo = normalize(item.roomNo) || "-";
      if(!grouped[roomNo]) grouped[roomNo] = [];
      grouped[roomNo].push(item);
    });
    var roomHtml = Object.keys(grouped).sort(function(a, b){
      return normalize(a).localeCompare(normalize(b), undefined, { numeric: true, sensitivity: "base" });
    }).map(function(roomNo){
      var rows = grouped[roomNo];
      var roomTotal = rows.reduce(function(sum, item){ return sum + Number(item.studentCount || 0); }, 0);
      var tables = rows.map(function(item){
        var studentRows = (item.students || []).map(function(student, idx){
          var examRoll = getTeacherStudentDisplayRoll(student);
          return '<tr><td style="border:1px solid #000;padding:2px;height:14px;line-height:1;">' + (idx + 1) + '</td><td style="border:1px solid #000;padding:2px;height:14px;line-height:1;">' + esc(student.name || "-") + '</td><td style="border:1px solid #000;padding:2px;height:14px;line-height:1;">' + esc(student.roll || "-") + '</td><td style="border:1px solid #000;padding:2px;height:14px;line-height:1;">' + esc(examRoll || "-") + '</td><td style="border:1px solid #000;padding:2px;height:14px;line-height:1;">' + esc(item.className || "-") + '</td><td style="border:1px solid #000;padding:2px;height:14px;line-height:1;"></td><td style="border:1px solid #000;padding:2px;height:14px;line-height:1;"></td></tr>';
        }).join("");
        return '<h3 style="margin:6px 0 4px;font-size:11px;">' + esc(item.className || "-") + ' | ' + esc(item.subject || "-") + ' | ' + esc(item.studentCount || 0) + ' students</h3><table style="width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:5px;table-layout:fixed;"><thead><tr><th style="border:1px solid #000;padding:2px;height:16px;line-height:1;width:5%;">S.No.</th><th style="border:1px solid #000;padding:2px;height:16px;line-height:1;width:31%;">Student Name</th><th style="border:1px solid #000;padding:2px;height:16px;line-height:1;width:9%;">Roll No</th><th style="border:1px solid #000;padding:2px;height:16px;line-height:1;width:16%;">Exam Roll No</th><th style="border:1px solid #000;padding:2px;height:16px;line-height:1;width:7%;">Class</th><th style="border:1px solid #000;padding:2px;height:16px;line-height:1;width:11%;">Sheet No</th><th style="border:1px solid #000;padding:2px;height:16px;line-height:1;width:21%;">Signature</th></tr></thead><tbody>' + studentRows + '</tbody></table>';
      }).join("");
      return '<section class="attendance-room-page" style="page-break-after:always;"><h2 style="margin:0 0 4px;font-size:14px;">Room ' + esc(roomNo) + '</h2><div style="margin-bottom:4px;font-size:10px;line-height:1.1;">Exam: ' + esc(plan.exam_name || "-") + ' | Date: ' + esc(plan.exam_date || "-") + ' | Total Students: ' + esc(roomTotal) + '</div>' + tables + '</section>';
    }).join("");
    var win = window.open("", "_blank", "width=1100,height=900");
    if(!win) return;
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Attendance Sheet</title><style>@page{size:A4 portrait;margin:5mm}body{font-family:Arial,sans-serif;padding:0;color:#000;margin:0}h1{font-size:14px;margin:0 0 2px;line-height:1}h2{font-size:14px;line-height:1}h3{font-size:11px;line-height:1}table{font-size:8px;border-collapse:collapse;border:2px solid #000}th,td{text-align:left;vertical-align:middle;border:1px solid #000;padding:2px;height:16px;line-height:1;word-wrap:break-word}thead th{font-weight:700}.attendance-room-page{page-break-after:always;break-after:page;min-height:0}.sheet-header{margin-bottom:4px}.sheet-meta{margin-bottom:6px;font-size:10px;line-height:1}@media print{html,body{width:210mm;height:297mm}.attendance-room-page{transform:scale(.9);transform-origin:top left;width:111%}section:last-child{page-break-after:auto;break-after:auto}}</style></head><body><div class="sheet-header"><h1>Attendance Sheet</h1><div class="sheet-meta">Saved Seating Plan: ' + esc(plan.exam_date || "-") + ' (' + esc(plan.exam_name || "-") + ')</div></div>' + roomHtml + '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(function(){ win.print(); }, 300);
  }

  async function loadTeacherResultCheckingSheet(row){
    var head = document.getElementById("teacherResultHead");
    var body = document.getElementById("teacherResultBody");
    var statusEl = document.getElementById("teacherResultStatus");
    var summaryEl = document.getElementById("teacherResultSummary");
    if(!head || !body || !statusEl || !summaryEl) return;
    head.innerHTML = '<tr><th>Roll</th><th>Name</th></tr>';
    body.innerHTML = '<tr><td colspan="2">Loading result sheet...</td></tr>';
    statusEl.textContent = "";
    summaryEl.innerHTML = "";

    var session = await resolveLatestSession();
    var examName = normalize((row && row.exam_name) || (document.getElementById("teacherDutyExam") || {}).value);
    var className = normalize((row && row.room_no) || (document.getElementById("teacherAssignedClass") || {}).value || (document.getElementById("teacherDutyRoom") || {}).value);
    if(!session || !examName || !className){
      body.innerHTML = '<tr><td colspan="2">Exam or assigned class is missing.</td></tr>';
      statusEl.textContent = "Result sheet needs session, exam, and assigned class.";
      return;
    }

    try{
      var examListData = await fetchJson(EXAM_API + "/exam/list-all");
      var examRows = Array.isArray(examListData.exams) ? examListData.exams : [];
      dutyState.resultChecking.examRows = examRows.slice();
      var examData = examRows.find(function(item){
        return normalize(item.session) === session && normalize(item.exam_name) === examName;
      }) || examRows.find(function(item){
        return normalize(item.exam_name) === examName;
      }) || null;
      if(!examData){
        body.innerHTML = '<tr><td colspan="2">Exam configuration not found.</td></tr>';
        statusEl.textContent = "Exam configuration not found.";
        return;
      }

      var studentRes = await fetch(STUDENT_API + "/students?session=" + encodeURIComponent(session));
      var studentData = await studentRes.json().catch(function(){ return []; });
      var students = (Array.isArray(studentData) ? studentData : (Array.isArray(studentData.students) ? studentData.students : [])).filter(function(item){
        return normalize(item.class_name || item.class) === className;
      }).sort(function(a, b){
        return (parseInt(a.rollno || a.roll || 0, 10) || 0) - (parseInt(b.rollno || b.roll || 0, 10) || 0);
      });

      var subRes = await fetchJson(EXAM_API + "/exam/subjects/get?session=" + encodeURIComponent(session) + "&class_name=" + encodeURIComponent(className));
      var configuredSubjects = Array.isArray(subRes.subjects) ? subRes.subjects : [];

      var marksRes = await fetchJson(EXAM_API + "/exam/get-marks?session=" + encodeURIComponent(session) + "&class_name=" + encodeURIComponent(className) + "&exam_name=" + encodeURIComponent(examName));
      var marksMap = {};
      var externalSubjects = [];
      (Array.isArray(marksRes.marks) ? marksRes.marks : []).forEach(function(item){
        var roll = String(item.roll || "").trim();
        if(!marksMap[roll]) marksMap[roll] = {};
        marksMap[roll][normalize(item.subject)] = Number(item.marks || 0);
        externalSubjects.push(normalize(item.subject));
      });

      var allowInternal = !(
        examData.internal_marks === false ||
        examData.internal_marks === "false" ||
        examData.internal_marks === "no" ||
        examData.internal_marks === "No" ||
        examData.internal_marks === 0
      );
      var internalSubjects = [];
      if(allowInternal){
        try{
          var internalSubjectRes = await fetchJson(
            EXAM_API + "/internal-marks/subjects?session=" + encodeURIComponent(session) +
            "&class_name=" + encodeURIComponent(className) +
            "&exam_name=" + encodeURIComponent(examName)
          );
          internalSubjects = Array.isArray(internalSubjectRes.subjects) ? internalSubjectRes.subjects.map(normalize).filter(Boolean) : [];
        }catch(_e){
          internalSubjects = [];
        }
      }
      var subjects = Array.from(new Set(
        configuredSubjects.concat(externalSubjects).concat(internalSubjects).map(normalize).filter(Boolean)
      ));
      var internalBySubject = {};
      if(allowInternal){
        for(var i = 0; i < subjects.length; i++){
          try{
            var internalRes = await fetchJson(
              EXAM_API + "/internal-marks/list?session=" + encodeURIComponent(session) +
              "&class_name=" + encodeURIComponent(className) +
              "&subject=" + encodeURIComponent(subjects[i]) +
              "&exam_name=" + encodeURIComponent(examName)
            );
            var internalMap = {};
            (Array.isArray(internalRes.marks) ? internalRes.marks : []).forEach(function(item){
              internalMap[String(item.student_id)] = Number(item.marks || 0);
            });
            internalBySubject[subjects[i]] = internalMap;
          }catch(_e){
            internalBySubject[subjects[i]] = {};
          }
        }
      }

      var headerHtml = '<tr><th>Roll</th><th>Name</th>';
      subjects.forEach(function(subject){
        headerHtml += '<th>' + esc(subject) + ' Ext</th><th>' + esc(subject) + ' Int</th>';
      });
      headerHtml += '<th>Ext Total</th><th>Int Total</th><th>Grand Total</th><th>Percent</th></tr>';
      head.innerHTML = headerHtml;

      var totalMarks = parseFloat(examData.total_marks || 100) || 100;
      body.innerHTML = students.length ? students.map(function(student){
        var roll = String(student.rollno != null ? student.rollno : (student.roll != null ? student.roll : "")).trim();
        var sid = getTeacherStudentId(student);
        var extTotal = 0;
        var intTotal = 0;
        var cells = '<td>' + esc(roll) + '</td><td>' + esc(student.student_name || student.name || "-") + '</td>';
        subjects.forEach(function(subject){
          var ext = Number((marksMap[roll] || {})[normalize(subject)] || 0);
          var int = allowInternal ? Number(((internalBySubject[subject] || {})[sid] || 0)) : 0;
          extTotal += ext;
          intTotal += int;
          var extColor = ext < (totalMarks / 3) ? ' style="background:#ffcccc"' : "";
          cells += '<td' + extColor + '>' + esc(ext) + '</td><td>' + esc(allowInternal ? int : "-") + '</td>';
        });
        var grand = extTotal + intTotal;
        var maxMarks = subjects.length * totalMarks;
        var percent = maxMarks > 0 ? ((grand / maxMarks) * 100).toFixed(2) : "0.00";
        var rowColor = Number(percent) < 33 ? ' style="background:#ffcccc"' : "";
        return '<tr>' + cells + '<td>' + esc(extTotal) + '</td><td>' + esc(allowInternal ? intTotal : "-") + '</td><td>' + esc(grand) + '</td><td' + rowColor + '>' + esc(percent) + '</td></tr>';
      }).join("") : '<tr><td colspan="' + (subjects.length * 2 + 6) + '">No students found for assigned class.</td></tr>';

      summaryEl.innerHTML = [
        '<span class="result-pill">Class: ' + esc(className) + '</span>',
        '<span class="result-pill">Exam: ' + esc(examName) + '</span>',
        '<span class="result-pill">Students: ' + esc(students.length) + '</span>',
        '<span class="result-pill">Internal Marks: ' + esc(allowInternal ? "Yes" : "No") + '</span>'
      ].join("");
      statusEl.textContent = "Result sheet loaded for assigned class.";
    }catch(e){
      head.innerHTML = '<tr><th>Roll</th><th>Name</th></tr>';
      body.innerHTML = '<tr><td colspan="2">Unable to load result sheet.</td></tr>';
      statusEl.textContent = e.message || "Unable to load result sheet.";
      summaryEl.innerHTML = "";
    }
  }

  async function saveTeacherDutyDetails(){
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var dutyId = normalize(document.getElementById("teacherDutyId").value);
    var activityKey = normalize(document.body.dataset.activityKey);
    var title = normalize(document.getElementById("teacherDutyTitle").value);
    var examName = normalize(document.getElementById("teacherDutyExam").value);
    var dutyDate = normalize(document.getElementById("teacherDutyDate").value);
    var dueDate = normalize(document.getElementById("teacherDutyDueDate").value);
    var roomNo = normalize(document.getElementById("teacherDutyRoom").value);
    var status = normalize(document.getElementById("teacherDutyStatusSelect").value) || "in_progress";
    var description = normalize(document.getElementById("teacherDutyDescription").value);
    var teacherId = normalize(document.getElementById("teacherDutyTeacherId").value) || (Array.isArray(aliasInfo.ids) && aliasInfo.ids.length ? aliasInfo.ids[0] : getTeacherId());
    var teacherName = aliasInfo.teacherName || getTeacherName();

    if(!session || !activityKey || !teacherId || !dutyId){
      return setStatus("teacherDutyFormStatus", "Duty record context is missing.", true);
    }
    if(!title){
      return setStatus("teacherDutyFormStatus", "Select one assigned duty first.", true);
    }
    if(activityKey === "invigilation_duties"){
      await saveInvigilationAssignmentsOnly(false);
      return;
    }else if(activityKey === "attendance_compilation"){
      var attendancePlan = dutyState.attendance.currentPlan;
      var attendanceMap = collectTeacherAttendanceSelections();
      roomNo = attendancePlan && Array.isArray(attendancePlan.assignment_rows)
        ? Array.from(new Set(attendancePlan.assignment_rows.map(function(item){ return normalize(item.roomNo || item.room_no); }).filter(Boolean))).join(", ")
        : roomNo;
      status = "completed";
      description = buildAttendanceRecordDescription(attendanceMap);
      if(document.getElementById("teacherDutyRoom")) document.getElementById("teacherDutyRoom").value = roomNo;
      if(document.getElementById("teacherDutyStatusSelect")) document.getElementById("teacherDutyStatusSelect").value = status;
      if(document.getElementById("teacherDutyDescription")) document.getElementById("teacherDutyDescription").value = description;
    }else if(activityKey === "result_file_checking"){
      status = "completed";
      description = [
        "Result sheet checked",
        examName ? "Exam: " + examName : "",
        roomNo ? "Class: " + roomNo : "",
        dueDate ? "Submission Date: " + dueDate : ""
      ].filter(Boolean).join(" | ");
      if(document.getElementById("teacherDutyStatusSelect")) document.getElementById("teacherDutyStatusSelect").value = status;
      if(document.getElementById("teacherDutyDescription")) document.getElementById("teacherDutyDescription").value = description;
    }

    try{
      var savedDuty = await fetchJson(EXAM_API + "/teacher-duty/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dutyId,
          session: session,
          activity_key: activityKey,
          activity_title: document.body.dataset.activityTitle || "",
          teacher_id: teacherId,
          teacher_name: teacherName,
          title: title,
          exam_name: examName,
          room_no: roomNo,
          duty_date: dutyDate,
          due_date: dueDate,
          description: description,
          status: status,
          assigned_by: "Teacher"
        })
      });
      if(activityKey === "invigilation_duties"){
        await syncInvigilationTeacherAssignments({
          id: dutyId,
          session: session,
          exam_name: examName,
          duty_date: dutyDate,
          due_date: dueDate,
          teacher_id: teacherId,
          teacher_name: teacherName,
          title: title,
          saved: savedDuty
        });
      }
      if(typeof window.refreshTeacherNotifications === "function"){
        try{
          await window.refreshTeacherNotifications();
        }catch(_e){}
      }
      setStatus("teacherDutyFormStatus", "Duty details saved successfully.", false);
      window.alert("Details saved successfully.");
      await initTeacherFillPage(true);
    }catch(e){
      setStatus("teacherDutyFormStatus", e.message || "Unable to save duty details.", true);
    }
  }

  async function initTeacherFillPage(skipStatusReset){
    await loadActivities();
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var teacherName = aliasInfo.teacherName || getTeacherName();
    var activityKey = document.body.dataset.activityKey || "";
    var activityTitle = document.body.dataset.activityTitle || "Teacher Duty";
    setText("teacherFillTitle", activityTitle);
    setText("teacherFillSubtitle", "Fill and update your assigned " + activityTitle.toLowerCase() + " details.");
    setText("teacherFillSession", session || "Session not selected");
    setText("teacherFillTeacherName", teacherName || "Teacher");
    setText("teacherFillTeacherId", (Array.isArray(aliasInfo.ids) && aliasInfo.ids[0]) || getTeacherId() || "-");
    if(!skipStatusReset){
      setStatus("teacherDutyFormStatus", "", false);
    }

    var rows = await loadTeacherDutyRows(aliasInfo, activityKey);
    dutyState.records = rows.slice();
    setText("teacherFillCount", String(rows.length));
    renderTeacherDutyAssignmentList(rows);

    if(!rows.length){
      setText("teacherDutyCurrentInfo", "No assignments available for this activity.");
      document.getElementById("teacherDutyForm").reset();
      document.getElementById("teacherDutyId").value = "";
      document.getElementById("teacherDutyTeacherId").value = "";
      var invBody = document.getElementById("teacherInvigilationRoomBody");
      var invHost = document.getElementById("teacherInvigilationSeatHost");
      if(invBody) invBody.innerHTML = '<tr><td colspan="5">No assigned duties found for this activity.</td></tr>';
      if(invHost) invHost.innerHTML = '<div class="helper">No assigned duties found for this activity.</div>';
      return;
    }

    var preferredId = normalize(sessionStorage.getItem("teacherDutySelectedId"));
    var selected = rows.find(function(item){ return item.id === preferredId; }) || rows[0];
    fillTeacherDutyForm(selected);
  }

  async function loadTeacherRoomList(session){
    var body = document.getElementById("teacherRoomBody");
    if(!body) return [];
    body.innerHTML = '<tr><td colspan="6">Loading rooms...</td></tr>';
    try{
      var data = await fetchJson(EXAM_API + "/rooms/list?session=" + encodeURIComponent(session || ""));
      var rows = Array.isArray(data.rooms) ? data.rooms : [];
      if(!rows.length){
        body.innerHTML = '<tr><td colspan="6">No rooms saved.</td></tr>';
        return [];
      }
      body.innerHTML = rows.map(function(row){
        var benchRows = getRoomBenchRows(row);
        var capacity = benchRows.reduce(function(sum, value){ return sum + value; }, 0) * Number(row.seats_per_bench || 0);
        return (
          "<tr>" +
            "<td>" + esc(row.room_no || "-") + "</td>" +
            "<td>" + esc(row.rows || "-") + "</td>" +
            "<td>" + esc(benchRows.join(", ") || "-") + "</td>" +
            "<td>" + esc(row.seats_per_bench || "-") + "</td>" +
            "<td>" + esc(capacity || 0) + "</td>" +
            "<td><button type='button' class='secondary-btn' onclick=\"applyTeacherRoomToForm('" + esc(row.room_no || "") + "','" + esc(row.rows || "") + "','" + esc(benchRows.join("|") || "") + "','" + esc(row.seats_per_bench || "") + "')\">Use</button></td>" +
          "</tr>"
        );
      }).join("");
      return rows;
    }catch(e){
      body.innerHTML = '<tr><td colspan="6">Unable to load rooms.</td></tr>';
      setStatus("teacherDutyFormStatus", e.message || "Unable to load rooms.", true);
      return [];
    }
  }

  async function saveTeacherRoomDetails(){
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var dutyId = normalize(document.getElementById("teacherDutyId").value);
    var activityKey = normalize(document.body.dataset.activityKey);
    var title = normalize(document.getElementById("teacherDutyTitle").value);
    var examName = normalize(document.getElementById("teacherDutyExam").value);
    var dutyDate = normalize(document.getElementById("teacherDutyDate").value);
    var dueDate = normalize(document.getElementById("teacherDutyDueDate").value);
    var roomNo = normalize(document.getElementById("teacherRoomNo").value);
    var rows = Number(document.getElementById("teacherRoomRows").value || 0);
    var benchRows = getTeacherBenchRowValues();
    var benchesPerRow = benchRows.length ? Math.max.apply(null, benchRows) : 0;
    var seatsPerBench = Number(document.getElementById("teacherSeatsPerBench").value || 0);
    var status = "completed";
    var notesEl = document.getElementById("teacherDutyDescription");
    var notes = notesEl ? normalize(notesEl.value) : "";
    var teacherId = normalize(document.getElementById("teacherDutyTeacherId").value) || (Array.isArray(aliasInfo.ids) && aliasInfo.ids.length ? aliasInfo.ids[0] : getTeacherId());
    var teacherName = aliasInfo.teacherName || getTeacherName();

    if(!session || !roomNo || rows <= 0 || benchRows.length !== rows || benchesPerRow <= 0 || seatsPerBench <= 0){
      return setStatus("teacherDutyFormStatus", "Fill room number, benches column, each bench row, and seats per bench.", true);
    }
    if(!dutyId || !activityKey || !title){
      return setStatus("teacherDutyFormStatus", "Select an assigned room-detail duty first.", true);
    }

    try{
      await fetchJson(EXAM_API + "/rooms/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: session,
          room_no: roomNo,
          rows: rows,
          benches_per_row: benchesPerRow,
          bench_rows: benchRows,
          seats_per_bench: seatsPerBench
        })
      });

      var capacity = benchRows.reduce(function(sum, value){ return sum + value; }, 0) * seatsPerBench;
      var description = [
        "Benches Column: " + rows,
        "Bench Rows: " + benchRows.join(", "),
        "Seats/Bench: " + seatsPerBench,
        "Capacity: " + capacity,
        notes ? "Notes: " + notes : ""
      ].filter(Boolean).join(" | ");

      await fetchJson(EXAM_API + "/teacher-duty/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dutyId,
          session: session,
          activity_key: activityKey,
          activity_title: document.body.dataset.activityTitle || "",
          teacher_id: teacherId,
          teacher_name: teacherName,
          title: title,
          exam_name: examName,
          room_no: roomNo,
          duty_date: dutyDate,
          due_date: dueDate,
          description: description,
          status: status,
          assigned_by: "Teacher"
        })
      });

      setStatus("teacherDutyFormStatus", "Room saved successfully.", false);
      await initTeacherRoomFillPage(true);
    }catch(e){
      setStatus("teacherDutyFormStatus", e.message || "Unable to save room.", true);
    }
  }

  async function initTeacherRoomFillPage(skipStatusReset){
    await loadActivities();
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var teacherName = aliasInfo.teacherName || getTeacherName();
    var activityKey = document.body.dataset.activityKey || "";
    var activityTitle = document.body.dataset.activityTitle || "Room Details Fill";
    setText("teacherFillTitle", activityTitle);
    setText("teacherFillSubtitle", "Fill room details with the same fields used on the admin room management page.");
    setText("teacherFillSession", session || "Session not selected");
    setText("teacherFillTeacherName", teacherName || "Teacher");
    setText("teacherFillTeacherId", (Array.isArray(aliasInfo.ids) && aliasInfo.ids[0]) || getTeacherId() || "-");
    if(!skipStatusReset){
      setStatus("teacherDutyFormStatus", "", false);
    }

    var dutyRows = await loadTeacherDutyRows(aliasInfo, activityKey);
    dutyState.records = dutyRows.slice();
    setText("teacherFillCount", String(dutyRows.length));
    await loadTeacherRoomList(session);

    if(!dutyRows.length){
      setText("teacherDutyCurrentInfo", "No room-detail assignments available for this activity.");
      document.getElementById("teacherRoomForm").reset();
      document.getElementById("teacherDutyId").value = "";
      document.getElementById("teacherDutyTeacherId").value = "";
      renderTeacherBenchRowInputs(0, []);
      document.getElementById("teacherSeatsPerBench").value = "2";
      return;
    }

    var preferredId = normalize(sessionStorage.getItem("teacherDutySelectedId"));
    var selected = dutyRows.find(function(item){ return item.id === preferredId; }) || dutyRows[0];
    fillTeacherRoomDutyForm(selected, session);
  }

  function seatingCapacity(room){
    var benchRows = getRoomBenchRows(room);
    var totalBenches = benchRows.reduce(function(sum, value){ return sum + value; }, 0);
    return totalBenches * Number(room && room.seats_per_bench || 0);
  }

  function computeExamRollNo(className, roll){
    var clsText = String(className || "");
    var clsNumMatch = clsText.match(/\d+/);
    var clsNum = clsNumMatch ? parseInt(clsNumMatch[0], 10) : 0;
    var secMatch = clsText.match(/\b([A-Z])\b/i);
    var secLetter = secMatch ? secMatch[1].toUpperCase() : "A";
    var secNum = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(secLetter) + 1 || 1;
    var r = String(roll || "").replace(/\D/g, "");
    var roll2 = r.padStart(2, "0").slice(-2);
    return String(clsNum || 0) + String(secNum) + roll2;
  }

  function classSortKey(name){
    var raw = normalize(name);
    var numMatch = raw.match(/\d+/);
    var num = numMatch ? parseInt(numMatch[0], 10) : 0;
    var rest = raw.replace(/\d+/g, "").replace(/class/gi, "").replace(/(st|nd|rd|th)/gi, "").trim();
    var upper = rest.toUpperCase();
    var streamOrder = { "ARTS": 1, "COMMERCE": 2, "MEDICAL": 3, "NONMEDICAL": 4, "SCIENCE": 5 };
    var streamRank = 99;
    Object.keys(streamOrder).forEach(function(key){
      if(upper.indexOf(key) !== -1) streamRank = Math.min(streamRank, streamOrder[key]);
    });
    var secMatch = upper.match(/\b([A-Z])\b/);
    var secRank = secMatch ? (secMatch[1].charCodeAt(0) - 64) : 99;
    return { num: num, streamRank: streamRank, secRank: secRank, label: upper };
  }

  function classSort(a, b){
    var ka = classSortKey(a);
    var kb = classSortKey(b);
    if(ka.num !== kb.num) return ka.num - kb.num;
    if(ka.streamRank !== kb.streamRank) return ka.streamRank - kb.streamRank;
    if(ka.secRank !== kb.secRank) return ka.secRank - kb.secRank;
    return ka.label.localeCompare(kb.label);
  }

  function sortRoomsByCapacity(rows){
    return rows.slice().sort(function(a, b){
      return seatingCapacity(a) - seatingCapacity(b);
    });
  }

  function benchCapacity(room){
    return getRoomBenchRows(room).reduce(function(sum, value){ return sum + Number(value || 0); }, 0);
  }

  function getTeacherRoomByNo(roomNo){
    return (dutyState.teacherSeating.rooms || []).find(function(room){
      return normalize(room.room_no) === normalize(roomNo);
    }) || null;
  }

  function getSelectedTeacherRooms(){
    var selected = ["teacherRoom1", "teacherRoom2"].map(function(id){
      var node = document.getElementById(id);
      return getTeacherRoomByNo(normalize(node && node.value));
    }).filter(Boolean);
    if(selected.length) return selected;
    return sortRoomsByCapacity(dutyState.teacherSeating.rooms || []).reverse().slice(0, 2);
  }

  function renderTeacherRoomSummary(){
    var el = document.getElementById("teacherRoomSummary");
    if(!el) return;
    var rooms = getSelectedTeacherRooms();
    if(!rooms.length){
      el.textContent = "No rooms selected.";
      return;
    }
    var total = rooms.reduce(function(sum, room){ return sum + seatingCapacity(room); }, 0);
    el.textContent = rooms.map(function(room, idx){
      return "Room " + (idx + 1) + ": " + normalize(room.room_no) + " (strength " + seatingCapacity(room) + ")";
    }).join(" | ") + " | Total strength: " + total;
  }

  function benchLetter(idx){
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if(idx < letters.length) return letters[idx];
    return letters[idx % letters.length] + letters[Math.floor(idx / letters.length) - 1];
  }

  function formatSeatCell(st){
    if(!st) return "-";
    var name = String(st.name || "").replace(/\s+/g, " ").trim().replace(/ (.+)/, "<br>$1");
    return '<div class="seat-box"><div class="seat-label">' + esc(st.exam_roll || st.roll || "-") + '</div><div style="text-align:center;font-weight:700;font-size:11px;">' + name + '</div><div style="text-align:center;color:#64748b;">' + esc(st.class_name || "-") + '</div></div>';
  }

  function getTeacherStudentDisplayRoll(student){
    if(!student) return "";
    if(!normalize(student.exam_roll) && normalize(student.class_name) && normalize(student.roll)){
      student.exam_roll = computeExamRollNo(student.class_name, student.roll);
    }
    return normalize(student.exam_roll || student.roll);
  }

  function formatTeacherRollRange(students){
    var rolls = (students || []).map(getTeacherStudentDisplayRoll).filter(Boolean);
    if(!rolls.length) return "-";
    return rolls.length === 1 ? rolls[0] : (rolls[0] + "-" + rolls[rolls.length - 1]);
  }

  function buildTeacherAssignmentSegments(assignmentRows, classStudentsMap){
    var remainingByClass = buildTeacherRemainingStudents(classStudentsMap);
    return (assignmentRows || []).map(function(row, idx){
      var cls = normalize(row.className);
      var count = Number(row.studentCount || 0);
      var source = remainingByClass[cls] || [];
      var students = source.splice(0, Math.max(0, count));
      remainingByClass[cls] = source;
      return {
        rowIndex: idx,
        className: cls,
        subject: normalize(row.subject) || "-",
        studentCount: students.length || count,
        roomNo: normalize(row.roomNo),
        students: students,
        rollRange: formatTeacherRollRange(students)
      };
    });
  }

  function buildSeatMatrixFromRoom(room, state){
    var benchRows = getRoomBenchRows(room);
    var columns = benchRows.length;
    var rows = columns ? Math.max.apply(null, benchRows) : 0;
    var seats = Number(room && room.seats_per_bench || 0);
    var grid = [];
    var used = [];
    var laneA = Array.isArray(state.laneA) ? state.laneA : [];
    var laneB = Array.isArray(state.laneB) ? state.laneB : [];
    var laneAQueueIndex = 0;
    var laneBQueueIndex = 0;

    function nextFromLane(lane, ref){
      while(ref.index < lane.length){
        var segment = lane[ref.index];
        if(segment && segment.list && segment.list.length){
          var student = segment.list.shift();
          if(student && !student.exam_roll){
            student.exam_roll = computeExamRollNo(student.class_name, student.roll);
          }
          return student || null;
        }
        ref.index += 1;
      }
      return null;
    }

    for(var r = 0; r < rows; r++){ grid.push([]); }
    for(var columnIndex = 0; columnIndex < columns; columnIndex++){
      var benchesInColumn = Number(benchRows[columnIndex] || 0);
      for(var rowIdx = 0; rowIdx < benchesInColumn; rowIdx++){
        var bench = [];
        var leftRef = { index: laneAQueueIndex };
        var left = nextFromLane(laneA, leftRef);
        laneAQueueIndex = leftRef.index;
        var right = null;
        if(seats >= 2){
          var rightRef = { index: laneBQueueIndex };
          right = nextFromLane(laneB, rightRef);
          laneBQueueIndex = rightRef.index;
        }
        bench.push(left || null);
        if(seats >= 2) bench.push(right || null);
        for(var s = 2; s < seats; s++){ bench.push(null); }
        if(left){
          if(!left.exam_roll) left.exam_roll = computeExamRollNo(left.class_name, left.roll);
          used.push(left);
        }
        if(right){
          if(!right.exam_roll) right.exam_roll = computeExamRollNo(right.class_name, right.roll);
          used.push(right);
        }
        grid[rowIdx][columnIndex] = bench;
      }
    }
    return { grid: grid, used: used };
  }

  function renderSeatPlanRoom(room, grid, used, summaryText){
    var host = document.createElement("div");
    host.className = "room-card";
    host.innerHTML = '<div class="room-title">Room ' + esc(room.room_no || "-") + ' (capacity ' + esc(seatingCapacity(room)) + ')</div>';
    if(summaryText){
      var summary = document.createElement("div");
      summary.className = "room-summary";
      summary.innerHTML = String(summaryText).split("\n").map(function(line){ return "<div>" + esc(line) + "</div>"; }).join("");
      host.appendChild(summary);
    }
    var wrap = document.createElement("div");
    wrap.className = "bench-grid";
    var table = document.createElement("table");
    table.className = "bench-table";
    var thead = document.createElement("thead");
    var headRow1 = document.createElement("tr");
    var headRow2 = document.createElement("tr");
    var benchRows = getRoomBenchRows(room);
    var columnCount = benchRows.length;
    var singleSeatLayout = grid.every(function(row){
      for(var col = 0; col < columnCount; col++){
        var bench = row[col];
        if(bench && bench[1]) return false;
      }
      return true;
    });
    headRow1.innerHTML = singleSeatLayout ? "<th>Row</th>" : "<th rowspan=\"2\">Row</th>";
    for(var b = 0; b < columnCount; b++){
      var th = document.createElement("th");
      th.colSpan = singleSeatLayout ? 1 : 2;
      th.textContent = benchLetter(b);
      headRow1.appendChild(th);
      if(!singleSeatLayout){
        headRow2.innerHTML += "<th>A</th><th class=\"bench-gap\">B</th>";
      }
    }
    thead.appendChild(headRow1);
    if(!singleSeatLayout) thead.appendChild(headRow2);
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    grid.forEach(function(row, rowIndex){
      var tr = document.createElement("tr");
      tr.innerHTML = "<td><b>" + (rowIndex + 1) + "</b></td>";
      for(var col = 0; col < columnCount; col++){
        var bench = row[col] || null;
        var left = bench && bench[0] ? bench[0] : null;
        var right = bench && bench[1] ? bench[1] : null;
        if(singleSeatLayout){
          tr.innerHTML += '<td class="seat-cell">' + formatSeatCell(left) + '</td>';
        }else{
          tr.innerHTML += '<td class="seat-cell">' + formatSeatCell(left) + '</td><td class="seat-cell bench-gap">' + formatSeatCell(right) + '</td>';
        }
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
    return host;
  }

  async function loadTeacherSeatingDates(session, examName){
    var select = document.getElementById("teacherSeatingDate");
    if(!select) return;
    select.innerHTML = '<option value="">Loading dates...</option>';
    dutyState.teacherSeating.dateClassSubjectMap = new Map();
    if(!session || !examName){
      select.innerHTML = '<option value="">No dates found</option>';
      return;
    }
    var classes = [];
    try{
      var studentData = await fetchJson(EXAM_API + "/student/list?session=" + encodeURIComponent(session));
      var studentRows = Array.isArray(studentData.students) ? studentData.students : [];
      classes = Array.from(new Set(studentRows.map(function(item){
        return normalize(item.class_name || item.class);
      }).filter(Boolean))).sort();
    }catch(_e){
      try{
        var fallback = await fetch(EXAM_API.replace(/\/+$/, "") + "/../students?session=" + encodeURIComponent(session));
      }catch(_e2){}
    }
    if(!classes.length){
      try{
        var res = await fetch((localStorage.getItem("studentApiBaseUrl") || "https://student-backend-117372286918.asia-south1.run.app").replace(/\/+$/, "") + "/students?session=" + encodeURIComponent(session));
        var data = await res.json().catch(function(){ return {}; });
        var rows = Array.isArray(data) ? data : (Array.isArray(data.students) ? data.students : []);
        classes = Array.from(new Set(rows.map(function(item){ return normalize(item.class_name || item.class); }).filter(Boolean))).sort();
      }catch(_e3){}
    }
    for(var i = 0; i < classes.length; i++){
      try{
        var ds = await fetchJson(EXAM_API + "/exam/get-datesheet?class_name=" + encodeURIComponent(classes[i]) + "&session=" + encodeURIComponent(session) + "&exam_name=" + encodeURIComponent(examName));
        (Array.isArray(ds.datesheet) ? ds.datesheet : []).forEach(function(item){
          var date = normalize(item.date);
          var subject = normalize(item.subject);
          if(!date || !subject) return;
          if(!dutyState.teacherSeating.dateClassSubjectMap.has(date)){
            dutyState.teacherSeating.dateClassSubjectMap.set(date, new Map());
          }
          var clsMap = dutyState.teacherSeating.dateClassSubjectMap.get(date);
          if(!clsMap.has(classes[i])) clsMap.set(classes[i], new Set());
          clsMap.get(classes[i]).add(subject);
        });
      }catch(_e4){}
    }
    var dates = Array.from(dutyState.teacherSeating.dateClassSubjectMap.keys()).sort();
    select.innerHTML = '<option value="">Select Date</option>' + dates.map(function(date){
      return '<option value="' + esc(date) + '">' + esc(date) + '</option>';
    }).join("");
    if(dates.length) select.value = dates[0];
  }

  async function loadTeacherSeatingRooms(session){
    var select1 = document.getElementById("teacherRoom1");
    var select2 = document.getElementById("teacherRoom2");
    if(!select1 || !select2) return [];
    select1.innerHTML = '<option value="">Loading rooms...</option>';
    select2.innerHTML = '<option value="">Loading rooms...</option>';
    try{
      var data = await fetchJson(EXAM_API + "/rooms/list?session=" + encodeURIComponent(session || ""));
      var rows = Array.isArray(data.rooms) ? data.rooms : [];
      dutyState.teacherSeating.rooms = rows.slice();
      var options = '<option value="">NA</option>' + rows.map(function(row){
        return '<option value="' + esc(row.room_no || "") + '">' + esc((row.room_no || "-") + " (cap " + seatingCapacity(row) + ")") + '</option>';
      }).join("");
      select1.innerHTML = options;
      select2.innerHTML = options;
      var sorted = sortRoomsByCapacity(rows).reverse();
      if(sorted[0]) select1.value = normalize(sorted[0].room_no);
      if(sorted[1]) select2.value = normalize(sorted[1].room_no);
      renderTeacherRoomSummary();
      return rows;
    }catch(e){
      dutyState.teacherSeating.rooms = [];
      select1.innerHTML = '<option value="">No rooms found</option>';
      select2.innerHTML = '<option value="">No rooms found</option>';
      renderTeacherRoomSummary();
      setStatus("teacherDutyFormStatus", e.message || "Unable to load rooms.", true);
      return [];
    }
  }

  function renderTeacherSeatingClasses(date){
    var wrap = document.getElementById("teacherClassList");
    if(!wrap) return;
    var clsMap = dutyState.teacherSeating.dateClassSubjectMap.get(date) || new Map();
    var classes = Array.from(clsMap.keys()).sort(classSort);
    if(!classes.length){
      wrap.innerHTML = '<div class="helper">No classes found for the selected date.</div>';
      return;
    }
    wrap.innerHTML = classes.map(function(cls){
      return '<label class="class-card"><input type="checkbox" class="teacher-seat-class-check" value="' + esc(cls) + '"><span>' + esc(cls) + '</span></label>';
    }).join("");
  }

  async function loadTeacherSeatingStudents(session, classes){
    dutyState.teacherSeating.classStudentsMap = {};
    var studentApi = (localStorage.getItem("studentApiBaseUrl") || "https://student-backend-117372286918.asia-south1.run.app").replace(/\/+$/, "");
    for(var i = 0; i < classes.length; i++){
      try{
        var res = await fetch(studentApi + "/students?session=" + encodeURIComponent(session) + "&class_name=" + encodeURIComponent(classes[i]));
        var data = await res.json().catch(function(){ return {}; });
        var rows = Array.isArray(data) ? data : (Array.isArray(data.students) ? data.students : []);
        dutyState.teacherSeating.classStudentsMap[classes[i]] = rows.map(function(item){
          return {
            name: item.student_name || item.name || "",
            roll: String(item.rollno != null ? item.rollno : item.roll != null ? item.roll : "").trim(),
            class_name: classes[i],
            exam_roll: String(item.exam_rollno != null ? item.exam_rollno : item.exam_roll != null ? item.exam_roll : "").trim()
          };
        }).filter(function(item){
          return item.roll;
        }).sort(function(a, b){
          return (parseInt(a.roll, 10) || 0) - (parseInt(b.roll, 10) || 0);
        });
      }catch(_e){
        dutyState.teacherSeating.classStudentsMap[classes[i]] = [];
      }
    }
  }

  function renderTeacherSeatingAssignmentTable(){
    var head = document.getElementById("teacherSeatingAssignmentHead");
    var body = document.getElementById("teacherSeatingAssignmentBody");
    var roomBody = document.getElementById("teacherRoomMappingBody");
    if(!body) return;
    if(!dutyState.teacherSeating.assignmentRows.length){
      if(head) head.innerHTML = '<tr><th>Class</th><th>Subject</th><th>Students</th><th>Roll No</th><th>Room 1</th><th>Room 2</th></tr>';
      body.innerHTML = '<tr><td colspan="6">No plan generated yet.</td></tr>';
      if(roomBody) roomBody.innerHTML = '<tr><td colspan="5">No plan generated yet.</td></tr>';
      return;
    }
    var roomOptions = dutyState.teacherSeating.rooms.map(function(room){
      return '<option value="' + esc(room.room_no || "") + '">' + esc(room.room_no || "") + '</option>';
    }).join("");
    var segments = buildTeacherAssignmentSegments(dutyState.teacherSeating.assignmentRows, dutyState.teacherSeating.classStudentsMap);
    var grouped = [];
    var groupedMap = {};
    segments.forEach(function(row){
      var key = normalize(row.className) + "||" + normalize(row.subject);
      if(!groupedMap[key]){
        groupedMap[key] = {
          className: normalize(row.className),
          subject: normalize(row.subject) || "-",
          totalStudents: 0,
          segments: [],
          rollRange: "-"
        };
        grouped.push(groupedMap[key]);
      }
      groupedMap[key].totalStudents = Math.max(
        groupedMap[key].totalStudents,
        (dutyState.teacherSeating.classStudentsMap[normalize(row.className)] || []).length,
        Number(row.studentCount || 0)
      );
      groupedMap[key].segments.push({ rowIndex: row.rowIndex, studentCount: Number(row.studentCount || 0), roomNo: normalize(row.roomNo), rollRange: row.rollRange });
      groupedMap[key].rollRange = formatTeacherRollRange(dutyState.teacherSeating.classStudentsMap[normalize(row.className)] || []);
    });
    grouped.sort(function(a, b){
      return classSort(a.className, b.className);
    });
    var maxRooms = grouped.reduce(function(max, item){
      return Math.max(max, item.segments.length);
    }, 2);
    if(head){
      head.innerHTML = '<tr><th>Class</th><th>Subject</th><th>Students</th><th>Roll No</th>' + Array.from({ length: maxRooms }, function(_, idx){
        var room = getTeacherRoomByNo(normalize((document.getElementById("teacherRoom" + (idx + 1)) || {}).value));
        if(!room) return '<th>Room ' + (idx + 1) + ': NA</th>';
        return '<th>Room ' + (idx + 1) + ': ' + esc(room.room_no || "-") + ' (' + esc(seatingCapacity(room)) + ')</th>';
      }).join("") + '</tr>';
    }
    body.innerHTML = grouped.map(function(item, groupIdx){
      var roomCells = "";
      for(var i = 0; i < maxRooms; i++){
        var segment = item.segments[i] || null;
        if(segment){
          roomCells += '<td><select data-seat-row-index="' + segment.rowIndex + '" class="teacher-seat-room-select">' + roomOptions + '</select><div class="helper" style="font-size:12px;margin-top:4px;">' + esc(segment.studentCount) + ' students</div></td>';
        }else{
          roomCells += '<td>NA</td>';
        }
      }
      return '<tr><td>' + esc(item.className) + '</td><td>' + esc(item.subject) + '</td><td>' + esc(item.totalStudents) + '</td><td>' + esc(item.rollRange) + '</td>' + roomCells + '</tr>';
    }).join("");
    if(roomBody){
      roomBody.innerHTML = segments.length ? segments.map(function(row){
        return '<tr><td>' + esc(row.roomNo || "-") + '</td><td>' + esc(row.className) + '</td><td>' + esc(row.subject || "-") + '</td><td>' + esc(row.studentCount || 0) + '</td><td>' + esc(row.rollRange || "-") + '</td></tr>';
      }).join("") : '<tr><td colspan="5">No plan generated yet.</td></tr>';
    }
    Array.from(body.querySelectorAll(".teacher-seat-room-select")).forEach(function(select){
      var idx = Number(select.getAttribute("data-seat-row-index"));
      if(dutyState.teacherSeating.assignmentRows[idx]){
        select.value = dutyState.teacherSeating.assignmentRows[idx].roomNo || "";
      }
      select.onchange = function(){
        if(dutyState.teacherSeating.assignmentRows[idx]){
          dutyState.teacherSeating.assignmentRows[idx].roomNo = normalize(this.value);
        }
      };
    });
  }

  function renderTeacherLeftStudents(){
    var body = document.getElementById("teacherLeftStudentBody");
    var status = document.getElementById("teacherLeftStudentStatus");
    if(!body) return;
    if(!dutyState.teacherSeating.leftStudents.length){
      body.innerHTML = '<tr><td colspan="2">No left students.</td></tr>';
      if(status) status.textContent = "";
      return;
    }
    body.innerHTML = dutyState.teacherSeating.leftStudents.map(function(item){
      return '<tr><td>' + esc(item.className) + '</td><td>' + esc(item.studentCount) + '</td></tr>';
    }).join("");
    if(status){
      status.textContent = dutyState.teacherSeating.leftStudents.reduce(function(sum, item){
        return sum + Number(item.studentCount || 0);
      }, 0) + " students are left because all selected rooms are full.";
    }
  }

  function buildTeacherRemainingStudents(classStudentsMap){
    var remainingByClass = {};
    Object.keys(classStudentsMap || {}).forEach(function(cls){
      remainingByClass[cls] = (classStudentsMap[cls] || []).map(function(item){
        return Object.assign({}, item);
      });
    });
    return remainingByClass;
  }

  function buildLaneSegmentsForRoom(roomNo, assignmentRows, remainingByClass){
    var rows = (assignmentRows || []).filter(function(row){
      return normalize(row.roomNo) === normalize(roomNo);
    });
    var laneA = [];
    var laneB = [];
    var laneACap = 0;
    var laneBCap = 0;
    rows.forEach(function(row){
      var cls = normalize(row.className);
      var count = Number(row.studentCount || 0);
      var source = (remainingByClass && remainingByClass[cls]) || [];
      var list = source.splice(0, Math.max(0, count));
      if(remainingByClass) remainingByClass[cls] = source;
      var target = laneACap <= laneBCap ? laneA : laneB;
      if(target === laneA) laneACap += list.length;
      else laneBCap += list.length;
      target.push({ cls: cls, list: list });
    });
    return { laneA: laneA, laneB: laneB };
  }

  function getTeacherRoomQueuesByAssignments(roomNo, assignmentRows, remainingByClass){
    var rows = Array.isArray(assignmentRows) ? assignmentRows : [];
    var roomRows = rows.filter(function(row){
      return normalize(row.roomNo) === normalize(roomNo);
    });
    return roomRows.map(function(row){
      var cls = normalize(row.className);
      var count = Number(row.studentCount || 0);
      var source = (remainingByClass && remainingByClass[cls]) || [];
      var list = source.splice(0, Math.max(0, count));
      if(remainingByClass) remainingByClass[cls] = source;
      return { cls: cls, list: list };
    }).filter(function(item){
      return item.cls && item.list.length;
    });
  }

  function renderTeacherSavedSeatingPlans(){
    var body = document.getElementById("teacherSavedPlanBody");
    if(!body) return;
    if(!dutyState.teacherSeating.savedPlans.length){
      body.innerHTML = '<tr><td colspan="5">No saved seating plans found.</td></tr>';
      return;
    }
    body.innerHTML = dutyState.teacherSeating.savedPlans.map(function(plan){
      var classes = Array.isArray(plan.selected_classes) ? plan.selected_classes.join(", ") : "";
      var savedBy = [normalize(plan.saved_by_role), normalize(plan.saved_by_name)].filter(Boolean).join(" ");
      return '<tr><td>' + esc(plan.exam_name || "-") + '</td><td>' + esc(plan.exam_date || "-") + '</td><td>' + esc(classes || "-") + '</td><td>' + esc(savedBy || "-") + '</td><td><button type="button" class="mini-btn edit-btn" onclick="loadTeacherSavedSeatingPlan(\'' + esc(plan.id || "") + '\')">Edit</button> <button type="button" class="mini-btn delete-btn" onclick="deleteTeacherSavedSeatingPlan(\'' + esc(plan.id || "") + '\')">Delete</button></td></tr>';
    }).join("");
  }

  async function loadTeacherSavedSeatingPlans(){
    var statusId = "teacherSavedPlanStatus";
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var teacherId = normalize(document.getElementById("teacherDutyTeacherId") && document.getElementById("teacherDutyTeacherId").value) || (Array.isArray(aliasInfo.ids) && aliasInfo.ids.length ? aliasInfo.ids[0] : getTeacherId());
    if(!teacherId){
      dutyState.teacherSeating.savedPlans = [];
      renderTeacherSavedSeatingPlans();
      return setStatus(statusId, "Teacher id is missing.", true);
    }
    try{
      setStatus(statusId, "Loading saved seating plans...", false);
      var data = await fetchJson(EXAM_API + "/seating-plan/list?session=" + encodeURIComponent(session) + "&saved_by_role=Teacher&saved_by_id=" + encodeURIComponent(teacherId));
      dutyState.teacherSeating.savedPlans = Array.isArray(data.plans) ? data.plans : [];
      renderTeacherSavedSeatingPlans();
      setStatus(statusId, dutyState.teacherSeating.savedPlans.length ? "Saved seating plans loaded." : "No saved seating plans found.", !dutyState.teacherSeating.savedPlans.length);
    }catch(e){
      dutyState.teacherSeating.savedPlans = [];
      renderTeacherSavedSeatingPlans();
      setStatus(statusId, e.message || "Unable to load saved seating plans.", true);
    }
  }

  async function applyTeacherSavedSeatingPlan(plan){
    if(!plan) return;
    var session = await resolveLatestSession();
    if(plan.teacher_duty_id){
      var linkedDuty = dutyState.records.find(function(item){ return item.id === plan.teacher_duty_id; });
      if(linkedDuty){
        fillTeacherDutyForm(linkedDuty);
      }
    }
    var examName = normalize(plan.exam_name);
    if(examName){
      document.getElementById("teacherDutyExam").value = examName;
    }
    await loadTeacherSeatingDates(session, examName || normalize(document.getElementById("teacherDutyExam").value));
    var usedRooms = Array.from(new Set((Array.isArray(plan.assignment_rows) ? plan.assignment_rows : []).map(function(item){
      return normalize(item.roomNo || item.room_no);
    }).filter(Boolean)));
    var room1 = document.getElementById("teacherRoom1");
    var room2 = document.getElementById("teacherRoom2");
    if(room1) room1.value = usedRooms[0] || "";
    if(room2) room2.value = usedRooms[1] || "";
    renderTeacherRoomSummary();
    var dateSelect = document.getElementById("teacherSeatingDate");
    if(dateSelect) dateSelect.value = normalize(plan.exam_date);
    renderTeacherSeatingClasses(normalize(plan.exam_date));
    Array.from(document.querySelectorAll(".teacher-seat-class-check")).forEach(function(input){
      input.checked = Array.isArray(plan.selected_classes) && plan.selected_classes.indexOf(normalize(input.value)) !== -1;
    });
    document.getElementById("teacherDutyDescription").value = normalize(plan.notes);
    dutyState.teacherSeating.currentPlanId = normalize(plan.id);
    dutyState.teacherSeating.assignmentRows = Array.isArray(plan.assignment_rows) ? plan.assignment_rows.map(function(item){
      return {
        className: normalize(item.className || item.class_name),
        subject: normalize(item.subject),
        studentCount: Number(item.studentCount || item.student_count || 0),
        roomNo: normalize(item.roomNo || item.room_no)
      };
    }).filter(function(item){
      return item.className && item.roomNo;
    }) : [];
    dutyState.teacherSeating.leftStudents = [];
    await loadTeacherSeatingStudents(session, Array.from(new Set(dutyState.teacherSeating.assignmentRows.map(function(item){ return item.className; }))));
    renderTeacherSeatingAssignmentTable();
    renderTeacherLeftStudents();
    await previewTeacherSeatPlan();
    setStatus("teacherDutyFormStatus", "Saved seating plan loaded for editing.", false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteTeacherSavedSeatingPlanById(id){
    if(!id) return;
    if(!window.confirm("Delete this saved seating plan?")) return;
    try{
      await fetchJson(EXAM_API + "/seating-plan/delete/" + encodeURIComponent(id), { method: "DELETE" });
      if(dutyState.teacherSeating.currentPlanId === id){
        dutyState.teacherSeating.currentPlanId = "";
      }
      await loadTeacherSavedSeatingPlans();
      setStatus("teacherDutyFormStatus", "Saved seating plan deleted.", false);
    }catch(e){
      setStatus("teacherSavedPlanStatus", e.message || "Unable to delete saved seating plan.", true);
    }
  }

  async function applyTeacherSavedSeatingPlanByContext(examName, examDate){
    var matchExam = normalize(examName);
    var matchDate = normalize(examDate);
    if(!matchExam || !matchDate){
      return false;
    }
    var plan = dutyState.teacherSeating.savedPlans.find(function(item){
      return normalize(item.exam_name) === matchExam && normalize(item.exam_date) === matchDate;
    }) || null;
    if(!plan){
      dutyState.teacherSeating.assignmentRows = [];
      dutyState.teacherSeating.currentPlanId = "";
      dutyState.teacherSeating.leftStudents = [];
      renderTeacherSeatingAssignmentTable();
      renderTeacherLeftStudents();
      setHtml("teacherSeatPlanHost", '<div class="helper">No saved seating plan found for this exam date. Generate a new plan or choose another date.</div>');
      document.getElementById("teacherDutyDescription").value = "";
      return false;
    }
    await applyTeacherSavedSeatingPlan(plan);
    return true;
  }

  async function autoGenerateTeacherSeatPlan(){
    var session = await resolveLatestSession();
    var selectedClasses = Array.from(document.querySelectorAll(".teacher-seat-class-check:checked")).map(function(input){ return normalize(input.value); }).filter(Boolean);
    if(!selectedClasses.length){
      return setStatus("teacherDutyFormStatus", "Select at least one class first.", true);
    }
    if(!dutyState.teacherSeating.rooms.length){
      return setStatus("teacherDutyFormStatus", "No rooms available for seating plan.", true);
    }
    setStatus("teacherDutyFormStatus", "Generating seating plan...", false);
    await loadTeacherSeatingStudents(session, selectedClasses);
    var classStudentLists = selectedClasses.map(function(cls){
      return { cls: cls, list: (dutyState.teacherSeating.classStudentsMap[cls] || []).slice() };
    }).filter(function(item){ return item.list.length; }).sort(function(a, b){
      if(b.list.length !== a.list.length) return b.list.length - a.list.length;
      return classSort(a.cls, b.cls);
    });
    var totalStudents = classStudentLists.reduce(function(sum, item){ return sum + item.list.length; }, 0);
    if(!totalStudents){
      return setStatus("teacherDutyFormStatus", "No students found for selected classes.", true);
    }
    dutyState.teacherSeating.currentPlanId = "";
    var selectedRooms = getSelectedTeacherRooms();
    var dateKey = normalize(document.getElementById("teacherSeatingDate").value);
    var clsMap = dutyState.teacherSeating.dateClassSubjectMap.get(dateKey) || new Map();
    var assignmentRows = [];
    var laneStates = [];
    selectedRooms.forEach(function(room){
      var laneCap = benchCapacity(room);
      laneStates.push({ room: room, lane: "A", remaining: laneCap });
      laneStates.push({ room: room, lane: "B", remaining: laneCap });
    });

    function assignChunk(item, laneState, take){
      if(!laneState || take <= 0) return;
      assignmentRows.push({
        className: item.cls,
        subject: (clsMap.get(item.cls) ? Array.from(clsMap.get(item.cls)).join(", ") : "Unknown"),
        studentCount: take,
        roomNo: laneState.room.room_no || ""
      });
      laneState.remaining -= take;
      item.list = item.list.slice(take);
    }

    function findBestWholeFit(size){
      return laneStates
        .filter(function(lane){ return lane.remaining >= size; })
        .sort(function(a, b){ return a.remaining - b.remaining; })[0] || null;
    }

    classStudentLists.forEach(function(item){
      if(!item.list.length) return;

      var fullFitLane = findBestWholeFit(item.list.length);
      if(fullFitLane){
        assignChunk(item, fullFitLane, item.list.length);
        return;
      }

      var usedRooms = {};
      while(item.list.length){
        var candidates = laneStates.filter(function(lane){
          return lane.remaining > 0 && !usedRooms[normalize(lane.room.room_no)];
        }).sort(function(a, b){
          return b.remaining - a.remaining;
        });
        if(!candidates.length) break;

        var chosen = candidates[0];
        var take = Math.min(item.list.length, chosen.remaining);
        assignChunk(item, chosen, take);
        usedRooms[normalize(chosen.room.room_no)] = true;
      }
    });
    dutyState.teacherSeating.assignmentRows = assignmentRows;
    dutyState.teacherSeating.leftStudents = classStudentLists.filter(function(item){
      return item.list.length;
    }).map(function(item){
      return {
        className: item.cls,
        studentCount: item.list.length
      };
    });
    renderTeacherSeatingAssignmentTable();
    renderTeacherLeftStudents();
    await previewTeacherSeatPlan();
    setStatus("teacherDutyFormStatus", "Seating plan generated. You can change any class room manually now.", false);
  }

  async function previewTeacherSeatPlan(){
    var host = document.getElementById("teacherSeatPlanHost");
    if(!host) return;
    host.innerHTML = "";
    setStatus("teacherSeatPlanStatus", "", false);
    if(!dutyState.teacherSeating.assignmentRows.length){
      host.innerHTML = '<div class="helper">Generate a seating plan first.</div>';
      return;
    }
    var dateText = normalize(document.getElementById("teacherSeatingDate").value);
    var roomNames = Array.from(new Set(dutyState.teacherSeating.assignmentRows.map(function(row){
      return normalize(row.roomNo);
    }).filter(Boolean)));
    var rooms = dutyState.teacherSeating.rooms.filter(function(room){ return roomNames.indexOf(normalize(room.room_no)) !== -1; });
    var remainingByClass = buildTeacherRemainingStudents(dutyState.teacherSeating.classStudentsMap);
    var leftoverCounts = {};
    rooms.forEach(function(room){
      var laneState = buildLaneSegmentsForRoom(room.room_no, dutyState.teacherSeating.assignmentRows, remainingByClass);
      var state = { laneA: laneState.laneA, laneB: laneState.laneB };
      var result = buildSeatMatrixFromRoom(room, state);
      laneState.laneA.concat(laneState.laneB).forEach(function(item){
        if(item.list && item.list.length){
          leftoverCounts[item.cls] = (leftoverCounts[item.cls] || 0) + item.list.length;
        }
      });
      var classCounts = result.used.reduce(function(acc, student){
        acc[student.class_name] = (acc[student.class_name] || 0) + 1;
        return acc;
      }, {});
      var summaryLines = Object.keys(classCounts).map(function(cls){
        var subject = dutyState.teacherSeating.assignmentRows.find(function(item){
          return item.className === cls && normalize(item.roomNo) === normalize(room.room_no);
        });
        return "Class: " + cls + " | Students: " + classCounts[cls] + " | Subject: " + (subject ? subject.subject : "-");
      }).join("\n");
      var summary = "Room: " + room.room_no + " | Total: " + result.used.length + (dateText ? " | Date: " + dateText : "") + "\n" + summaryLines;
      host.appendChild(renderSeatPlanRoom(room, result.grid, result.used, summary));
    });
    Object.keys(remainingByClass).forEach(function(cls){
      var count = (remainingByClass[cls] || []).length;
      if(count){
        leftoverCounts[cls] = (leftoverCounts[cls] || 0) + count;
      }
    });
    dutyState.teacherSeating.leftStudents = Object.keys(leftoverCounts).map(function(cls){
      return { className: cls, studentCount: leftoverCounts[cls] };
    }).filter(function(item){
      return Number(item.studentCount || 0) > 0;
    });
    renderTeacherLeftStudents();
    var totalRemaining = dutyState.teacherSeating.leftStudents.reduce(function(sum, item){
      return sum + Number(item.studentCount || 0);
    }, 0);
    if(totalRemaining > 0){
      setStatus("teacherSeatPlanStatus", totalRemaining + " students are still left without seats. Check the Left Students section.", true);
    }else{
      setStatus("teacherSeatPlanStatus", "Preview updated successfully.", false);
    }
  }

  async function saveTeacherSeatPlan(){
    var saveBtn = document.getElementById("teacherSaveSeatPlanBtn");
    if(dutyState.teacherSeating.isSaving){
      return;
    }
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var dutyId = normalize(document.getElementById("teacherDutyId").value);
    var activityKey = normalize(document.body.dataset.activityKey);
    var title = normalize(document.getElementById("teacherDutyTitle").value);
    var examName = normalize(document.getElementById("teacherDutyExam").value);
    var dutyDate = normalize(document.getElementById("teacherDutyDate").value);
    var dueDate = normalize(document.getElementById("teacherDutyDueDate").value);
    var teacherId = normalize(document.getElementById("teacherDutyTeacherId").value) || (Array.isArray(aliasInfo.ids) && aliasInfo.ids.length ? aliasInfo.ids[0] : getTeacherId());
    var teacherName = aliasInfo.teacherName || getTeacherName();
    var dateText = normalize(document.getElementById("teacherSeatingDate").value);
    var notes = normalize(document.getElementById("teacherDutyDescription").value);
    if(!dutyId || !title){
      return setStatus("teacherDutyFormStatus", "Select an assigned seating duty first.", true);
    }
    if(!dutyState.teacherSeating.assignmentRows.length){
      return setStatus("teacherDutyFormStatus", "Generate and preview a seating plan before saving.", true);
    }
    var roomList = Array.from(new Set(dutyState.teacherSeating.assignmentRows.map(function(item){ return normalize(item.roomNo); }).filter(Boolean)));
    var mappingLines = dutyState.teacherSeating.assignmentRows.map(function(item){
      return item.className + " -> " + item.roomNo + " (" + item.studentCount + " students)";
    });
    var description = [
      dateText ? "Exam Date: " + dateText : "",
      "Seat Mapping: " + mappingLines.join(" | "),
      notes ? "Notes: " + notes : ""
    ].filter(Boolean).join(" | ");
    try{
      dutyState.teacherSeating.isSaving = true;
      if(saveBtn){
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
      }
      await fetchJson(EXAM_API + "/seating-plan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dutyState.teacherSeating.currentPlanId || "",
          session: session,
          exam_name: examName,
          exam_date: dateText,
          selected_classes: Array.from(new Set(dutyState.teacherSeating.assignmentRows.map(function(item){ return item.className; }))),
          assignment_rows: dutyState.teacherSeating.assignmentRows.map(function(item){
            return {
              className: item.className,
              subject: item.subject,
              studentCount: item.studentCount,
              roomNo: item.roomNo
            };
          }),
          saved_by_role: "Teacher",
          saved_by_name: teacherName,
          saved_by_id: teacherId,
          teacher_duty_id: dutyId,
          teacher_duty_title: title,
          notes: notes
        })
      });
      await fetchJson(EXAM_API + "/teacher-duty/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dutyId,
          session: session,
          activity_key: activityKey,
          activity_title: document.body.dataset.activityTitle || "",
          teacher_id: teacherId,
          teacher_name: teacherName,
          title: title,
          exam_name: examName,
          room_no: roomList.join(", "),
          duty_date: dutyDate,
          due_date: dueDate,
          description: description,
          status: "completed",
          assigned_by: "Teacher"
        })
      });
      await loadTeacherSavedSeatingPlans();
      setStatus("teacherDutyFormStatus", "Seating plan saved successfully.", false);
      window.alert("Seating plan saved successfully.");
    }catch(e){
      setStatus("teacherDutyFormStatus", e.message || "Unable to save seating plan.", true);
    }finally{
      dutyState.teacherSeating.isSaving = false;
      if(saveBtn){
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Seating Plan";
      }
    }
  }

  async function initTeacherSeatingFillPage(skipStatusReset){
    await loadActivities();
    var aliasInfo = await resolveTeacherAliases();
    var session = aliasInfo.session || await resolveLatestSession();
    var teacherName = aliasInfo.teacherName || getTeacherName();
    var activityKey = document.body.dataset.activityKey || "";
    var activityTitle = document.body.dataset.activityTitle || "Exam Seating Plan Making";
    setText("teacherFillTitle", activityTitle);
    setText("teacherFillSubtitle", "Auto generate the seat plan like the admin page, then manually change class-room mapping if needed.");
    setText("teacherFillSession", session || "Session not selected");
    setText("teacherFillTeacherName", teacherName || "Teacher");
    setText("teacherFillTeacherId", (Array.isArray(aliasInfo.ids) && aliasInfo.ids[0]) || getTeacherId() || "-");
    if(!skipStatusReset){
      setStatus("teacherDutyFormStatus", "", false);
      setStatus("teacherSeatPlanStatus", "", false);
    }
    var dutyRows = await loadTeacherDutyRows(aliasInfo, activityKey);
    dutyState.records = dutyRows.slice();
    setText("teacherFillCount", String(dutyRows.length));
    await loadTeacherSeatingRooms(session);
    if(!dutyRows.length){
      setText("teacherDutyCurrentInfo", "No seating-plan assignments available for this activity.");
      return;
    }
    var preferredId = normalize(sessionStorage.getItem("teacherDutySelectedId"));
    var selected = dutyRows.find(function(item){ return item.id === preferredId; }) || dutyRows[0];
    fillTeacherDutyForm(selected);
    await loadTeacherSeatingDates(session, normalize(selected.exam_name));
    renderTeacherSeatingClasses(normalize(document.getElementById("teacherSeatingDate").value));
    dutyState.teacherSeating.assignmentRows = [];
    dutyState.teacherSeating.currentPlanId = "";
    dutyState.teacherSeating.leftStudents = [];
    dutyState.teacherSeating.isSaving = false;
    renderTeacherSeatingAssignmentTable();
    renderTeacherLeftStudents();
    setHtml("teacherSeatPlanHost", '<div class="helper">Generate a seating plan to preview it here.</div>');
    await loadTeacherSavedSeatingPlans();
    await applyTeacherSavedSeatingPlanByContext(
      normalize(document.getElementById("teacherDutyExam").value),
      normalize(document.getElementById("teacherSeatingDate").value)
    );
  }

  window.applyTeacherRoomToForm = function(roomNo, rows, benchRowsText, seatsPerBench){
    document.getElementById("teacherRoomNo").value = roomNo || "";
    document.getElementById("teacherRoomRows").value = rows || "";
    var benchRows = String(benchRowsText || "").split("|").map(function(value){
      return Number(value || 0);
    }).filter(function(value){
      return value > 0;
    });
    renderTeacherBenchRowInputs(rows || benchRows.length || 0, benchRows);
    document.getElementById("teacherSeatsPerBench").value = seatsPerBench || "2";
  };

  window.openTeacherDutyPage = function(page, activityKey, dutyId){
    if(activityKey) sessionStorage.setItem("teacherDutyActivityKey", activityKey);
    if(dutyId) sessionStorage.setItem("teacherDutySelectedId", dutyId);
    location.href = page || "teacher_duties.html";
  };

  window.editTeacherDutyRecord = async function(id){
    var row = dutyState.records.find(function(item){ return item.id === id; });
    if(row){
      sessionStorage.setItem("teacherDutySelectedId", row.id || "");
      if((document.body.dataset.dutyMode || "") === "teacher-room-fill"){
        fillTeacherRoomDutyForm(row, "");
      }else if((document.body.dataset.dutyMode || "") === "teacher-seating-fill"){
        fillTeacherDutyForm(row);
        await loadTeacherSeatingDates(await resolveLatestSession(), normalize(row.exam_name));
        renderTeacherSeatingClasses(normalize(document.getElementById("teacherSeatingDate").value));
        dutyState.teacherSeating.assignmentRows = [];
        dutyState.teacherSeating.currentPlanId = "";
        dutyState.teacherSeating.leftStudents = [];
        renderTeacherSeatingAssignmentTable();
        renderTeacherLeftStudents();
        setHtml("teacherSeatPlanHost", '<div class="helper">Generate a seating plan to preview it here.</div>');
        await loadTeacherSavedSeatingPlans();
        await applyTeacherSavedSeatingPlanByContext(
          normalize(document.getElementById("teacherDutyExam").value),
          normalize(document.getElementById("teacherSeatingDate").value)
        );
      }else{
        fillTeacherDutyForm(row);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  document.addEventListener("DOMContentLoaded", function(){
    var mode = document.body.dataset.dutyMode || "";
    if(mode === "admin-hub"){
      initAdminHub();
    }else if(mode === "admin-assign"){
      initAdminAssign();
    }else if(mode === "teacher-view"){
      initTeacherDutyPage();
    }else if(mode === "teacher-fill"){
      var form = document.getElementById("teacherDutyForm");
      if(form){
        form.addEventListener("submit", function(ev){
          ev.preventDefault();
          saveTeacherDutyDetails();
        });
      }
      var resetBtn = document.getElementById("resetTeacherDutyBtn");
      if(resetBtn){
        resetBtn.onclick = function(){
          initTeacherFillPage();
        };
      }
      var sendInvigBtn = document.getElementById("sendInvigilationNoticeBtn");
      if(sendInvigBtn){
        sendInvigBtn.onclick = function(){
          sendInvigilationNotificationsOnly();
        };
      }
      var attendanceBtn = document.getElementById("teacherDownloadAttendanceBtn");
      if(attendanceBtn){
        attendanceBtn.onclick = downloadTeacherAttendanceSheetPdf;
      }
      initTeacherFillPage();
    }else if(mode === "teacher-room-fill"){
      var teacherRoomRowsInput = document.getElementById("teacherRoomRows");
      if(teacherRoomRowsInput){
        teacherRoomRowsInput.addEventListener("input", function(){
          renderTeacherBenchRowInputs(this.value, getTeacherBenchRowValues());
        });
      }
      var roomForm = document.getElementById("teacherRoomForm");
      if(roomForm){
        roomForm.addEventListener("submit", function(ev){
          ev.preventDefault();
          saveTeacherRoomDetails();
        });
      }
      var resetTeacherBtn = document.getElementById("resetTeacherDutyBtn");
      if(resetTeacherBtn){
        resetTeacherBtn.onclick = function(){
          initTeacherRoomFillPage();
        };
      }
      initTeacherRoomFillPage();
    }else if(mode === "teacher-seating-fill"){
      var dateSelect = document.getElementById("teacherSeatingDate");
      if(dateSelect){
        dateSelect.addEventListener("change", async function(){
          renderTeacherSeatingClasses(normalize(this.value));
          dutyState.teacherSeating.assignmentRows = [];
          dutyState.teacherSeating.currentPlanId = "";
          dutyState.teacherSeating.leftStudents = [];
          renderTeacherSeatingAssignmentTable();
          renderTeacherLeftStudents();
          setHtml("teacherSeatPlanHost", '<div class="helper">Generate a seating plan to preview it here.</div>');
          await applyTeacherSavedSeatingPlanByContext(
            normalize(document.getElementById("teacherDutyExam").value),
            normalize(this.value)
          );
        });
      }
      var selectAll = document.getElementById("teacherSelectAllClasses");
      if(selectAll){
        selectAll.addEventListener("change", function(){
          Array.from(document.querySelectorAll(".teacher-seat-class-check")).forEach(function(input){
            input.checked = !!selectAll.checked;
          });
        });
      }
      ["teacherRoom1", "teacherRoom2"].forEach(function(id){
        var roomSelect = document.getElementById(id);
        if(roomSelect){
          roomSelect.addEventListener("change", function(){
            renderTeacherRoomSummary();
            renderTeacherSeatingAssignmentTable();
          });
        }
      });
      var genBtn = document.getElementById("teacherGenerateSeatPlanBtn");
      if(genBtn) genBtn.onclick = autoGenerateTeacherSeatPlan;
      var previewBtn = document.getElementById("teacherPreviewSeatPlanBtn");
      if(previewBtn) previewBtn.onclick = previewTeacherSeatPlan;
      var saveBtn = document.getElementById("teacherSaveSeatPlanBtn");
      if(saveBtn) saveBtn.onclick = saveTeacherSeatPlan;
      var reloadBtn = document.getElementById("teacherReloadSeatPlanBtn");
      if(reloadBtn) reloadBtn.onclick = function(){ initTeacherSeatingFillPage(); };
      initTeacherSeatingFillPage();
    }else if(mode === "teacher-invigilation-readonly"){
      initTeacherInvigilationReadonlyPage();
    }
  });

  window.loadTeacherSavedSeatingPlan = async function(id){
    var plan = dutyState.teacherSeating.savedPlans.find(function(item){ return item.id === id; });
    if(plan) await applyTeacherSavedSeatingPlan(plan);
  };

  window.deleteTeacherSavedSeatingPlan = async function(id){
    await deleteTeacherSavedSeatingPlanById(id);
  };
})();
