// ============================================================
// AMF Admin Panel — admin.js
// Vanilla JS, no framework, no dependencies
// ============================================================

// ── Constants ────────────────────────────────────────────────

// Password is "amf2026admin" — hash computed at runtime via Web Crypto API
// Change the literal in getExpectedHash() to update the password.

// URL Junior Combative — update when deployed
const JUNIOR_COMBATIVE_URL = 'http://localhost:5173';

// ── Supabase Config ──────────────────────────────────────────
const SUPABASE_URL  = 'https://enkwnelkwlvlyjvbwyzq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVua3duZWxrd2x2bHlqdmJ3eXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMzU1MjgsImV4cCI6MjA4NDYxMTUyOH0.SzvyfEQGjfav927--cYQZVF8jJ47B6V9jHrNh6KuT6M';

let currentSessionId = null; // set on load

async function sbRequest(table, method, body, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${SUPABASE_ANON}`,
    'Content-Type': 'application/json',
    'Accept-Profile': 'dojo',
    'Content-Profile': 'dojo',
  };
  if (method === 'POST') {
    headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
  } else if (method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  } else if (method === 'DELETE') {
    headers['Prefer'] = 'return=minimal';
  }
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${table}: ${res.status} — ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : null;
}

async function sbGet(table, query) {
  return sbRequest(table, 'GET', null, `?${query}`);
}

const DISCIPLINES = {
  jiujitsu:  { label: "Jiu-Jitsu d'autodéfense", color: '#c9a227' },
  muaythai:  { label: 'Muay Thai',               color: '#dc2626' },
  superkids: { label: 'Programme Superkids',      color: '#22d3ee' },
  gracie:    { label: 'Gracie Jiu-Jitsu',         color: '#2563eb' },
};

const EVENT_TYPE_LABELS = {
  passage_grades: 'Passage de grades',
  stage:          'Stage',
  portes_ouvertes:'Portes ouvertes',
  autre:          'Autre',
};

const ANNOUNCEMENT_TYPE_LABELS = {
  info:      'Info',
  warning:   'Avertissement',
  important: 'Important',
};

const DEFAULT_SCHEDULE_DAYS = [
  { day: 'Dimanche', dayShort: 'Dim', dayIndex: 0, classes: [] },
  { day: 'Lundi',    dayShort: 'Lun', dayIndex: 1, classes: [] },
  { day: 'Mardi',    dayShort: 'Mar', dayIndex: 2, classes: [] },
  { day: 'Mercredi', dayShort: 'Mer', dayIndex: 3, classes: [] },
  { day: 'Jeudi',    dayShort: 'Jeu', dayIndex: 4, classes: [] },
  { day: 'Vendredi', dayShort: 'Ven', dayIndex: 5, classes: [] },
  { day: 'Samedi',   dayShort: 'Sam', dayIndex: 6, classes: [] },
];

// ── App State ────────────────────────────────────────────────

let data = null;
let dateRanges = []; // schedule_date_ranges from Supabase
let hasUnsavedChanges = false;
let toastTimer = null;

// ── Data Loading ─────────────────────────────────────────────

async function loadData() {
  try {
    console.log('📡 Loading from Supabase...');
    data = await loadFromSupabase();
    console.log('✅ Supabase data loaded:', data);
    showToast('Horaire chargé depuis Supabase', 'success');
  } catch (err) {
    console.error('❌ Supabase load failed:', err.message);
    try {
      console.log('📄 Trying schedule.json...');
      const res = await fetch('schedule.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = normalizeData(await res.json());
      console.log('✅ schedule.json loaded');
      showToast('Horaire chargé depuis schedule.json (Supabase indisponible)', 'warning');
    } catch (err2) {
      console.error('❌ schedule.json also failed:', err2.message);
      data = getEmptyData();
      console.log('⚠️ Using empty data');
      showToast('Démarrage en mode vide — importez un JSON ou créez l\'horaire', 'warning');
    }
  }
  console.log('🎨 Rendering all tabs...');
  renderAll();
}

async function loadFromSupabase() {
  const [sessions, courses, holidays, events, announcements] = await Promise.all([
    sbGet('schedule_sessions', 'select=*&order=start_date.desc'),
    sbGet('schedule_courses', 'is_active=eq.true&order=day_index,sort_order'),
    sbGet('schedule_holidays', 'select=*'),
    sbGet('schedule_events', 'select=*'),
    sbGet('schedule_announcements', 'select=*'),
  ]);
  // Fetch date ranges separately — table may not exist yet (pre-migration)
  let ranges = [];
  try { ranges = await sbGet('schedule_date_ranges', 'select=*&order=sort_order'); } catch { }

  // Use first session (newest), or if marked as current, use that one
  let session = sessions.find(s => s.is_current) || sessions[0];
  if (!session) throw new Error('No sessions found');
  currentSessionId = session.id;

  const sid = session.id;
  const sessHolidays = holidays.filter(h => h.session_id === sid);
  const sessEvents = events.filter(e => e.session_id === sid);
  const sessAnn = announcements.filter(a => a.session_id === sid);

  // Store date ranges globally
  dateRanges = (ranges || []).filter(r => r.session_id === sid).map(r => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    sortOrder: r.sort_order || 0,
  }));

  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const dayShorts = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const schedule = dayNames.map((day, i) => ({
    day,
    dayShort: dayShorts[i],
    dayIndex: i,
    classes: courses
      .filter(c => c.day_index === i)
      .map(c => ({
        id: c.id,
        time: `${c.start_time} - ${c.end_time}`,
        startTime: c.start_time,
        endTime: c.end_time,
        name: c.name,
        description: c.description || '',
        ageGroup: c.age_group || '',
        discipline: c.discipline,
        duration: calcDuration(c.start_time, c.end_time),
        dateRangeId: c.date_range_id || '',
      })),
  }));

  return {
    academy: 'Académie d\'Arts Martiaux Familial',
    session: session.name,
    sessionStart: session.start_date,
    sessionEnd: session.end_date,
    updated: today(),
    contact: {
      email: 'info@academie-amf.com',
      phone: '',
      address: '129 avenue Principale, Rouyn-Noranda (Québec) J9X 4P3 — Sous-sol, 3e studio',
    },
    announcements: sessAnn.map(a => ({
      id: a.id,
      text: a.title,
      type: a.type || 'info',
      active: a.is_active !== false,
    })),
    disciplines: { ...DISCIPLINES },
    holidays: sessHolidays.map(h => ({
      id: h.id,
      date: h.date,
      endDate: h.end_date || undefined,
      name: h.label || '',
    })),
    events: sessEvents.map(e => ({
      id: e.id,
      date: e.date,
      endDate: e.end_date || undefined,
      name: e.title,
      description: e.description || '',
      type: e.event_type || 'autre',
      important: e.importance === 'high',
    })),
    schedule,
  };
}

function normalizeData(json) {
  // Ensure all 7 days exist in order
  const days = DEFAULT_SCHEDULE_DAYS.map(def => {
    const existing = (json.schedule || []).find(d => d.dayIndex === def.dayIndex);
    return existing ? { ...def, classes: existing.classes || [] } : { ...def };
  });
  return {
    academy:      json.academy      || 'Académie d\'Arts Martiaux Familial',
    session:      json.session      || '',
    sessionStart: json.sessionStart || '',
    sessionEnd:   json.sessionEnd   || '',
    updated:      json.updated      || today(),
    contact: {
      email:   (json.contact || {}).email   || '',
      phone:   (json.contact || {}).phone   || '',
      address: (json.contact || {}).address || '',
    },
    announcements: json.announcements || [],
    disciplines:   json.disciplines   || DISCIPLINES,
    holidays:      json.holidays      || [],
    events:        json.events        || [],
    schedule:      days,
  };
}

function getEmptyData() {
  return {
    academy:       'Académie d\'Arts Martiaux Familial',
    session:       '',
    sessionStart:  '',
    sessionEnd:    '',
    updated:       today(),
    contact:       { email: '', phone: '', address: '' },
    announcements: [],
    disciplines:   { ...DISCIPLINES },
    holidays:      [],
    events:        [],
    schedule:      DEFAULT_SCHEDULE_DAYS.map(d => ({ ...d, classes: [] })),
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Unsaved Changes ──────────────────────────────────────────

function markUnsaved() {
  hasUnsavedChanges = true;
  document.getElementById('unsavedIndicator').classList.remove('hidden');
  document.getElementById('unsavedIndicator').classList.add('flex');
}

function markSaved() {
  hasUnsavedChanges = false;
  document.getElementById('unsavedIndicator').classList.add('hidden');
  document.getElementById('unsavedIndicator').classList.remove('flex');
}

// ── Toast ────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const colors = { success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-blue-600' };
  const toast = document.getElementById('toast');
  const inner = document.getElementById('toastInner');
  const msgEl = document.getElementById('toastMsg');
  inner.className = `flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white min-w-[200px] ${colors[type] || colors.info}`;
  msgEl.textContent = msg;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── Tab Navigation ───────────────────────────────────────────

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(btn.dataset.tab); }
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('tab-active', b.dataset.tab === tabId);
    b.classList.toggle('tab-inactive', b.dataset.tab !== tabId);
  });
  document.querySelectorAll('.tab-content').forEach(s => {
    s.classList.toggle('hidden', s.id !== 'tab-' + tabId);
  });
}

// ── Render All ───────────────────────────────────────────────

function renderAll() {
  renderSchedule();
  renderHolidays();
  renderEvents();
  renderParams();
  renderAnnouncements();
  renderDateRanges();
}

// ── SCHEDULE (Tab 1) ─────────────────────────────────────────

function renderSchedule() {
  const container = document.getElementById('scheduleAccordion');
  container.innerHTML = '';
  (data.schedule || []).forEach(dayObj => {
    container.appendChild(buildDayCard(dayObj));
  });
}

function buildDayCard(dayObj) {
  const card = document.createElement('div');
  card.className = 'bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden';
  card.dataset.dayIndex = dayObj.dayIndex;

  const classes = dayObj.classes || [];
  const sorted  = [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Header
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between px-4 py-3 cursor-pointer select-none bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition';
  header.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="font-bold text-gray-800">${dayObj.day}</span>
      <span class="text-xs text-gray-400 font-normal">${classes.length} cours</span>
    </div>
    <div class="flex items-center gap-2">
      <button class="add-course-btn bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-3 py-1 rounded-lg transition" data-day="${dayObj.dayIndex}">+ Cours</button>
      <svg class="accordion-arrow w-4 h-4 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </div>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'accordion-body';

  if (sorted.length === 0) {
    body.innerHTML = `<div class="px-4 py-6 text-center text-sm text-gray-400">Aucun cours ce jour.</div>`;
  } else {
    const table = document.createElement('div');
    table.className = 'overflow-x-auto';
    table.innerHTML = `
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100">
            <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Heure</th>
            <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Nom</th>
            <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs hidden md:table-cell">Description</th>
            <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs hidden sm:table-cell">Âge</th>
            <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Discipline</th>
            <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs hidden sm:table-cell">Durée</th>
            <th class="text-right px-4 py-2 font-semibold text-gray-500 text-xs">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(cls => buildCourseRow(cls, dayObj.dayIndex)).join('')}
        </tbody>
      </table>
    `;
    body.appendChild(table);
  }

  card.appendChild(header);
  card.appendChild(body);

  // Accordion toggle
  header.addEventListener('click', e => {
    if (e.target.closest('.add-course-btn')) return;
    body.classList.toggle('hidden');
    header.querySelector('.accordion-arrow').classList.toggle('rotate-180');
  });

  // Add course button
  header.querySelector('.add-course-btn').addEventListener('click', e => {
    e.stopPropagation();
    openCourseModal(null, dayObj.dayIndex);
  });

  // Edit / Delete buttons
  body.querySelectorAll('.edit-course-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = findCourse(dayObj.dayIndex, btn.dataset.id);
      if (cls) openCourseModal(cls, dayObj.dayIndex);
    });
  });
  body.querySelectorAll('.delete-course-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer ce cours ?')) {
        deleteCourse(dayObj.dayIndex, btn.dataset.id);
      }
    });
  });

  return card;
}

function buildCourseRow(cls, dayIndex) {
  const disc = DISCIPLINES[cls.discipline] || { label: cls.discipline, color: '#9ca3af' };
  return `
    <tr class="border-b border-gray-50 hover:bg-gray-50 transition border-l-4 border-discipline-${cls.discipline}" style="border-left-color:${disc.color}">
      <td class="px-4 py-2 whitespace-nowrap text-gray-700">${escHtml(cls.time || '')}</td>
      <td class="px-4 py-2 font-medium text-gray-900">${escHtml(cls.name || '')}</td>
      <td class="px-4 py-2 text-gray-500 hidden md:table-cell">${escHtml(cls.description || '')}</td>
      <td class="px-4 py-2 text-gray-500 hidden sm:table-cell">${escHtml(cls.ageGroup || '')}</td>
      <td class="px-4 py-2">
        <span class="inline-flex items-center gap-1">
          <span class="discipline-dot" style="background:${disc.color}"></span>
          <span class="text-gray-600 text-xs hidden lg:inline">${escHtml(disc.label)}</span>
        </span>
      </td>
      <td class="px-4 py-2 text-gray-500 hidden sm:table-cell">${escHtml(cls.duration || '')}</td>
      <td class="px-4 py-2 text-right whitespace-nowrap">
        <button class="edit-course-btn text-blue-600 hover:text-blue-800 text-xs font-semibold mr-2" data-id="${escHtml(cls.id)}" data-day="${dayIndex}">Modifier</button>
        <button class="delete-course-btn text-red-500 hover:text-red-700 text-xs font-semibold" data-id="${escHtml(cls.id)}" data-day="${dayIndex}">Supprimer</button>
      </td>
    </tr>
  `;
}

function findCourse(dayIndex, id) {
  const day = data.schedule.find(d => d.dayIndex === dayIndex);
  return day ? (day.classes || []).find(c => c.id === id) : null;
}

async function deleteCourse(dayIndex, id) {
  const day = data.schedule.find(d => d.dayIndex === dayIndex);
  if (!day) return;
  day.classes = (day.classes || []).filter(c => c.id !== id);
  renderSchedule();

  try {
    await sbRequest('schedule_courses', 'DELETE', null, `?id=eq.${encodeURIComponent(id)}`);
    showToast('Cours supprimé', 'success');
    markSaved();
  } catch (err) {
    console.error('Supabase delete failed:', err);
    showToast('Supprimé localement (erreur Supabase)', 'warning');
    markUnsaved();
  }
}

// ── Course Modal ─────────────────────────────────────────────

function openCourseModal(cls, dayIndex) {
  const modal = document.getElementById('courseModal');
  document.getElementById('courseModalTitle').textContent = cls ? 'Modifier le cours' : 'Ajouter un cours';
  document.getElementById('courseId').value       = cls ? cls.id        : '';
  document.getElementById('courseDayIndex').value = dayIndex;
  document.getElementById('courseName').value        = cls ? cls.name        : '';
  document.getElementById('courseStartTime').value   = cls ? cls.startTime   : '';
  document.getElementById('courseEndTime').value     = cls ? cls.endTime     : '';
  document.getElementById('courseDescription').value = cls ? cls.description : '';
  document.getElementById('courseAgeGroup').value    = cls ? cls.ageGroup    : '';
  document.getElementById('courseDiscipline').value  = cls ? cls.discipline  : '';
  document.getElementById('courseDuration').value    = cls ? cls.duration    : '';

  // Populate date range dropdown
  const drSelect = document.getElementById('courseDateRange');
  drSelect.innerHTML = '<option value="">— Session principale —</option>';
  for (const dr of dateRanges) {
    drSelect.innerHTML += `<option value="${escHtml(dr.id)}">${escHtml(dr.name)} (${formatDate(dr.startDate)} – ${formatDate(dr.endDate)})</option>`;
  }
  drSelect.value = cls ? (cls.dateRangeId || '') : '';

  updateDurationDisplay();
  modal.classList.remove('hidden');
  document.getElementById('courseName').focus();
}

function closeCourseModal() {
  document.getElementById('courseModal').classList.add('hidden');
}

function updateDurationDisplay() {
  const start = document.getElementById('courseStartTime').value;
  const end   = document.getElementById('courseEndTime').value;
  document.getElementById('courseDuration').value = calcDuration(start, end);
}

function calcDuration(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return '';
  if (diff % 60 === 0) return `${diff / 60}h`;
  if (diff > 60) return `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`;
  return `${diff} min`;
}

async function saveCourse() {
  const name        = document.getElementById('courseName').value.trim();
  const startTime   = document.getElementById('courseStartTime').value;
  const endTime     = document.getElementById('courseEndTime').value;
  const desc        = document.getElementById('courseDescription').value.trim();
  const ageGroup    = document.getElementById('courseAgeGroup').value.trim();
  const discipline  = document.getElementById('courseDiscipline').value;
  const dateRangeId = document.getElementById('courseDateRange').value;
  const dayIndex    = parseInt(document.getElementById('courseDayIndex').value, 10);
  const id          = document.getElementById('courseId').value;

  if (!name)       { showToast('Le nom du cours est requis.', 'error'); return; }
  if (!startTime)  { showToast('L\'heure de début est requise.', 'error'); return; }
  if (!endTime)    { showToast('L\'heure de fin est requise.', 'error'); return; }
  if (!discipline) { showToast('La discipline est requise.', 'error'); return; }

  const duration = calcDuration(startTime, endTime);
  const time     = `${startTime} - ${endTime}`;
  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  const day = data.schedule.find(d => d.dayIndex === dayIndex);
  if (!day) return;

  const courseId = id || ('c' + Date.now());
  const localCourse = { id: courseId, time, startTime, endTime, name, description: desc, ageGroup, discipline, duration, dateRangeId };

  if (id) {
    const idx = day.classes.findIndex(c => c.id === id);
    if (idx !== -1) day.classes[idx] = localCourse;
  } else {
    day.classes.push(localCourse);
  }

  closeCourseModal();
  renderSchedule();

  // Persist to Supabase
  try {
    await sbRequest('schedule_courses', 'POST', [{
      id: courseId,
      day: dayNames[dayIndex],
      day_index: dayIndex,
      start_time: startTime,
      end_time: endTime,
      name,
      description: desc,
      age_group: ageGroup,
      discipline,
      date_range_id: dateRangeId || null,
      is_active: true,
      sort_order: day.classes.length - 1,
    }]);
    showToast(id ? 'Cours mis à jour' : 'Cours ajouté', 'success');
    markSaved();
  } catch (err) {
    console.error('Supabase save failed:', err);
    showToast('Sauvegardé localement (erreur Supabase)', 'warning');
    markUnsaved();
  }
}

// ── HOLIDAYS (Tab 2) ─────────────────────────────────────────

function renderHolidays() {
  const tbody = document.getElementById('holidaysTableBody');
  if (!data.holidays || data.holidays.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">Aucun congé</td></tr>';
    return;
  }
  const sorted = [...data.holidays].sort((a, b) => a.date.localeCompare(b.date));
  tbody.innerHTML = sorted.map(h => `
    <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
      <td class="px-4 py-3 text-gray-700">${formatDate(h.date)}</td>
      <td class="px-4 py-3 text-gray-700">${h.endDate ? formatDate(h.endDate) : '—'}</td>
      <td class="px-4 py-3 font-medium text-gray-900">${escHtml(h.name)}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button class="edit-holiday-btn text-blue-600 hover:text-blue-800 text-xs font-semibold mr-2" data-id="${escHtml(h.id)}">Modifier</button>
        <button class="delete-holiday-btn text-red-500 hover:text-red-700 text-xs font-semibold" data-id="${escHtml(h.id)}">Supprimer</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-holiday-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = data.holidays.find(x => x.id === btn.dataset.id);
      if (h) openHolidayModal(h);
    });
  });
  tbody.querySelectorAll('.delete-holiday-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer ce congé ?')) {
        const hid = btn.dataset.id;
        data.holidays = data.holidays.filter(x => x.id !== hid);
        renderHolidays();
        try {
          await sbRequest('schedule_holidays', 'DELETE', null, `?id=eq.${encodeURIComponent(hid)}`);
          showToast('Congé supprimé', 'success');
          markSaved();
        } catch (err) {
          console.error('Supabase delete failed:', err);
          showToast('Supprimé localement (erreur Supabase)', 'warning');
          markUnsaved();
        }
      }
    });
  });
}

