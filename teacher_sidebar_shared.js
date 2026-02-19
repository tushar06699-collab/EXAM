(function(){
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
      '#overlay.teacher-overlay-shared.active{display:block !important;}','.content{margin-left:0 !important;width:100% !important;}','header,.topbar{margin-left:0 !important;width:100% !important;padding-left:76px !important;}','.teacher-menu-fab{position:fixed;top:14px;left:14px;width:42px;height:42px;border:none;border-radius:10px;background:#233465;color:#fff;font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:1301;box-shadow:0 8px 20px rgba(15,23,42,.35);}','.teacher-menu-fab:hover{background:#1b2a52;}','.menu-btn, #hamburger, .hamburger, .menu-icon{display:none !important;}'
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
    { href: 'teacher_leave.html', label: 'Leave Permission' }
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

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeMenu();
  });

  closeMenu();
})();
