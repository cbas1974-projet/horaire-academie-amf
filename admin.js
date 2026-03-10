// ============================================================
// AMF Admin Panel — admin.js
// Vanilla JS, no framework, no dependencies
// ============================================================

// ── Constants ────────────────────────────────────────────────

// Password is "amf2026admin" — hash computed at runtime via Web Crypto API
// Change the literal in getExpectedHash() to update the password.

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
let hasUnsavedChanges = false;
let toastTimer = null;

// ── SHA-256 via Web Crypto API ───────────────────────────────

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash of "amf2026admin" — pre-computed for performance but verified at runtime
let cachedPasswordHash = null;

async function getExpectedHash() {
  if (!cachedPasswordHash) {
    cachedPasswordHash = await sha256hex('amf2026admin');
  }
  return cachedPasswordHash;
}

// ── Login ────────────────────────────────────────────────────

async function handleLogin() {
  const input = document.getElementById('passwordInput').value;
  const errEl = document.getElementById('loginError');
  if (!input) { errEl.classList.remove('hidden'); errEl.textContent = 'Entrez un mot de passe.'; return; }
  const inputHash = await sha256hex(input);
  const expected  = await getExpectedHash();
  if (inputHash === expected) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    await loadData();
  } else {
    errEl.classList.remove('hidden');
    errEl.textContent = 'Mot de passe incorrect.';
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();
  }
}

// ── Data Loading ─────────────────────────────────────────────