function openHolidayModal(h) {
  document.getElementById('holidayModalTitle').textContent = h ? 'Modifier le congé' : 'Ajouter un congé';
  document.getElementById('holidayId').value      = h ? h.id      : '';
  document.getElementById('holidayDate').value    = h ? h.date    : '';
  document.getElementById('holidayEndDate').value = h ? (h.endDate || '') : '';
  document.getElementById('holidayName').value    = h ? h.name    : '';
  document.getElementById('holidayModal').classList.remove('hidden');
  document.getElementById('holidayName').focus();
}

function closeHolidayModal() {
  document.getElementById('holidayModal').classList.add('hidden');
}

async function saveHoliday() {
  const id      = document.getElementById('holidayId').value;
  const date    = document.getElementById('holidayDate').value;
  const endDate = document.getElementById('holidayEndDate').value;
  const name    = document.getElementById('holidayName').value.trim();

  if (!date) { showToast('La date de début est requise.', 'error'); return; }
  if (!name) { showToast('Le nom/raison est requis.', 'error'); return; }

  const entry = { id: id || ('h' + Date.now()), date, name };
  if (endDate) entry.endDate = endDate;

  if (id) {
    const idx = data.holidays.findIndex(h => h.id === id);
    if (idx !== -1) data.holidays[idx] = entry;
  } else {
    data.holidays.push(entry);
  }

  closeHolidayModal();
  renderHolidays();

  // Persist to Supabase
  try {
    const row = { session_id: currentSessionId, date, end_date: endDate || null, label: name };
    if (id) {
      await sbRequest('schedule_holidays', 'PATCH', row, `?id=eq.${encodeURIComponent(id)}`);
    } else {
      const result = await sbRequest('schedule_holidays', 'POST', [row]);
      if (result && result[0]) {
        // Update local ID with Supabase UUID
        const localEntry = data.holidays[data.holidays.length - 1];
        localEntry.id = result[0].id;
      }
    }
    showToast(id ? 'Congé mis à jour' : 'Congé ajouté', 'success');
    markSaved();
  } catch (err) {
    console.error('Supabase save failed:', err);
    showToast('Sauvegardé localement (erreur Supabase)', 'warning');
    markUnsaved();
  }
}

