(function(){
  var EXAM_API = 'https://exam-backend-117372286918.asia-south1.run.app';
  var STUDENT_API_CANDIDATES = [
    'https://student-backend-117372286918.asia-south1.run.app',
    'http://127.0.0.1:8080'
  ];
  var DEFAULT_AVATAR = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='260'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%236b7280' font-size='18'%3ENo%20Photo%3C/text%3E%3C/svg%3E";

  function escHtml(v){
    return String(v || '').replace(/[&<>"']/g, function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
    });
  }
  function norm(v){ return String(v || '').trim().toUpperCase(); }
  function code4(v){ return String(v || '').replace(/\D/g,'').padStart(4,'0').slice(-4); }

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
      '.teacher-header-host{position:relative !important;overflow:visible !important;padding-right:340px !important;}',
      '.teacher-profile-inline{position:absolute;right:520px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:8px;z-index:2;max-width:320px;}',
      '.teacher-profile-inline .tp-avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.7);background:#e5e7eb;}',
      '.teacher-profile-inline .tp-meta{line-height:1.15;text-align:left;min-width:0;}',
      '.teacher-profile-inline .tp-name{font-size:20px;font-weight:700;color:#fff;}',
      '.teacher-profile-inline .tp-sub{font-size:13px;color:rgba(255,255,255,.92);}',
      '@media (max-width:1000px){.teacher-header-host{padding-right:300px !important;} .teacher-profile-inline{right:290px;max-width:280px;}}',
      '@media (max-width:760px){.teacher-header-host{padding-right:220px !important;} .teacher-profile-inline{right:8px;gap:6px;max-width:210px;} .teacher-profile-inline .tp-avatar{width:34px;height:34px;}.teacher-profile-inline .tp-name{font-size:12px;}.teacher-profile-inline .tp-sub{font-size:10px;}}',
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
    strip.innerHTML =
      '<img class="tp-avatar" src="' + escHtml(profile.photo_url || DEFAULT_AVATAR) + '" onerror="this.onerror=null;this.src=\'' + DEFAULT_AVATAR + '\';">' +
      '<div class="tp-meta">' +
      '<div class="tp-name">' + escHtml(profile.name || 'Teacher') + '</div>' +
      '<div class="tp-sub">ID: ' + escHtml(profile.teacher_code || '-') + ' | Session: ' + escHtml(profile.session || '-') + '</div>' +
      '</div>';
    if(current === 'teacher_leave.html' || current === 'teacher_my_classes.html'){
      strip.style.right = '16px';
    }
    host.appendChild(strip);
  }

  function injectDashboardProfile(profile){
    // Disabled intentionally: profile is now shown inside blue dashboard header line.
  }

  async function resolveTeacherProfile(){
    var teacherId = localStorage.getItem('teacher_id') || '';
    var teacherName = localStorage.getItem('teacher_name') || 'Teacher';
    var teacherUsername = localStorage.getItem('teacher_username') || '';
    var teacherSession = localStorage.getItem('session') || '';

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
    for(var i=0;i<STUDENT_API_CANDIDATES.length;i++){
      var base = STUDENT_API_CANDIDATES[i];
      var data = await fetchJson(base + '/teachers?session=' + encodeURIComponent(profile.session || ''));
      rows = Array.isArray(data) ? data : (data && Array.isArray(data.teachers) ? data.teachers : []);
      if(rows.length) break;
    }

    if(rows.length){
      var match = rows.find(function(t){ return code4(t.teacher_code) === sCode; }) ||
                  rows.find(function(t){ return norm(t.employee_id) === sUser; }) ||
                  rows.find(function(t){ return norm(t.teacher_name) === sName; });
      if(match){
        profile.photo_url = String(match.photo_url || '').trim();
        if(!profile.teacher_code) profile.teacher_code = match.teacher_code || '';
      }
    }
    return profile;
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
      '.teacher-sidebar-shared{position:fixed !important;top:0 !important;left:-280px !important;width:260px !important;height:100vh !important;',
      'background:linear-gradient(180deg,#233465 0%,#1b2a52 100%) !important;color:#fff !important;z-index:1200 !important;',
      'padding:16px 12px !important;box-shadow:6px 0 22px rgba(15,23,42,.25) !important;overflow-y:auto !important;transition:left .25s ease !important;}',
      '.teacher-sidebar-shared.is-open{left:0 !important;}',
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
      '.menu-btn,#hamburger,.hamburger,.menu-icon{cursor:pointer;}',
      '@media (max-width:900px){body{overflow-x:hidden !important;} .content,.container,.main{margin-left:0 !important;width:100% !important;max-width:100% !important;padding:12px !important;} main{max-width:100% !important;} #tableContainer,.table-wrap{overflow:auto !important;-webkit-overflow-scrolling:touch !important;} table{min-width:600px;}}'
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
    { href: 'teacher_view_datesheet.html', label: 'View Datesheet' },
    { href: 'teacher_papers.html', label: 'Question Papers' },
    { href: 'teacher_internal_marks_upload.html', label: 'Upload Internal Marks' },
    { href: 'teacher_marks_upload.html', label: 'Upload External Marks' },
    { href: 'teacher_leave.html', label: 'Leave Permission' },
    { href: 'teacher_incharge_students.html', label: 'My Incharge Students' }
  ];

  var current = (location.pathname.split('/').pop() || '').toLowerCase();
  var html = '<h2>Teacher Menu</h2>';
  menuItems.forEach(function(item){
    var active = item.href.toLowerCase() === current ? ' class="active"' : '';
    html += '<a' + active + ' onclick="openPage(\'' + item.href + '\')">' + item.label + '</a>';
  });
  sidebar.innerHTML = html;

  function openMenu(){
    sidebar.classList.add('is-open');
    overlay.classList.add('active');
  }

  function closeMenu(){
    sidebar.classList.remove('is-open');
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

  // Keep legacy hamburger/menu controls functional on pages that still use them.
  var legacyBtns = document.querySelectorAll('.menu-btn, #hamburger, .hamburger, .menu-icon');
  legacyBtns.forEach(function(btn){
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      toggleMenu();
    });
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeMenu();
  });

  (async function(){
    ensureProfileStyles();
    var profile = await resolveTeacherProfile();
    injectHeaderProfile(profile);
    injectDashboardProfile(profile);
  })();

  closeMenu();
})();