async function loadData() {
  try {
    const res = await fetch('schedule.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    data = normalizeData(json);
    showToast('Horaire chargé depuis schedule.json', 'success');
  } catch {
    data = getEmptyData();
    showToast('Démarrage en mode vide — importez un JSON ou créez l\'horaire', 'warning');
  }
  renderAll();
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

function deleteCourse(dayIndex, id) {
  const day = data.schedule.find(d => d.dayIndex === dayIndex);
  if (!day) return;
  day.classes = (day.classes || []).filter(c => c.id !== id);
  markUnsaved();
  renderSchedule();
  showToast('Cours supprimé', 'success');
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

function saveCourse() {
  const name       = document.getElementById('courseName').value.trim();
  const startTime  = document.getElementById('courseStartTime').value;
  const endTime    = document.getElementById('courseEndTime').value;
  const desc       = document.getElementById('courseDescription').value.trim();
  const ageGroup   = document.getElementById('courseAgeGroup').value.trim();
  const discipline = document.getElementById('courseDiscipline').value;
  const dayIndex   = parseInt(document.getElementById('courseDayIndex').value, 10);
  const id         = document.getElementById('courseId').value;

  if (!name)       { showToast('Le nom du cours est requis.', 'error'); return; }
  if (!startTime)  { showToast('L\'heure de début est requise.', 'error'); return; }
  if (!endTime)    { showToast('L\'heure de fin est requise.', 'error'); return; }
  if (!discipline) { showToast('La discipline est requise.', 'error'); return; }

  const duration = calcDuration(startTime, endTime);
  const time     = `${startTime} - ${endTime}`;

  const day = data.schedule.find(d => d.dayIndex === dayIndex);
  if (!day) return;

  if (id) {
    // Update existing
    const idx = day.classes.findIndex(c => c.id === id);
    if (idx !== -1) {
      day.classes[idx] = { id, time, startTime, endTime, name, description: desc, ageGroup, discipline, duration };
    }
    showToast('Cours mis à jour', 'success');
  } else {
    // New
    const newId = 'c' + Date.now();
    day.classes.push({ id: newId, time, startTime, endTime, name, description: desc, ageGroup, discipline, duration });
    showToast('Cours ajouté', 'success');
  }

  markUnsaved();
  closeCourseModal();
  renderSchedule();
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
    btn.addEventListener('click', () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer ce congé ?')) {
        data.holidays = data.holidays.filter(x => x.id !== btn.dataset.id);
        markUnsaved();
        renderHolidays();
        showToast('Congé supprimé', 'success');
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

function saveHoliday() {
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
    showToast('Congé mis à jour', 'success');
  } else {
    data.holidays.push(entry);
    showToast('Congé ajouté', 'success');
  }

  markUnsaved();
  closeHolidayModal();
  renderHolidays();
}

// ── EVENTS (Tab 3) ───────────────────────────────────────────

function renderEvents() {
  const tbody = document.getElementById('eventsTableBody');
  if (!data.events || data.events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">Aucun événement</td></tr>';
    return;
  }
  const sorted = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  tbody.innerHTML = sorted.map(e => `
    <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
      <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${formatDate(e.date)}</td>
      <td class="px-4 py-3 font-medium text-gray-900">${escHtml(e.name)}</td>
      <td class="px-4 py-3 text-gray-600 text-xs">${escHtml(EVENT_TYPE_LABELS[e.type] || e.type)}</td>
      <td class="px-4 py-3">
        ${e.important ? '<span class="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">Oui</span>' : '<span class="text-gray-400 text-xs">—</span>'}
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button class="edit-event-btn text-blue-600 hover:text-blue-800 text-xs font-semibold mr-2" data-id="${escHtml(e.id)}">Modifier</button>
        <button class="delete-event-btn text-red-500 hover:text-red-700 text-xs font-semibold" data-id="${escHtml(e.id)}">Supprimer</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = data.events.find(x => x.id === btn.dataset.id);
      if (ev) openEventModal(ev);
    });
  });
  tbody.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
        data.events = data.events.filter(x => x.id !== btn.dataset.id);
        markUnsaved();
        renderEvents();
        showToast('Événement supprimé', 'success');
      }
    });
  });
}

function openEventModal(ev) {
  document.getElementById('eventModalTitle').textContent = ev ? 'Modifier l\'événement' : 'Ajouter un événement';
  document.getElementById('eventId').value          = ev ? ev.id          : '';
  document.getElementById('eventDate').value        = ev ? ev.date        : '';
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

function saveEvent() {
  const id          = document.getElementById('eventId').value;
  const date        = document.getElementById('eventDate').value;
  const name        = document.getElementById('eventName').value.trim();
  const description = document.getElementById('eventDescription').value.trim();
  const type        = document.getElementById('eventType').value;
  const important   = document.getElementById('eventImportant').checked;

  if (!date) { showToast('La date est requise.', 'error'); return; }
  if (!name) { showToast('Le nom est requis.', 'error'); return; }

  const entry = { id: id || ('e' + Date.now()), date, name, description, type, important };

  if (id) {
    const idx = data.events.findIndex(e => e.id === id);
    if (idx !== -1) data.events[idx] = entry;
    showToast('Événement mis à jour', 'success');
  } else {
    data.events.push(entry);
    showToast('Événement ajouté', 'success');
  }

  markUnsaved();
  closeEventModal();
  renderEvents();
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

function saveParams() {
  data.academy      = document.getElementById('paramAcademy').value.trim();
  data.session      = document.getElementById('paramSession').value.trim();
  data.sessionStart = document.getElementById('paramSessionStart').value;
  data.sessionEnd   = document.getElementById('paramSessionEnd').value;
  data.contact = {
    email:   document.getElementById('paramEmail').value.trim(),
    phone:   document.getElementById('paramPhone').value.trim(),
    address: document.getElementById('paramAddress').value.trim(),
  };
  markUnsaved();
  showToast('Paramètres enregistrés', 'success');
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
    chk.addEventListener('change', () => {
      const a = data.announcements.find(x => x.id === chk.dataset.id);
      if (a) { a.active = chk.checked; markUnsaved(); }
    });
  });
  list.querySelectorAll('.edit-ann-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = data.announcements.find(x => x.id === btn.dataset.id);
      if (a) openAnnouncementModal(a);
    });
  });
  list.querySelectorAll('.delete-ann-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Supprimer cette annonce ?')) {
        data.announcements = data.announcements.filter(x => x.id !== btn.dataset.id);
        markUnsaved();
        renderAnnouncements();
        showToast('Annonce supprimée', 'success');
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

function saveAnnouncement() {
  const id     = document.getElementById('announcementId').value;
  const text   = document.getElementById('announcementText').value.trim();
  const type   = document.getElementById('announcementType').value;
  const active = document.getElementById('announcementActive').checked;

  if (!text) { showToast('Le texte de l\'annonce est requis.', 'error'); return; }

  const entry = { id: id || ('a' + Date.now()), text, type, active };

  if (id) {
    const idx = data.announcements.findIndex(a => a.id === id);
    if (idx !== -1) data.announcements[idx] = entry;
    showToast('Annonce mise à jour', 'success');
  } else {
    data.announcements.push(entry);
    showToast('Annonce ajoutée', 'success');
  }

  markUnsaved();
  closeAnnouncementModal();
  renderAnnouncements();
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
  ['courseModal', 'holidayModal', 'eventModal', 'announcementModal'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
}

// ── Event Bindings ───────────────────────────────────────────

function initBindings() {
  // Login
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('passwordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

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
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initBindings();
  // Focus password field
  document.getElementById('passwordInput').focus();
});