// ── EVENTS (Tab 3) ───────────────────────────────────────────

function renderEvents() {
  const tbody = document.getElementById('eventsTableBody');
  if (!data.events || data.events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">Aucun événement</td></tr>';
    return;
  }
  const sorted = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  tbody.innerHTML = sorted.map(e => {
    const dateDisplay = e.endDate && e.endDate !== e.date
      ? `${formatDate(e.date)} → ${formatDate(e.endDate)}`
      : formatDate(e.date);
    return `
    <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
      <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${dateDisplay}</td>
      <td class="px-4 py-3 font-medium text-gray-900">${escHtml(e.name)}</td>
      <td class="px-4 py-3 text-gray-600 text-xs">${escHtml(EVENT_TYPE_LABELS[e.type] || e.type)}</td>
      <td class="px-4 py-3">
        ${e.important ? '<span class="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">Oui</span>' : '<span class="text-gray-400 text-xs">—</span>'}
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button class="edit-event-btn text-blue-600 hover:text-blue-800 text-xs font-semibold mr-2" data-id="${escHtml(e.id)}">Modifier</button>
        <button class="delete-event-btn text-red-500 hover:text-red-700 text-xs font-semibold" data-id="${escHtml(e.id)}">Supprimer</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.edit-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = data.events.find(x => x.id === btn.dataset.id);
      if (ev) openEventModal(ev);
    });
  });
  tbody.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
        const eid = btn.dataset.id;
        data.events = data.events.filter(x => x.id !== eid);
        renderEvents();
        try {
          await sbRequest('schedule_events', 'DELETE', null, `?id=eq.${encodeURIComponent(eid)}`);
          showToast('Événement supprimé', 'success');
          markSaved();
        } catch (err) {
          console.error('Supabase delete failed:', err);
          showToast('Supprimé localement (erreur Supabase)', 'warning');
          markUnsaved();
        }
      }
    });
  });
}

function openEventModal(ev) {
  document.getElementById('eventModalTitle').textContent = ev ? 'Modifier l\'événement' : 'Ajouter un événement';
  document.getElementById('eventId').value          = ev ? ev.id          : '';
  document.getElementById('eventDate').value        = ev ? ev.date        : '';
  document.getElementById('eventEndDate').value     = ev ? (ev.endDate || '') : '';
  document.getElementById('eventName').value        = ev ? ev.name        : '';
  document.getElementById('eventDescription').value = ev ? (ev.description || '') : '';
  document.getElementById('eventType').value        = ev ? (ev.type || 'autre') : 'autre';
  document.getElementById('eventImportant').checked = ev ? !!ev.important  : false;
  document.getElementById('eventModal').classList.remove('hidden');
  document.getElementById('eventName').focus();
}

function closeEventModal() {
  document.getElementById('eventModal').classList.add('hidden');
}

async function saveEvent() {
  const id          = document.getElementById('eventId').value;
  const date        = document.getElementById('eventDate').value;
  const endDate     = document.getElementById('eventEndDate').value;
  const name        = document.getElementById('eventName').value.trim();
  const description = document.getElementById('eventDescription').value.trim();
  const type        = document.getElementById('eventType').value;
  const important   = document.getElementById('eventImportant').checked;

  if (!date) { showToast('La date de début est requise.', 'error'); return; }
  if (!name) { showToast('Le nom est requis.', 'error'); return; }

  const entry = { id: id || ('e' + Date.now()), date, name, description, type, important };
  if (endDate) entry.endDate = endDate;

  if (id) {
    const idx = data.events.findIndex(e => e.id === id);
    if (idx !== -1) data.events[idx] = entry;
  } else {
    data.events.push(entry);
  }

  closeEventModal();
  renderEvents();

  // Persist to Supabase
  try {
    const row = {
      session_id: currentSessionId,
      title: name,
      date,
      end_date: endDate || null,
      description,
      event_type: type,
      importance: important ? 'high' : 'normal',
    };
    if (id) {
      await sbRequest('schedule_events', 'PATCH', row, `?id=eq.${encodeURIComponent(id)}`);
    } else {
      const result = await sbRequest('schedule_events', 'POST', [row]);
      if (result && result[0]) {
        const localEntry = data.events[data.events.length - 1];
        localEntry.id = result[0].id;
      }
    }
    showToast(id ? 'Événement mis à jour' : 'Événement ajouté', 'success');
    markSaved();
  } catch (err) {
    console.error('Supabase save failed:', err);
    showToast('Sauvegardé localement (erreur Supabase)', 'warning');
    markUnsaved();
  }
}

// ── PARAMS (Tab 4) ───────────────────────────────────────────

function renderParams() {
  document.getElementById('paramAcademy').value      = data.academy      || '';
  document.getElementById('paramSession').value      = data.session      || '';
  document.getElementById('paramSessionStart').value = data.sessionStart || '';
  document.getElementById('paramSessionEnd').value   = data.sessionEnd   || '';
  document.getElementById('paramEmail').value        = (data.contact || {}).email   || '';
  document.getElementById('paramPhone').value        = (data.contact || {}).phone   || '';
  document.getElementById('paramAddress').value      = (data.contact || {}).address || '';
  renderAnnouncements();
}

async function saveParams() {
  data.academy      = document.getElementById('paramAcademy').value.trim();
  data.session      = document.getElementById('paramSession').value.trim();
  data.sessionStart = document.getElementById('paramSessionStart').value;
  data.sessionEnd   = document.getElementById('paramSessionEnd').value;
  data.contact = {
    email:   document.getElementById('paramEmail').value.trim(),
    phone:   document.getElementById('paramPhone').value.trim(),
    address: document.getElementById('paramAddress').value.trim(),
  };

  // Persist session to Supabase
  if (currentSessionId) {
    try {
      await sbRequest('schedule_sessions', 'PATCH', {
        name: data.session,
        start_date: data.sessionStart,
        end_date: data.sessionEnd,
      }, `?id=eq.${encodeURIComponent(currentSessionId)}`);
      showToast('Paramètres enregistrés dans Supabase', 'success');
      markSaved();
    } catch (err) {
      console.error('Supabase save failed:', err);
      showToast('Paramètres sauvegardés localement (erreur Supabase)', 'warning');
      markUnsaved();
    }
  } else {
    showToast('Paramètres enregistrés localement', 'success');
    markUnsaved();
  }
}

// ── ANNOUNCEMENTS ────────────────────────────────────────────

function renderAnnouncements() {
  const list   = document.getElementById('announcementsList');
  const noMsg  = document.getElementById('noAnnouncements');
  const ann    = data.announcements || [];

  if (ann.length === 0) {
    list.innerHTML = '';
    noMsg.classList.remove('hidden');
    return;
  }
  noMsg.classList.add('hidden');
  list.innerHTML = ann.map(a => {
    const typeColors = { info: 'bg-blue-50 border-blue-200 text-blue-800', warning: 'bg-amber-50 border-amber-200 text-amber-800', important: 'bg-red-50 border-red-200 text-red-800' };
    const color = typeColors[a.type] || typeColors.info;
    return `
      <div class="flex items-start gap-3 border rounded-lg px-3 py-2 ${color}">
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold mb-0.5">${ANNOUNCEMENT_TYPE_LABELS[a.type] || a.type}</div>
          <div class="text-sm">${escHtml(a.text)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <label class="flex items-center gap-1 text-xs cursor-pointer" title="Active">
            <input type="checkbox" class="ann-active-toggle w-3.5 h-3.5" data-id="${escHtml(a.id)}" ${a.active ? 'checked' : ''} />
            <span class="hidden sm:inline">Active</span>
          </label>
          <button class="edit-ann-btn text-xs font-semibold underline" data-id="${escHtml(a.id)}">Modifier</button>
          <button class="delete-ann-btn text-xs font-semibold underline text-red-600" data-id="${escHtml(a.id)}">Supprimer</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.ann-active-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const a = data.announcements.find(x => x.id === chk.dataset.id);
      if (a) {
        a.active = chk.checked;
        try {
          await sbRequest('schedule_announcements', 'PATCH', { is_active: chk.checked }, `?id=eq.${encodeURIComponent(a.id)}`);
          markSaved();
        } catch (err) {
          console.error('Supabase toggle failed:', err);
          markUnsaved();
        }
      }
    });
  });
  list.querySelectorAll('.edit-ann-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = data.announcements.find(x => x.id === btn.dataset.id);
      if (a) openAnnouncementModal(a);
    });
  });
  list.querySelectorAll('.delete-ann-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Supprimer cette annonce ?')) {
        const aid = btn.dataset.id;
        data.announcements = data.announcements.filter(x => x.id !== aid);
        renderAnnouncements();
        try {
          await sbRequest('schedule_announcements', 'DELETE', null, `?id=eq.${encodeURIComponent(aid)}`);
          showToast('Annonce supprimée', 'success');
          markSaved();
        } catch (err) {
          console.error('Supabase delete failed:', err);
          showToast('Supprimée localement (erreur Supabase)', 'warning');
          markUnsaved();
        }
      }
    });
  });
}

