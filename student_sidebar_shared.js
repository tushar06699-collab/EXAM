(function(){
  var sidebar = document.getElementById('sidebar');
  if(!sidebar) return;

  var overlay = document.getElementById('overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
  }

  var menuItems = [
    { href: 'student_portal.html', label: 'Dashboard' },
    { href: 'student_results.html', label: 'Results' },
    { href: 'student_timetable.html', label: 'Timetable' },
    { href: 'student_exams.html', label: 'Exams' },
    { href: 'student_hall_ticket.html', label: 'Hall Ticket' },
    { href: 'student_attendance.html', label: 'Attendance' },
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
    sidebar.style.left = '0';
    overlay.style.display = 'block';
  }

  function closeMenu(){
    sidebar.style.left = '-280px';
    overlay.style.display = 'none';
  }

  function openPage(p){
    location.href = p;
  }

  window.openMenu = openMenu;
  window.closeMenu = closeMenu;
  window.openPage = openPage;

  overlay.onclick = closeMenu;

  document.querySelectorAll('.menu-btn').forEach(function(btn){
    btn.innerHTML = '&#9776;';
    btn.onclick = openMenu;
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeMenu();
  });
})();
