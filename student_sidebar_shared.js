(function(){
  var sidebar = document.getElementById('sidebar');
  if(!sidebar) return;

  if(!document.getElementById('student-shared-sidebar-style')){
    var style = document.createElement('style');
    style.id = 'student-shared-sidebar-style';
    style.textContent = [
      '.student-sidebar-shared{position:fixed !important;top:0 !important;left:-110vw !important;right:auto !important;transform:none !important;width:85vw !important;max-width:320px !important;height:100vh !important;',
      'background:#233465 !important;color:#fff !important;z-index:1200 !important;padding:16px 12px !important;box-shadow:6px 0 22px rgba(15,23,42,.25) !important;overflow-y:auto !important;transition:left .25s ease !important;visibility:hidden !important;pointer-events:none !important;}',
      '.student-sidebar-shared.is-open{left:0 !important;visibility:visible !important;pointer-events:auto !important;}',
      '.student-sidebar-shared h2{margin:0 6px 14px !important;padding:0 0 12px !important;border-bottom:1px solid rgba(255,255,255,.18) !important;font-size:18px !important;font-weight:700 !important;letter-spacing:.3px !important;color:#fff !important;text-align:center !important;}',
      '.student-sidebar-shared a{display:block !important;margin:3px 4px !important;padding:10px 12px !important;border-radius:10px !important;font-size:14px !important;font-weight:500 !important;line-height:1.25 !important;color:#fff !important;text-decoration:none !important;border:none !important;}',
      '.student-sidebar-shared a:hover{background:rgba(255,255,255,.14) !important;color:#fff !important;}',
      '.student-sidebar-shared a.active{background:rgba(255,255,255,.24) !important;color:#fff !important;font-weight:700 !important;}',
      '#overlay.student-overlay-shared{position:fixed !important;inset:0 !important;background:rgba(2,6,23,.45) !important;z-index:1100 !important;display:none !important;}',
      '#overlay.student-overlay-shared.active{display:block !important;}',
      '.menu-btn{display:none !important;}',
      '.student-menu-fab{position:fixed;top:14px;left:14px;width:42px;height:42px;border:none;border-radius:10px;background:#233465;color:#fff;font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:1301;box-shadow:0 8px 20px rgba(15,23,42,.35);}',
      '.student-menu-fab:hover{background:#1b2a52;}',
      '@media (max-width:600px){.student-menu-fab{width:38px;height:38px;font-size:20px;top:12px;left:12px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  var overlay = document.getElementById('overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
  }

  sidebar.classList.add('student-sidebar-shared');
  overlay.classList.add('student-overlay-shared');

  var menuItems = [
    { href: 'student_portal.html', label: 'Dashboard' },
    { href: 'student_timetable.html', label: 'Timetable' },
    { href: 'student_daily_work.html', label: 'Today Work' },
    { href: 'student_attendance.html', label: 'Attendance' },
    { href: 'student_exams.html', label: 'Exams' },
    { href: 'student_hall_ticket.html', label: 'Hall Ticket' },
    { href: 'student_results.html', label: 'Results' },
    { href: 'student_library.html', label: 'My Library' },
    { href: 'student_notices.html', label: 'Notices' },
    { href: 'student_academic_calendar.html', label: 'Academic Calendar' }
  ];

  var current = (location.pathname.split('/').pop() || '').toLowerCase();
  var html = '<h2>Student Menu</h2>';

  menuItems.forEach(function(item){
    var active = item.href.toLowerCase() === current ? ' class="active"' : '';
    html += '<a' + active + ' onclick="openPage(\'' + item.href + '\')">' + item.label + '</a>';

  });

  sidebar.innerHTML = html;

  function openMenu(){
    sidebar.classList.add('is-open');
    sidebar.style.left = '0';
    overlay.classList.add('active');
  }

  function closeMenu(){
    sidebar.classList.remove('is-open');
    sidebar.style.left = '-110vw';
    overlay.classList.remove('active');
  }

  function openPage(p){
    location.href = p;
  }

  window.openMenu = openMenu;
  window.closeMenu = closeMenu;
  window.openPage = openPage;

  overlay.onclick = closeMenu;

  var fab = document.querySelector('.student-menu-fab');
  if(!fab){
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'student-menu-fab';
    fab.innerHTML = '&#9776;';
    fab.setAttribute('aria-label', 'Open menu');
    document.body.appendChild(fab);
  }
  fab.onclick = function(ev){ ev.stopPropagation(); openMenu(); };

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeMenu();
  });
})();