function openAnnouncementModal(a) {
  document.getElementById('announcementModalTitle').textContent = a ? 'Modifier l\'annonce' : 'Ajouter une annonce';
  document.getElementById('announcementId').value     = a ? a.id     : '';
  document.getElementById('announcementText').value   = a ? a.text   : '';
  document.getElementById('announcementType').value   = a ? a.type   : 'info';
  document.getElementById('announcementActive').checked = a ? !!a.active : true;
  document.getElementById('announcementModal').classList.remove('hidden');
  document.getElementById('announcementText').focus();
}

function closeAnnouncementModal() {
  document.getElementById('announcementModal').classList.add('hidden');
}

async function saveAnnouncement() {
  const id     = document.getElementById('announcementId').value;
  const text   = document.getElementById('announcementText').value.trim();
  const type   = document.getElementById('announcementType').value;
  const active = document.getElementById('announcementActive').checked;

  if (!text) { showToast('Le texte de l\'annonce est requis.', 'error'); return; }

  const entry = { id: id || ('a' + Date.now()), text, type, active };

  if (id) {
    const idx = data.announcements.findIndex(a => a.id === id);
    if (idx !== -1) data.announcements[idx] = entry;
  } else {
    data.announcements.push(entry);
  }

  closeAnnouncementModal();
  renderAnnouncements();

  // Persist to Supabase
  try {
    const row = {
      session_id: currentSessionId,
      title: text,
      type,
      is_active: active,
    };
    if (id) {
      await sbRequest('schedule_announcements', 'PATCH', row, `?id=eq.${encodeURIComponent(id)}`);
    } else {
      const result = await sbRequest('schedule_announcements', 'POST', [row]);
      if (result && result[0]) {
        const localEntry = data.announcements[data.announcements.length - 1];
        localEntry.id = result[0].id;
      }
    }
    showToast(id ? 'Annonce mise à jour' : 'Annonce ajoutée', 'success');
    markSaved();
  } catch (err) {
    console.error('Supabase save failed:', err);
    showToast('Sauvegardé localement (erreur Supabase)', 'warning');
    markUnsaved();
  }
}

