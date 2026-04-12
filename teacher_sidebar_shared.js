(function(){
  var EXAM_API = String(
    localStorage.getItem('examApiBaseUrl') || 'https://exam-backend-117372286918.asia-south1.run.app'
  ).replace(/\/+$/, '');
  var STUDENT_API_CANDIDATES = [
    (localStorage.getItem('studentApiBaseUrl') || '').replace(/\/+$/, ''),
    'https://student-backend-117372286918.asia-south1.run.app',
    'http://127.0.0.1:8080'
  ].filter(Boolean);
  var CLOUDINARY_ROOT = 'https://res.cloudinary.com/djq1jjet6/image/upload/';
  var CLOUDINARY_TEACHER_BASE = CLOUDINARY_ROOT + 'school_teachers/';
  var DEFAULT_AVATAR = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='260'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%236b7280' font-size='18'%3ENo%20Photo%3C/text%3E%3C/svg%3E";

  function escHtml(v){
    return String(v || '').replace(/[&<>"']/g, function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
    });
  }
  function resolvePhotoUrl(v){
    var raw = String(v || '').trim();
    if(!raw) return '';
    if(/^https?:\/\//i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw)) return raw;
    var cleaned = raw.replace(/^\/+/, '');
    if(/^(v\d+\/)?school_teachers\//i.test(cleaned)){
      return CLOUDINARY_ROOT + cleaned;
    }
    return CLOUDINARY_TEACHER_BASE + cleaned;
  }
  function safePhotoUrl(v){
    var url = resolvePhotoUrl(v);
    if(!url || /\/school_teachers\/?$/.test(url)) return '';
    return url;
  }
  function norm(v){ return String(v || '').trim().toUpperCase(); }
  function normLoose(v){ return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g,''); }
  function code4(v){ return String(v || '').replace(/\D/g,'').padStart(4,'0').slice(-4); }
  function sessionRank(s, orderMap){
    var key = String(s || '').trim();
    if(orderMap && orderMap.has(key)) return orderMap.get(key);
    var m = key.match(/^(\d+)_/);
    return m ? parseInt(m[1],10) : -1;
  }
  function currentPage(){
    return (location.pathname.split('/').pop() || '').toLowerCase();
  }
  function isTeacherPage(){
    var p = currentPage();
    return p.indexOf('teacher_') === 0 || p === 'view_notices.html';
  }
  function clearTeacherAuth(){
    [
      'token','role','teacher_id','teacher_name','teacher_username','session'
    ].forEach(function(k){ localStorage.removeItem(k); });
    sessionStorage.removeItem('pending_teacher_login');
  }
  function enforceTeacherAuth(){
    if(!isTeacherPage()) return true;
    var role = String(localStorage.getItem('role') || '').toLowerCase();
    var teacherUser = String(localStorage.getItem('teacher_username') || '').toUpperCase();
    if(role !== 'teacher' || !teacherUser){
      clearTeacherAuth();
      location.href = 'index.html';
      return false;
    }
    return true;
  }

  if(!enforceTeacherAuth()) return;

  async function fetchJson(url){
    try{
      var r = await fetch(url);
      if(!r.ok) return null;
      return await r.json();
    }catch(_e){
      return null;
    }
  }

  function ensureProfileStyles(){
    if(document.getElementById('teacher-profile-style')) return;
    var style = document.createElement('style');
    style.id = 'teacher-profile-style';
    style.textContent = [
      '.teacher-header-host{position:relative !important;overflow:visible !important;flex-wrap:wrap !important;row-gap:6px !important;}',
      '.teacher-profile-inline{position:static !important;transform:none !important;display:flex;align-items:center;gap:8px;z-index:2;max-width:100% !important;order:2 !important;width:100% !important;justify-content:flex-start !important;margin-top:6px !important;}',
      '.teacher-profile-inline .tp-avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.7);background:#e5e7eb;}',
      '.teacher-profile-inline .tp-meta{line-height:1.15;text-align:left;min-width:0;}',
      '.teacher-profile-inline .tp-name{font-size:20px;font-weight:700;color:#fff;}',
      '.teacher-profile-inline .tp-sub{font-size:13px;color:rgba(255,255,255,.92);}',
      '@media (max-width:1000px){.teacher-profile-inline{max-width:100% !important;}}',
      '@media (max-width:760px){.teacher-profile-inline{gap:6px;} .teacher-profile-inline .tp-avatar{width:34px;height:34px;}.teacher-profile-inline .tp-name{font-size:12px;}.teacher-profile-inline .tp-sub{font-size:10px;}}',
      '.teacher-dashboard-profile{display:grid;grid-template-columns:220px 1fr;gap:16px;align-items:center;background:#fff;border:1px solid #dbe3f0;border-radius:14px;padding:14px;box-shadow:0 6px 18px rgba(15,23,42,.08);margin:0 0 16px 0;}',
      '.teacher-dashboard-profile .tdp-img{width:220px;height:260px;object-fit:cover;border-radius:12px;border:1px solid #cbd5e1;background:#e5e7eb;}',
      '.teacher-dashboard-profile .tdp-name{font-size:24px;font-weight:700;color:#1f2a44;margin-bottom:6px;}',
      '.teacher-dashboard-profile .tdp-line{font-size:14px;color:#495674;margin:4px 0;}',
      '@media (max-width:760px){.teacher-dashboard-profile{grid-template-columns:1fr;}.teacher-dashboard-profile .tdp-img{width:100%;height:240px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function injectHeaderProfile(profile){
    var current = (location.pathname.split('/').pop() || '').toLowerCase();
    var host = document.querySelector('.topbar') || document.querySelector('header, .main-header');
    if(!host) return;
    var old = document.getElementById('teacherProfileInline');
    if(old) old.remove();
    host.classList.add('teacher-header-host');
    var strip = document.createElement('div');
    strip.id = 'teacherProfileInline';
    strip.className = 'teacher-profile-inline';
    var cached = localStorage.getItem('teacher_photo_url') || '';
    var domPhoto = '';
    var dashImg = document.getElementById('teacherPhoto');
    if(dashImg && dashImg.src){
      domPhoto = dashImg.src;
    }
    var resolvedSrc = resolvePhotoUrl(profile.photo_url || cached || domPhoto);
    var safeSrc = resolvedSrc || DEFAULT_AVATAR;
    strip.innerHTML =
      '<img class="tp-avatar" src="' + escHtml(safeSrc) + '" onerror="this.onerror=null;this.src=\'' + DEFAULT_AVATAR + '\';">' +
      '<div class="tp-meta">' +
      '<div class="tp-name">' + escHtml(profile.name || 'Teacher') + '</div>' +
      '<div class="tp-sub">ID: ' + escHtml(profile.teacher_code || '-') + '</div>' +
      '</div>';
    if(current === 'teacher_leave.html' || current === 'teacher_my_classes.html'){
      strip.style.right = '16px';
    }
    host.appendChild(strip);
    // Force-apply cached photo if available (covers timing issues)
    try{
      var cachedNow = localStorage.getItem('teacher_photo_url') || '';
      if(cachedNow){
        var imgEl = strip.querySelector('.tp-avatar');
        if(imgEl) imgEl.src = cachedNow;
      }
    }catch(_e){}
  }

  function injectDashboardProfile(profile){
    // Disabled intentionally: profile is now shown inside blue dashboard header line.
  }

  async function resolveTeacherProfile(){
    var teacherId = localStorage.getItem('teacher_id') || '';
    var teacherName = localStorage.getItem('teacher_name') || 'Teacher';
    var teacherUsername = localStorage.getItem('teacher_username') || '';
    var teacherSession = localStorage.getItem('session') || '';

    // Do not override session here; use saved session from login/localStorage.

    var examTeacher = null;
    if(teacherId){
      examTeacher = await fetchJson(EXAM_API + '/teacher/' + encodeURIComponent(teacherId));
    }

    var profile = {
      name: (examTeacher && examTeacher.name) || teacherName,
      username: (examTeacher && examTeacher.username) || teacherUsername,
      session: (examTeacher && examTeacher.session) || teacherSession,
      teacher_code: (examTeacher && examTeacher.teacher_id) || '',
      photo_url: ''
    };

    var sCode = code4(profile.teacher_code);
    var sUser = norm(profile.username);
    var sName = norm(profile.name);

    var rows = [];
    var latestSession = '';
    try{
      var sRes = await fetchJson(EXAM_API + '/session/list');
      var sessions = sRes && Array.isArray(sRes.sessions) ? sRes.sessions : [];
      if(sessions.length){
        latestSession = String(sessions[sessions.length - 1] || '');
        profile.session = latestSession;
      }
    }catch(_e){}
    if(latestSession){
      for(var i=0;i<STUDENT_API_CANDIDATES.length;i++){
        var base = STUDENT_API_CANDIDATES[i];
        var data = await fetchJson(base + '/teachers?session=' + encodeURIComponent(latestSession));
        rows = Array.isArray(data) ? data : (data && Array.isArray(data.teachers) ? data.teachers : []);
        if(rows.length) break;
      }
    }

    if(rows.length){
      var matches = rows.filter(function(t){
        return (code4(t.teacher_code) === sCode) ||
               (norm(t.employee_id) === sUser) ||
               (norm(t.teacher_name) === sName) ||
               (norm(t.name) === sName) ||
               (normLoose(t.teacher_name) === normLoose(sName)) ||
               (normLoose(t.name) === normLoose(sName));
      });
      if(matches.length){
        var match = matches[0];
        var photo = match.photo_url || match.photo || match.photo_path || match.photo_filename || '';
        profile.photo_url = resolvePhotoUrl(photo) || '';
        try{
          if(profile.photo_url){
            localStorage.setItem('teacher_photo_url', profile.photo_url);
          }else{
            localStorage.removeItem('teacher_photo_url');
          }
        }catch(_e){}
        if(!profile.teacher_code) profile.teacher_code = match.teacher_code || '';
        if(match.session) profile.session = match.session;
      }else{
        try{ localStorage.removeItem('teacher_photo_url'); }catch(_e){}
      }
    }else{
      try{ localStorage.removeItem('teacher_photo_url'); }catch(_e){}
    }
    return profile;
  }

  async function resolveLatestTeacherId(profile){
    if(!profile || !profile.session) return;
    try{
      var list = await fetchJson(EXAM_API + '/teacher/list?session=' + encodeURIComponent(profile.session));
      var rows = list && Array.isArray(list.teachers) ? list.teachers : [];
      if(!rows.length) return;
      var tName = norm(profile.name);
      var tUser = norm(profile.username);
      var tCode = code4(profile.teacher_code);
      var rawId = String(localStorage.getItem('teacher_id') || '').trim();
      var by = rows.find(function(t){ return code4(t.teacher_id) === tCode && tCode; }) ||
               rows.find(function(t){ return norm(t.username) === tUser && tUser; }) ||
               rows.find(function(t){ return norm(t.name) === tName && tName; });
      if(!by && rawId){
        by = rows.find(function(t){ return String(t.id || '') === rawId; }) ||
             rows.find(function(t){ return code4(t.teacher_id) === code4(rawId); });
      }
      if(by && by.id){
        localStorage.setItem('teacher_id_latest', String(by.id));
        localStorage.setItem('teacher_latest_session', String(profile.session));
      }
    }catch(_e){}
  }

  var sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
  if(!sidebar) return;

  var overlay = document.getElementById('overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'overlay';
    document.body.appendChild(overlay);
  }

  if(!document.getElementById('teacher-shared-sidebar-style')){
    var style = document.createElement('style');
    style.id = 'teacher-shared-sidebar-style';
    style.textContent = [
      '.teacher-sidebar-shared{position:fixed !important;top:0 !important;left:-110vw !important;right:auto !important;transform:none !important;width:85vw !important;max-width:320px !important;height:100vh !important;',
      'background:linear-gradient(180deg,#233465 0%,#1b2a52 100%) !important;color:#fff !important;z-index:1200 !important;',
      'padding:16px 12px !important;box-shadow:6px 0 22px rgba(15,23,42,.25) !important;overflow-y:auto !important;transition:left .25s ease !important;visibility:hidden !important;pointer-events:none !important;}',
      '.teacher-sidebar-shared.is-open{left:0 !important;transform:none !important;}',
      '.teacher-sidebar-shared.is-open{visibility:visible !important;pointer-events:auto !important;}',
      '.teacher-sidebar-shared:not(.is-open){left:-110vw !important;transform:none !important;}',
      '.teacher-sidebar-shared h2{margin:0 6px 14px !important;padding:0 0 12px !important;border-bottom:1px solid rgba(255,255,255,.18) !important;font-size:18px !important;font-weight:700 !important;letter-spacing:.3px !important;color:#fff !important;text-align:center !important;}',
      '.teacher-sidebar-shared a{display:block !important;margin:3px 4px !important;padding:10px 12px !important;border-radius:10px !important;font-size:14px !important;font-weight:500 !important;line-height:1.25 !important;color:#fff !important;text-decoration:none !important;border:none !important;}',
      '.teacher-sidebar-shared a:hover{background:rgba(255,255,255,.14) !important;color:#fff !important;}',
      '.teacher-sidebar-shared a.active{background:rgba(255,255,255,.24) !important;color:#fff !important;font-weight:700 !important;}',
      '#overlay.teacher-overlay-shared{position:fixed !important;inset:0 !important;background:rgba(2,6,23,.45) !important;z-index:1100 !important;display:none !important;}',
      '#overlay.teacher-overlay-shared.active{display:block !important;}',
      '.content{margin-left:0 !important;width:100% !important;}',
      'header,.topbar{margin-left:0 !important;width:100% !important;padding-left:76px !important;}',
      '.teacher-menu-fab{position:fixed;top:14px;left:14px;width:42px;height:42px;border:none;border-radius:10px;background:#233465;color:#fff;font-size:24px;line-height:1;display:flex !important;align-items:center;justify-content:center;cursor:pointer;z-index:1301;box-shadow:0 8px 20px rgba(15,23,42,.35);}',
      '.teacher-menu-fab:hover{background:#1b2a52;}',
      '.menu-btn,#hamburger,.hamburger,.menu-icon{display:none !important;cursor:pointer;}',
      '@media (max-width:900px){body{overflow-x:hidden !important;} .content,.container,.main{margin-left:0 !important;width:100% !important;max-width:100% !important;padding:12px !important;} main{max-width:100% !important;} #tableContainer,.table-wrap{overflow:auto !important;-webkit-overflow-scrolling:touch !important;} table{min-width:600px;}}',
      '@media (max-width:600px){.teacher-sidebar-shared a{font-size:13px !important;padding:9px 10px !important;} .teacher-sidebar-shared h2{font-size:16px !important;} header,.topbar{padding-left:58px !important;} .teacher-menu-fab{width:38px;height:38px;font-size:20px;top:12px;left:12px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  sidebar.classList.add('teacher-sidebar-shared');
  overlay.classList.add('teacher-overlay-shared');

  var menuItems = [
    { href: 'teacher_dashboard.html', label: 'Dashboard' },
    { href: 'view_notices.html', label: 'Notices and Circular' },
    { href: 'teacher_my_classes.html', label: 'My Time Table' },
    { href: 'teacher_attendance.html', label: 'Upload Attendance' },
    { href: 'teacher_daily_work.html', label: 'Daily Work' },
    { href: 'teacher_view_datesheet.html', label: 'View Datesheet' },
    { href: 'teacher_papers.html', label: 'Question Papers' },
    { href: 'teacher_internal_marks_upload.html', label: 'Upload Internal Marks' },
    { href: 'teacher_marks_upload.html', label: 'Upload External Marks' },
    { href: 'teacher_leave.html', label: 'Leave Permission' },
    { href: 'teacher_incharge_students.html', label: 'My Incharge Students' }
  ];

  var current = currentPage();
  var html = '<h2>Teacher Menu</h2>';
  menuItems.forEach(function(item){
    var active = item.href.toLowerCase() === current ? ' class="active"' : '';
    html += '<a' + active + ' onclick="openPage(\'' + item.href + '\')">' + item.label + '</a>';
  });
  sidebar.innerHTML = html;

  function openMenu(){
    sidebar.classList.remove('open');
    sidebar.classList.remove('active');
    sidebar.classList.add('is-open');
    sidebar.style.left = '0';
    sidebar.style.transform = 'translateX(0)';
    overlay.classList.add('active');
  }

  function closeMenu(){
    sidebar.classList.remove('open');
    sidebar.classList.remove('active');
    sidebar.classList.remove('is-open');
    var off = (window.innerWidth <= 600) ? '-90vw' : '-320px';
    sidebar.style.left = off;
    sidebar.style.transform = 'translateX(0)';
    overlay.classList.remove('active');
  }

  function toggleMenu(){
    if(sidebar.classList.contains('is-open')) closeMenu(); else openMenu();
  }

  function openPage(p){
    location.href = p;
  }

  window.openMenu = openMenu;
  window.closeMenu = closeMenu;
  window.toggleMenu = toggleMenu;
  window.toggleSidebar = toggleMenu;
  window.openPage = openPage;

  overlay.onclick = closeMenu;

  document.addEventListener('click', function(e){
    if(!sidebar.classList.contains('is-open')) return;
    var clickedMenu = e.target.closest('.menu-btn, #hamburger, .hamburger, .menu-icon');
    if(clickedMenu) return;
    if(sidebar.contains(e.target)) return;
    closeMenu();
  });

  var fab = document.querySelector('.teacher-menu-fab');
  if(!fab){
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'teacher-menu-fab';
    fab.innerHTML = '&#9776;';
    fab.setAttribute('aria-label', 'Open menu');
    document.body.appendChild(fab);
  }
  fab.onclick = function(ev){ ev.stopPropagation(); toggleMenu(); };

  // Legacy page-level hamburger controls are hidden; shared FAB controls menu behavior.

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeMenu();
  });

  (async function(){
    ensureProfileStyles();
    var profile = await resolveTeacherProfile();
    injectHeaderProfile(profile);
    injectDashboardProfile(profile);
    resolveLatestTeacherId(profile);
    // Re-apply header photo after dashboard caches it.
    setTimeout(function(){
      var cached = localStorage.getItem('teacher_photo_url') || '';
      var img = document.querySelector('#teacherProfileInline .tp-avatar');
      if(!img) return;
      if(cached && img.src !== cached){
        img.src = cached;
      }
    }, 800);
  })();

  closeMenu();
})();