// ── DATE RANGES ─────────────────────────────────────────

/**
 * Count occurrences of each weekday between start and end dates,
 * excluding holidays. Returns { 0: n, 1: n, ... 6: n } (0=Sunday).
 */
function countWeekdayOccurrences(startStr, endStr, holidays) {
  const counts = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
  if (!startStr || !endStr) return counts;

  // Build a Set of holiday dates (YYYY-MM-DD) for fast lookup
  const holidayDates = new Set();
  for (const h of (holidays || [])) {
    const hStart = h.date;
    const hEnd = h.endDate || h.date;
    const d = new Date(hStart + 'T00:00:00');
    const end = new Date(hEnd + 'T00:00:00');
    while (d <= end) {
      holidayDates.add(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }

  const cur = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (cur <= end) {
    const ymd = cur.toISOString().slice(0, 10);
    if (!holidayDates.has(ymd)) {
      counts[cur.getDay()]++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return counts;
}

/**
 * Build a compact breakdown string showing how many sessions per weekday
 * for courses assigned to a date range. Only shows days that have courses.
 */
function buildDayBreakdown(dr, schedule, holidays) {
  const dayShorts = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const counts = countWeekdayOccurrences(dr.startDate, dr.endDate, holidays);

  // Find which dayIndices have courses in this range
  const daysWithCourses = {};
  for (const day of (schedule || [])) {
    const coursesInRange = (day.classes || []).filter(c => c.dateRangeId === dr.id);
    if (coursesInRange.length > 0) {
      daysWithCourses[day.dayIndex] = coursesInRange.length;
    }
  }

  if (Object.keys(daysWithCourses).length === 0) return '';

  return Object.entries(daysWithCourses)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([dayIdx, numCourses]) => {
      const n = counts[dayIdx] || 0;
      return `<span class="inline-block bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded mr-1 mb-1">${dayShorts[dayIdx]} : ${n}x</span>`;
    })
    .join('');
}

function renderDateRanges() {
  const tbody = document.getElementById('dateRangesTableBody');
  if (!tbody) return;

  if (!dateRanges || dateRanges.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-6">Aucune plage de dates</td></tr>';
    return;
  }

  tbody.innerHTML = dateRanges.map(dr => {
    // Count courses assigned to this range
    let courseCount = 0;
    for (const day of (data.schedule || [])) {
      for (const cls of (day.classes || [])) {
        if (cls.dateRangeId === dr.id) courseCount++;
      }
    }
    const breakdown = buildDayBreakdown(dr, data.schedule, data.holidays);
    return `
      <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
        <td class="px-4 py-2 font-medium text-gray-900">${escHtml(dr.name)}</td>
        <td class="px-4 py-2 text-gray-700">${formatDate(dr.startDate)}</td>
        <td class="px-4 py-2 text-gray-700">${formatDate(dr.endDate)}</td>
        <td class="px-4 py-2 text-gray-600">${courseCount} cours</td>
        <td class="px-4 py-2">${breakdown || '<span class="text-gray-400 text-xs">—</span>'}</td>
        <td class="px-4 py-2 text-right whitespace-nowrap">
          <button class="edit-dr-btn text-blue-600 hover:text-blue-800 text-xs font-semibold mr-2" data-id="${escHtml(dr.id)}">Modifier</button>
          <button class="delete-dr-btn text-red-500 hover:text-red-700 text-xs font-semibold" data-id="${escHtml(dr.id)}">Supprimer</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.edit-dr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dr = dateRanges.find(x => x.id === btn.dataset.id);
      if (dr) openDateRangeModal(dr);
    });
  });
  tbody.querySelectorAll('.delete-dr-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Supprimer cette plage ? Les cours associés reviendront aux dates de session principale.')) {
        await deleteDateRange(btn.dataset.id);
      }
    });
  });
}

function openDateRangeModal(dr) {
  document.getElementById('dateRangeModalTitle').textContent = dr ? 'Modifier la plage' : 'Ajouter une plage';
  document.getElementById('dateRangeId').value    = dr ? dr.id        : '';
  document.getElementById('dateRangeName').value  = dr ? dr.name      : '';
  document.getElementById('dateRangeStart').value = dr ? dr.startDate : (data.sessionStart || '');
  document.getElementById('dateRangeEnd').value   = dr ? dr.endDate   : (data.sessionEnd || '');
  updateDateRangePreview();
  document.getElementById('dateRangeModal').classList.remove('hidden');
  document.getElementById('dateRangeName').focus();
}

function updateDateRangePreview() {
  const start = document.getElementById('dateRangeStart').value;
  const end   = document.getElementById('dateRangeEnd').value;
  const preview = document.getElementById('dateRangePreview');
  const content = document.getElementById('dateRangePreviewContent');

  if (!start || !end) {
    preview.classList.add('hidden');
    return;
  }

  const counts = countWeekdayOccurrences(start, end, data.holidays);
  const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  // Only show days that have at least 1 occurrence
  const items = dayNames
    .map((name, i) => ({ name, count: counts[i] }))
    .filter(d => d.count > 0);

  // Also compute total weeks
  const diffMs = new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00');
  const totalDays = Math.floor(diffMs / 86400000) + 1;
  const weeks = Math.round(totalDays / 7 * 10) / 10;

  content.innerHTML = items
    .map(d => `<span class="inline-block bg-white border border-gray-200 text-gray-700 px-2 py-1 rounded mr-1 mb-1">${d.name} : <strong>${d.count}</strong></span>`)
    .join('') +
    `<div class="mt-1 text-gray-400">${totalDays} jours (~${weeks} semaines)</div>`;

  preview.classList.remove('hidden');
}

function closeDateRangeModal() {
  document.getElementById('dateRangeModal').classList.add('hidden');
}

async function saveDateRange() {
  const id    = document.getElementById('dateRangeId').value;
  const name  = document.getElementById('dateRangeName').value.trim();
  const start = document.getElementById('dateRangeStart').value;
  const end   = document.getElementById('dateRangeEnd').value;

  if (!name)  { showToast('Le nom du groupe est requis.', 'error'); return; }
  if (!start) { showToast('La date de début est requise.', 'error'); return; }
  if (!end)   { showToast('La date de fin est requise.', 'error'); return; }

  const rangeId = id || ('dr-' + Date.now());
  const entry = { id: rangeId, name, startDate: start, endDate: end, sortOrder: dateRanges.length };

  if (id) {
    const idx = dateRanges.findIndex(r => r.id === id);
    if (idx !== -1) dateRanges[idx] = entry;
  } else {
    dateRanges.push(entry);
  }

  closeDateRangeModal();
  renderDateRanges();

  try {
    const row = {
      id: rangeId,
      session_id: currentSessionId,
      name,
      start_date: start,
      end_date: end,
      sort_order: entry.sortOrder,
    };
    await sbRequest('schedule_date_ranges', 'POST', [row]);
    showToast(id ? 'Plage mise à jour' : 'Plage ajoutée', 'success');
    markSaved();
  } catch (err) {
    console.error('Supabase save failed:', err);
    showToast('Sauvegardé localement (erreur Supabase)', 'warning');
    markUnsaved();
  }
}

async function deleteDateRange(id) {
  dateRanges = dateRanges.filter(r => r.id !== id);

  // Reset courses that had this range
  for (const day of (data.schedule || [])) {
    for (const cls of (day.classes || [])) {
      if (cls.dateRangeId === id) cls.dateRangeId = '';
    }
  }

  renderDateRanges();

  try {
    // Supabase FK ON DELETE SET NULL handles the course column reset
    await sbRequest('schedule_date_ranges', 'DELETE', null, `?id=eq.${encodeURIComponent(id)}`);
    showToast('Plage supprimée', 'success');
    markSaved();
  } catch (err) {
    console.error('Supabase delete failed:', err);
    showToast('Supprimée localement (erreur Supabase)', 'warning');
    markUnsaved();
  }
}

// ── JSON Download ────────────────────────────────────────────

function downloadJSON() {
  data.updated = today();
  const json   = JSON.stringify(data, null, 2);
  const blob   = new Blob([json], { type: 'application/json' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = 'schedule.json';
  a.click();
  URL.revokeObjectURL(url);
  markSaved();
  showToast('schedule.json téléchargé', 'success');
}

// ── JSON Import ──────────────────────────────────────────────

function handleImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const json = JSON.parse(e.target.result);
      data = normalizeData(json);
      renderAll();
      markSaved();
      showToast('JSON importé avec succès', 'success');
    } catch {
      showToast('Fichier JSON invalide.', 'error');
    }
  };
  reader.readAsText(file);
}

// ── Utils ────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch { return dateStr; }
}

// ── Modal Close Helpers ──────────────────────────────────────

function closeAllModals() {
  ['courseModal', 'holidayModal', 'eventModal', 'announcementModal', 'dateRangeModal'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
}

// ── Event Bindings ───────────────────────────────────────────

function initBindings() {
  // Tabs
  initTabs();

  // Modal close — backdrop click and × buttons
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeAllModals(); });
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // Course modal
  document.getElementById('saveCourseBtn').addEventListener('click', saveCourse);
  document.getElementById('courseStartTime').addEventListener('change', updateDurationDisplay);
  document.getElementById('courseEndTime').addEventListener('change', updateDurationDisplay);
  document.getElementById('courseStartTime').addEventListener('input', updateDurationDisplay);
  document.getElementById('courseEndTime').addEventListener('input', updateDurationDisplay);

  // Holiday modal
  document.getElementById('addHolidayBtn').addEventListener('click', () => openHolidayModal(null));
  document.getElementById('saveHolidayBtn').addEventListener('click', saveHoliday);

  // Event modal
  document.getElementById('addEventBtn').addEventListener('click', () => openEventModal(null));
  document.getElementById('saveEventBtn').addEventListener('click', saveEvent);

  // Params
  document.getElementById('saveParamsBtn').addEventListener('click', saveParams);

  // Announcements
  document.getElementById('addAnnouncementBtn').addEventListener('click', () => openAnnouncementModal(null));
  document.getElementById('saveAnnouncementBtn').addEventListener('click', saveAnnouncement);

  // Date Ranges
  document.getElementById('addDateRangeBtn').addEventListener('click', () => openDateRangeModal(null));
  document.getElementById('saveDateRangeBtn').addEventListener('click', saveDateRange);
  document.getElementById('dateRangeStart').addEventListener('change', updateDateRangePreview);
  document.getElementById('dateRangeEnd').addEventListener('change', updateDateRangePreview);

  // Download (both buttons)
  document.getElementById('downloadBtnTop').addEventListener('click', downloadJSON);
  document.getElementById('downloadBtnMain').addEventListener('click', downloadJSON);

  // Import
  document.getElementById('importFileInput').addEventListener('change', e => {
    handleImport(e.target.files[0]);
    e.target.value = ''; // reset so same file can be re-imported
  });

  // Preview
  document.getElementById('previewBtn').addEventListener('click', () => {
    window.open('index.html', '_blank');
  });

  // Junior Combative link
  document.getElementById('jcLink').href = JUNIOR_COMBATIVE_URL;
}

// ── UUID helper ─────────────────────────────────────────────

function generateUUID() {
  // crypto.randomUUID if available, fallback for older browsers
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── SESSIONS MANAGEMENT (Carousel) ──────────────────────────

let allSessions = [];
let sessionIndex = 0; // currently viewed session in carousel

async function loadSessions() {
  const cardContent = document.getElementById('sessionCardContent');
  const errDiv = document.getElementById('sessionsError');
  errDiv.classList.add('hidden');
  cardContent.innerHTML = '<div class="text-center text-gray-400 py-8">Chargement…</div>';
  document.getElementById('sessionActions').classList.add('hidden');

  try {
    allSessions = await sbGet('schedule_sessions', 'order=start_date.desc');
    // Try to keep index on same session if possible
    if (sessionIndex >= allSessions.length) sessionIndex = Math.max(0, allSessions.length - 1);
    renderSessionCard();
  } catch (err) {
    console.error('Load sessions failed:', err);
    errDiv.textContent = `Erreur : ${err.message}`;
    errDiv.classList.remove('hidden');
    cardContent.innerHTML = '<div class="text-center text-red-400 py-8">Erreur de chargement</div>';
  }
}

function getSessionStatus(s) {
  if (s.is_current) return { label: 'Actif', css: 'bg-green-100 text-green-700', dot: 'bg-green-500' };
  const now = new Date().toISOString().slice(0, 10);
  if (s.start_date && s.start_date > now) return { label: 'En construction', css: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };
  if (s.name && s.name.startsWith('[ARCHIVE]')) return { label: 'Archivé', css: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' };
  if (s.end_date && s.end_date < now) return { label: 'Archivé', css: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' };
  return { label: 'Inactif', css: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' };
}

function renderSessionCard() {
  const cardContent = document.getElementById('sessionCardContent');
  const counter = document.getElementById('sessionCounter');
  const actions = document.getElementById('sessionActions');
  const prevBtn = document.getElementById('sessionPrev');
  const nextBtn = document.getElementById('sessionNext');

  if (!allSessions.length) {
    cardContent.innerHTML = '<div class="text-center text-gray-400 py-8">Aucune session. Cliquez "+ Nouvelle session" pour commencer.</div>';
    counter.textContent = '0 / 0';
    actions.classList.add('hidden');
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }

  const s = allSessions[sessionIndex];
  const status = getSessionStatus(s);
  const startFmt = s.start_date ? new Date(s.start_date + 'T00:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const endFmt = s.end_date ? new Date(s.end_date + 'T00:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  const badge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.css}"><span class="w-1.5 h-1.5 rounded-full ${status.dot} inline-block"></span>${status.label}</span>`;

  cardContent.innerHTML = `
    <div class="flex flex-col items-center gap-3">
      <div class="text-xl font-bold text-gray-900">${escHtml(s.name || '(sans nom)')}</div>
      ${badge}
      <div class="flex items-center gap-6 text-sm text-gray-600 mt-2">
        <div class="text-center">
          <div class="text-xs text-gray-400 uppercase tracking-wide">Début</div>
          <div class="font-medium">${startFmt}</div>
        </div>
        <div class="text-gray-300">|</div>
        <div class="text-center">
          <div class="text-xs text-gray-400 uppercase tracking-wide">Fin</div>
          <div class="font-medium">${endFmt}</div>
        </div>
      </div>
      ${s.is_current ? '<div class="mt-2 text-xs text-green-600 font-medium">Cette session est actuellement chargée dans l\'admin</div>' : ''}
    </div>
  `;

  counter.textContent = `${sessionIndex + 1} / ${allSessions.length}`;
  prevBtn.disabled = sessionIndex <= 0;
  nextBtn.disabled = sessionIndex >= allSessions.length - 1;

  // Show/hide action buttons based on state
  actions.classList.remove('hidden');
  document.getElementById('sessionActivateBtn').classList.toggle('hidden', s.is_current);
  document.getElementById('sessionDeactivateBtn').classList.toggle('hidden', !s.is_current);
  const isArchived = (s.name && s.name.startsWith('[ARCHIVE]'));
  document.getElementById('sessionArchiveBtn').classList.toggle('hidden', isArchived);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Session navigation ──────────────────────────────────────

function sessionPrev() {
  if (sessionIndex > 0) { sessionIndex--; renderSessionCard(); }
}

function sessionNext() {
  if (sessionIndex < allSessions.length - 1) { sessionIndex++; renderSessionCard(); }
}

// ── Confirm modal helper ────────────────────────────────────

function showConfirm(title, msg) {
  return new Promise(resolve => {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMsg').textContent = msg;
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('hidden');

    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');
    const cleanup = (result) => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.querySelectorAll('.modal-close').forEach(b => b.removeEventListener('click', onCancel));
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', onCancel));
  });
}

// ── Session CRUD ────────────────────────────────────────────

function openSessionModal(mode, session) {
  const modal = document.getElementById('sessionModal');
  const title = document.getElementById('sessionModalTitle');
  const nameInput = document.getElementById('sessionNameInput');
  const startInput = document.getElementById('sessionStartInput');
  const endInput = document.getElementById('sessionEndInput');
  const editId = document.getElementById('sessionEditId');
  const warning = document.getElementById('sessionModalWarning');
  warning.classList.add('hidden');

  if (mode === 'new') {
    title.textContent = 'Nouvelle session';
    nameInput.value = '';
    startInput.value = '';
    endInput.value = '';
    editId.value = '';
  } else if (mode === 'edit' && session) {
    title.textContent = 'Modifier la session';
    nameInput.value = session.name || '';
    startInput.value = session.start_date || '';
    endInput.value = session.end_date || '';
    editId.value = session.id;
  } else if (mode === 'duplicate' && session) {
    title.textContent = 'Dupliquer la session';
    const cleanName = (session.name || '').replace(/^\[ARCHIVE\]\s*/, '');
    nameInput.value = cleanName + ' (copie)';
    startInput.value = '';
    endInput.value = '';
    editId.value = '';
  }

  modal.classList.remove('hidden');
}

function closeSessionModal() {
  document.getElementById('sessionModal').classList.add('hidden');
}

function validateSessionDates(start, end) {
  if (!start || !end) return 'Les dates de début et fin sont obligatoires.';
  if (start >= end) return 'La date de début doit être avant la date de fin.';
  return null;
}

function checkOverlap(start, end, excludeId) {
  return allSessions.filter(s => {
    if (s.id === excludeId) return false;
    if (s.name && s.name.startsWith('[ARCHIVE]')) return false;
    if (!s.start_date || !s.end_date) return false;
    return start <= s.end_date && end >= s.start_date;
  });
}

async function saveSession() {
  const name = document.getElementById('sessionNameInput').value.trim();
  const start = document.getElementById('sessionStartInput').value;
  const end = document.getElementById('sessionEndInput').value;
  const editId = document.getElementById('sessionEditId').value;
  const warning = document.getElementById('sessionModalWarning');
  warning.classList.add('hidden');

  if (!name) { warning.textContent = 'Le nom est obligatoire.'; warning.classList.remove('hidden'); return; }

  const dateErr = validateSessionDates(start, end);
  if (dateErr) { warning.textContent = dateErr; warning.classList.remove('hidden'); return; }

  // Check overlap
  const overlapping = checkOverlap(start, end, editId || null);
  if (overlapping.length > 0) {
    const names = overlapping.map(s => s.name).join(', ');
    const proceed = await showConfirm('Chevauchement détecté', `Cette session chevauche : ${names}. Continuer quand même ?`);
    if (!proceed) return;
  }

  // Final confirmation
  const action = editId ? 'modifier' : 'créer';
  const confirmed = await showConfirm('Confirmer', `Voulez-vous ${action} la session "${name}" (${start} → ${end}) ?`);
  if (!confirmed) return;

  try {
    if (editId) {
      await sbRequest('schedule_sessions', 'PATCH', { name, start_date: start, end_date: end }, `?id=eq.${encodeURIComponent(editId)}`);
      showToast('Session modifiée', 'success');
    } else {
      await sbRequest('schedule_sessions', 'POST', { id: generateUUID(), name, start_date: start, end_date: end, is_current: false });
      showToast('Session créée', 'success');
    }
    closeSessionModal();
    await loadSessions();
  } catch (err) {
    console.error('Save session failed:', err);
    warning.textContent = `Erreur : ${err.message}`;
    warning.classList.remove('hidden');
    showToast('Erreur lors de la sauvegarde', 'error');
  }
}

async function activateSession() {
  const s = allSessions[sessionIndex];
  if (!s) return;

  const confirmed = await showConfirm('Forcer Actif', `Activer "${s.name}" ? L'ancienne session active sera désactivée.`);
  if (!confirmed) return;

  const errDiv = document.getElementById('sessionsError');
  errDiv.classList.add('hidden');

  try {
    await sbRequest('schedule_sessions', 'PATCH', { is_current: false }, '?is_current=eq.true');
    await sbRequest('schedule_sessions', 'PATCH', { is_current: true }, `?id=eq.${encodeURIComponent(s.id)}`);
    showToast('Session activée — recharge la page pour travailler dessus', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Activate session failed:', err);
    errDiv.textContent = `Erreur d'activation : ${err.message}`;
    errDiv.classList.remove('hidden');
    showToast('Erreur lors de l\'activation', 'error');
  }
}

async function deactivateSession() {
  const s = allSessions[sessionIndex];
  if (!s) return;

  const confirmed = await showConfirm('Forcer Inactif', `Désactiver "${s.name}" ? Aucune session ne sera active.`);
  if (!confirmed) return;

  try {
    await sbRequest('schedule_sessions', 'PATCH', { is_current: false }, `?id=eq.${encodeURIComponent(s.id)}`);
    showToast('Session désactivée', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Deactivate session failed:', err);
    showToast('Erreur lors de la désactivation', 'error');
  }
}

async function duplicateSession() {
  const s = allSessions[sessionIndex];
  if (!s) return;
  openSessionModal('duplicate', s);
}

async function editSession() {
  const s = allSessions[sessionIndex];
  if (!s) return;
  openSessionModal('edit', s);
}

async function archiveSession() {
  const s = allSessions[sessionIndex];
  if (!s) return;

  if (s.is_current) {
    showToast('Impossible d\'archiver la session active. Désactivez-la d\'abord.', 'error');
    return;
  }

  const confirmed = await showConfirm('Archiver', `Archiver "${s.name}" ? Le nom sera préfixé par [ARCHIVE].`);
  if (!confirmed) return;

  try {
    const newName = s.name.startsWith('[ARCHIVE]') ? s.name : `[ARCHIVE] ${s.name}`;
    await sbRequest('schedule_sessions', 'PATCH', { name: newName, is_current: false }, `?id=eq.${encodeURIComponent(s.id)}`);
    showToast('Session archivée', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Archive session failed:', err);
    showToast('Erreur lors de l\'archivage', 'error');
  }
}

// ── Init Sessions Tab ───────────────────────────────────────

function initSessionsTab() {
  document.getElementById('refreshSessionsBtn').addEventListener('click', loadSessions);
  document.getElementById('newSessionBtn').addEventListener('click', () => openSessionModal('new'));
  document.getElementById('sessionPrev').addEventListener('click', sessionPrev);
  document.getElementById('sessionNext').addEventListener('click', sessionNext);
  document.getElementById('sessionActivateBtn').addEventListener('click', activateSession);
  document.getElementById('sessionDeactivateBtn').addEventListener('click', deactivateSession);
  document.getElementById('sessionEditBtn').addEventListener('click', editSession);
  document.getElementById('sessionDuplicateBtn').addEventListener('click', duplicateSession);
  document.getElementById('sessionArchiveBtn').addEventListener('click', archiveSession);
  document.getElementById('saveSessionBtn').addEventListener('click', saveSession);

  // Close session modal
  document.querySelectorAll('#sessionModal .modal-close').forEach(btn => {
    btn.addEventListener('click', closeSessionModal);
  });

  // Keyboard nav
  document.addEventListener('keydown', e => {
    const section = document.getElementById('tab-sessions');
    if (!section || section.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') sessionPrev();
    if (e.key === 'ArrowRight') sessionNext();
  });

  // Load sessions when the tab is first shown
  const observer = new MutationObserver(() => {
    const section = document.getElementById('tab-sessions');
    if (section && !section.classList.contains('hidden') && !allSessions.length) {
      loadSessions();
    }
  });
  const section = document.getElementById('tab-sessions');
  if (section) {
    observer.observe(section, { attributes: true, attributeFilter: ['class'] });
  }
}

// ── Init ─────────────────────────────────────────────────────

// Run immediately when script loads (don't wait for DOMContentLoaded)
// since admin.js is loaded dynamically after DOMContentLoaded has passed
(async () => {
  console.log('⏱️ admin.js loaded, initializing...');
  await loadData();
  initBindings();
  initSessionsTab();
  console.log('✅ Initialization complete');
})();
