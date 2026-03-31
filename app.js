/**
 * Académie d'Arts Martiaux Familial — Schedule App v2
 * Four-view schedule (semaine, jour, mois, session), discipline filters,
 * countdown to next class, announcements banner.
 * Pure vanilla JS, no dependencies, no build step.
 */

(function () {
  'use strict';

  /* ============================================================
     CONFIG
     ============================================================ */

  // Supabase (public read-only)
  const SUPABASE_URL  = 'https://enkwnelkwlvlyjvbwyzq.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVua3duZWxrd2x2bHlqdmJ3eXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMzU1MjgsImV4cCI6MjA4NDYxMTUyOH0.SzvyfEQGjfav927--cYQZVF8jJ47B6V9jHrNh6KuT6M';

  const DISCIPLINES_DEFAULT = {
    jiujitsu:  { label: "Jiu-Jitsu d'autodéfense", color: '#c9a227' },
    muaythai:  { label: 'Muay Thai',               color: '#dc2626' },
    superkids: { label: 'Programme Superkids',      color: '#22d3ee' },
    gracie:    { label: 'Gracie Jiu-Jitsu',         color: '#2563eb' },
  };

  // Timeline bounds (HH:MM) — schedule data drives the min/max
  // with padding added at runtime.
  const TIMELINE_PAD_BEFORE = 15; // minutes before first class
  const TIMELINE_PAD_AFTER  = 15; // minutes after last class
  const HOUR_HEIGHT_PX      = 110; // pixels per 60 minutes in week view

  // Discipline → logo file (in logos/ folder)
  const DISC_LOGOS = {
    jiujitsu:  'logos/jiujitsu.png',
    muaythai:  'logos/muaythai.jpg',
    superkids: 'logos/superkids.png',
    gracie:    'logos/gracie.jpg',
  };

  /* ============================================================
     STATE
     ============================================================ */

  let appData       = null;          // full schedule.json payload
  let currentView   = 'semaine';     // 'semaine' | 'jour' | 'mois' | 'session'
  let currentDayIdx = 0;             // index into schedule[] for jour view
  let activeFilters = new Set(['jiujitsu', 'muaythai', 'superkids', 'gracie']);
  let announcementDismissed = false; // stays closed within session

  // Week view state
  let currentWeekStart = null;       // Date — Sunday of the displayed week

  // Month view state
  let currentMonthDate = null;       // tracks which month is displayed (set from session start)
  let selectedMonthDay = null;       // "YYYY-MM-DD" of the clicked day in month view

  /* ============================================================
     UTILS
     ============================================================ */

  /**
   * Convert "HH:MM" string to total minutes since midnight.
   */
  function timeToMinutes(t) {
    const parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  /**
   * Format minutes-since-midnight as "HH:MM".
   */
  function minutesToTime(m) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  /**
   * Format a Date object as "lundi 10 mars".
   */
  function formatDateFr(date) {
    return date.toLocaleDateString('fr-CA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  /**
   * Format a Date as "YYYY-MM-DD".
   */
  function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Escape HTML special characters.
   */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format a course name: if it contains " & ", split into 2 group lines
   * with a visual separator between them. Safe for inline HTML use.
   */
  function formatCourseName(name) {
    if (name.includes(' & ')) {
      const parts = name.split(' & ');
      return parts
        .map(p => `<span class="group-line">${esc(p)}</span>`)
        .join('<span class="group-sep" aria-hidden="true"></span>');
    }
    return esc(name);
  }

  /**
   * Detect mixed courses (superkids + enfants jiujitsu in same class).
   */
  function isMixedCourse(cls) {
    const n = (cls.name || '').toUpperCase();
    return n.includes('SUPERKIDS') && n.includes('ENFANTS');
  }

  /**
   * Check if a given "YYYY-MM-DD" date string falls within any holiday range.
   * Returns the holiday object or null.
   */
  function getHolidayForDate(ymd, holidays) {
    if (!holidays || !holidays.length) return null;
    for (const h of holidays) {
      const start = h.date;
      const end   = h.endDate || h.date;
      if (ymd >= start && ymd <= end) return h;
    }
    return null;
  }

  /**
   * Given today's JS day-of-week (0=Sun…6=Sat) and the schedule array,
   * find the schedule entry for that day.
   */
  function getScheduleForJSDay(jsDay, schedule) {
    return schedule.find(d => d.dayIndex === jsDay) || null;
  }

  /* ============================================================
     DATA LOADING — Supabase first, JSON fallback
     ============================================================ */

  /**
   * Query Supabase REST API (dojo schema).
   */
  async function sbQuery(table, query) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Accept-Profile': 'dojo',
      },
    });
    if (!res.ok) throw new Error(`Supabase ${table}: ${res.status}`);
    return res.json();
  }

  /**
   * Calculate duration string from startTime/endTime.
   */
  function calcDurationStr(start, end) {
    const mins = timeToMinutes(end) - timeToMinutes(start);
    if (mins <= 0) return '';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }

  /**
   * Load schedule from Supabase, transforming into appData format.
   * Falls back to schedule.json on failure.
   */
  async function loadSchedule() {
    try {
      return await loadFromSupabase();
    } catch (err) {
      console.warn('Supabase load failed, falling back to schedule.json:', err.message);
      try {
        const resp = await fetch('schedule.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (err2) {
        if (window.__SCHEDULE_FALLBACK) return window.__SCHEDULE_FALLBACK;
        throw err2;
      }
    }
  }

  /**
   * Fetch all data from Supabase and transform to appData format.
   */
  async function loadFromSupabase() {
    const [sessions, courses, holidays, events, announcements] = await Promise.all([
      sbQuery('schedule_sessions', 'is_current=eq.true&limit=1'),
      sbQuery('schedule_courses', 'is_active=eq.true&order=day_index,sort_order'),
      sbQuery('schedule_holidays', 'select=*'),
      sbQuery('schedule_events', 'select=*'),
      sbQuery('schedule_announcements', 'select=*'),
    ]);
    // Fetch date ranges separately — table may not exist yet (pre-migration)
    let ranges = [];
    try { ranges = await sbQuery('schedule_date_ranges', 'select=*&order=sort_order'); } catch { }

    const session = sessions[0];
    if (!session) throw new Error('No current session found');

    // Filter by session_id
    const sid = session.id;
    const sessHolidays = holidays.filter(h => h.session_id === sid);
    const sessEvents = events.filter(e => e.session_id === sid);
    const sessAnnouncements = announcements.filter(a => a.session_id === sid);
    const sessRanges = (ranges || []).filter(r => r.session_id === sid);

    // Build schedule array (7 days)
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
          type: c.type || '',
          duration: calcDurationStr(c.start_time, c.end_time),
          dateRangeId: c.date_range_id || '',
        })),
    }));

    return {
      academy: 'Académie d\'Arts Martiaux Familial',
      session: session.name,
      sessionStart: session.start_date,
      sessionEnd: session.end_date,
      updated: new Date().toISOString().slice(0, 10),
      contact: {
        email: 'info@academie-amf.com',
        phone: '',
        address: '129 avenue Principale, Rouyn-Noranda (Québec) J9X 4P3 — Sous-sol, 3e studio',
      },
      announcements: sessAnnouncements.map(a => ({
        id: a.id,
        text: a.title,
        type: a.type || 'info',
        active: a.is_active !== false,
      })),
      disciplines: DISCIPLINES_DEFAULT,
      dateRanges: sessRanges.map(r => ({
        id: r.id,
        name: r.name,
        startDate: r.start_date,
        endDate: r.end_date,
        sortOrder: r.sort_order || 0,
      })),
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

  /* ============================================================
     LOADING / ERROR STATES
     ============================================================ */

  function showLoading() {
    const semaine = document.getElementById('week-grid-container');
    if (semaine) {
      semaine.innerHTML = `
        <div class="space-y-4">
          ${Array(3).fill('<div class="skeleton h-48 w-full"></div>').join('')}
        </div>`;
    }
    const jour = document.getElementById('day-classes');
    if (jour) {
      jour.innerHTML = Array(3).fill('<div class="skeleton h-28 w-full mb-4"></div>').join('');
    }
    const cdv = document.getElementById('countdown-value');
    if (cdv) cdv.textContent = 'chargement…';
  }

  function showError(message) {
    const semaine = document.getElementById('week-grid-container');
    if (semaine) {
      semaine.innerHTML = `
        <div class="col-span-full text-center py-12">
          <p class="text-red-400 text-lg font-semibold">Erreur de chargement</p>
          <p class="text-gray-500 text-sm mt-2">${esc(message)}</p>
          <button onclick="location.reload()"
                  class="mt-4 cta-button text-sm"
                  aria-label="Réessayer le chargement">
            Réessayer
          </button>
        </div>`;
    }
  }

  /* ============================================================
     ANNOUNCEMENTS BANNER
     ============================================================ */

  function renderAnnouncements(announcements) {
    const section = document.getElementById('announcement-section');
    if (!section) return;

    if (announcementDismissed) {
      section.innerHTML = '';
      return;
    }

    const active = announcements.filter(a => a.active);
    if (!active.length) {
      section.innerHTML = '';
      return;
    }

    const items = active.map((a, i) => `
      <div class="announcement-bar mb-2" role="alert" aria-live="polite">
        <span class="ann-icon" aria-hidden="true">&#9888;</span>
        <span>${esc(a.text)}</span>
        <button
          class="ann-dismiss"
          data-ann-id="${esc(a.id)}"
          aria-label="Fermer cette annonce">
          &times;
        </button>
      </div>`).join('');

    section.innerHTML = items;

    section.querySelectorAll('.ann-dismiss').forEach(btn => {
      btn.addEventListener('click', () => {
        announcementDismissed = true;
        section.innerHTML = '';
      });
    });
  }

  /* ============================================================
     UPCOMING EVENTS BANNER
     ============================================================ */

  function renderUpcomingEvents(events, sessionStart, sessionEnd) {
    const section = document.getElementById('announcement-section');
    if (!section || !events || !events.length) return;

    // Show events happening during the session
    const now = new Date();
    const todayYMD = toYMD(now);

    // Filter: upcoming events (date >= today) or ongoing (endDate >= today)
    const upcoming = events
      .filter(e => {
        const end = e.endDate || e.date;
        return end >= todayYMD;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3); // max 3

    if (!upcoming.length) return;

    const formatShort = (d) => {
      if (!d) return '';
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });
    };

    const eventsHtml = upcoming.map(e => {
      const dateLabel = e.endDate && e.endDate !== e.date
        ? `${formatShort(e.date)} au ${formatShort(e.endDate)}`
        : formatShort(e.date);
      const badge = e.important ? ' <span style="color:var(--red);font-weight:700;">●</span>' : '';
      return `
        <div class="announcement-bar mb-2" role="status" style="background:rgba(201,162,39,0.12);border-color:rgba(201,162,39,0.3);">
          <span class="ann-icon" aria-hidden="true">&#9733;</span>
          <span><strong>${esc(e.name)}</strong>${badge} — ${dateLabel}${e.description ? ' — ' + esc(e.description) : ''}</span>
        </div>`;
    }).join('');

    // Append after existing announcements (don't replace)
    section.insertAdjacentHTML('beforeend', eventsHtml);
  }

  /* ============================================================
     UPCOMING HOLIDAYS BANNER
     ============================================================ */

  function renderUpcomingHolidays(holidays) {
    const section = document.getElementById('announcement-section');
    if (!section || !holidays || !holidays.length) return;

    const todayYMD = toYMD(new Date());

    // Filter: upcoming or ongoing holidays
    const upcoming = holidays
      .filter(h => {
        const end = h.endDate || h.date;
        return end >= todayYMD;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);

    if (!upcoming.length) return;

    const formatShort = (d) => {
      if (!d) return '';
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });
    };

    const holidaysHtml = upcoming.map(h => {
      const dateLabel = h.endDate && h.endDate !== h.date
        ? `${formatShort(h.date)} au ${formatShort(h.endDate)}`
        : formatShort(h.date);
      return `
        <div class="announcement-bar mb-2" role="status" style="background:rgba(220,38,38,0.08);border-color:rgba(220,38,38,0.25);">
          <span class="ann-icon" aria-hidden="true">🚫</span>
          <span><strong>Congé</strong> — ${dateLabel}${h.name ? ' — ' + esc(h.name) : ''}</span>
        </div>`;
    }).join('');

    section.insertAdjacentHTML('beforeend', holidaysHtml);
  }

  /* ============================================================
     LEGEND
     ============================================================ */

  function renderLegend(disciplines) {
    const container = document.getElementById('schedule-legend');
    if (!container) return;

    const items = Object.entries(disciplines).map(([key, disc]) => `
      <div class="flex items-center gap-2" role="listitem">
        <span class="legend-dot" style="background-color:${esc(disc.color)};" aria-hidden="true"></span>
        <span class="text-sm text-gray-300">${esc(disc.label)}</span>
      </div>`);

    container.innerHTML = items.join('');
  }

  /* ============================================================
     HEADER INFO
     ============================================================ */

  function renderHeader(data) {
    const sessionEl = document.getElementById('session-name');
    if (sessionEl) sessionEl.textContent = data.session;

    const updatedEl = document.getElementById('last-updated');
    if (updatedEl && data.updated) {
      updatedEl.textContent = `Mis à jour : ${data.updated}`;
    }

    // Date ranges in header
    const rangesEl = document.getElementById('session-date-ranges-header');
    if (rangesEl) {
      const ranges = data.dateRanges || [];
      const formatShort = (d) => d
        ? new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })
        : '';

      if (ranges.length > 0) {
        rangesEl.innerHTML = ranges.map(r => {
          const color = r.name.toLowerCase().includes('muay')
            ? 'var(--red-light)'
            : 'var(--gold-light)';
          return `<p class="text-sm" style="color:${color}; font-weight:600;">
            ${esc(r.name)} : ${formatShort(r.startDate)} — ${formatShort(r.endDate)}</p>`;
        }).join('');
      }
    }

    // Contact phone/address
    if (data.contact) {
      if (data.contact.phone) {
        const phoneWrap = document.getElementById('contact-phone');
        const phoneLink = document.getElementById('contact-phone-link');
        if (phoneWrap && phoneLink) {
          phoneLink.href = `tel:${data.contact.phone.replace(/\s/g, '')}`;
          phoneLink.textContent = data.contact.phone;
          phoneWrap.classList.remove('hidden');
        }
      }
      if (data.contact.address) {
        const addrWrap = document.getElementById('contact-address');
        const addrText = document.getElementById('contact-address-text');
        const addrLink = document.getElementById('contact-address-link');
        if (addrWrap && addrText) {
          addrText.textContent = data.contact.address;
          if (addrLink) {
            addrLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.contact.address)}`;
          }
          addrWrap.classList.remove('hidden');
        }
      }
    }
  }

  /* ============================================================
     COUNTDOWN
     ============================================================ */

  function getNextClass(schedule, now) {
    const todayJS   = now.getDay(); // 0=Sun
    const nowMins   = now.getHours() * 60 + now.getMinutes();

    // Build ordered search: start from today, wrap around the week
    const orderedDays = [];
    for (let i = 0; i < 7; i++) {
      const dayIndex = (todayJS + i) % 7;
      const day = schedule.find(d => d.dayIndex === dayIndex);
      if (day) orderedDays.push({ day, daysAhead: i });
    }

    for (const { day, daysAhead } of orderedDays) {
      if (!day.classes || !day.classes.length) continue;

      // Sort classes by startTime
      const sorted = [...day.classes].sort(
        (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      );

      for (const cls of sorted) {
        const startMins = timeToMinutes(cls.startTime);
        if (daysAhead === 0 && startMins <= nowMins) continue; // already started/past today

        const minutesUntil = daysAhead * 24 * 60 + startMins - nowMins;
        return { cls, day, daysAhead, minutesUntil, startMins };
      }
    }
    return null;
  }

  function formatCountdown(minutesUntil, cls, day) {
    if (minutesUntil < 0) return null;

    const totalMins = minutesUntil;
    const days  = Math.floor(totalMins / (24 * 60));
    const hours = Math.floor((totalMins % (24 * 60)) / 60);
    const mins  = totalMins % 60;

    let timeStr = '';
    if (days > 0)        timeStr += `${days}j `;
    if (hours > 0)       timeStr += `${hours}h `;
    if (mins > 0)        timeStr += `${mins} min`;
    if (!timeStr.trim()) timeStr = 'maintenant';

    return `${esc(cls.name)} (${esc(day.dayShort)}) dans ${timeStr.trim()}`;
  }

  function updateCountdown() {
    if (!appData) return;
    const cdv = document.getElementById('countdown-value');
    if (!cdv) return;

    const now    = new Date();
    const result = getNextClass(appData.schedule, now);
    if (!result) {
      cdv.textContent = 'Aucun cours à venir';
      return;
    }
    const text = formatCountdown(result.minutesUntil, result.cls, result.day);
    cdv.textContent = text || 'À venir';
  }

  /* ============================================================
     DISCIPLINE FILTERS
     ============================================================ */

  function bindFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const disc = btn.dataset.discipline;
        if (!disc) return;

        if (activeFilters.has(disc)) {
          // Don't allow all-off
          if (activeFilters.size === 1) return;
          activeFilters.delete(disc);
          btn.classList.add('inactive');
          btn.setAttribute('aria-pressed', 'false');
        } else {
          activeFilters.add(disc);
          btn.classList.remove('inactive');
          btn.setAttribute('aria-pressed', 'true');
        }

        applyFilters();
      });
    });
  }

  function applyFilters() {
    // Week view blocks
    document.querySelectorAll('.timeline-block').forEach(el => {
      const disc = el.dataset.discipline;
      if (activeFilters.has(disc)) {
        el.classList.remove('discipline-hidden');
        el.removeAttribute('aria-hidden');
      } else {
        el.classList.add('discipline-hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });

    // Day view cards
    document.querySelectorAll('.day-card-v2').forEach(el => {
      const disc = el.dataset.discipline;
      if (activeFilters.has(disc)) {
        el.classList.remove('discipline-hidden');
        el.removeAttribute('aria-hidden');
      } else {
        el.classList.add('discipline-hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });

    // Month view: filter discipline indicator dots
    document.querySelectorAll('.month-indicator-dot').forEach(el => {
      const disc = el.dataset.discipline;
      if (activeFilters.has(disc)) {
        el.classList.remove('discipline-hidden');
      } else {
        el.classList.add('discipline-hidden');
      }
    });

    // Month day detail cards
    document.querySelectorAll('.month-detail-card').forEach(el => {
      const disc = el.dataset.discipline;
      if (activeFilters.has(disc)) {
        el.classList.remove('discipline-hidden');
        el.removeAttribute('aria-hidden');
      } else {
        el.classList.add('discipline-hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });

    // Session view: filter group rows
    document.querySelectorAll('.session-group-row').forEach(el => {
      const disc = el.dataset.discipline;
      if (activeFilters.has(disc)) {
        el.classList.remove('discipline-hidden');
        el.removeAttribute('aria-hidden');
      } else {
        el.classList.add('discipline-hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }

  /* ============================================================
     VIEW TOGGLE
     ============================================================ */

  function bindViewToggle() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (!view || view === currentView) return;
        switchView(view);
      });
    });
  }

  function switchView(view) {
    currentView = view;

    const views = ['semaine', 'jour', 'mois', 'session', 'admin'];

    // Hide all sections, deactivate all buttons
    views.forEach(v => {
      const section = document.getElementById(`view-${v}`);
      if (section) section.classList.add('hidden');
      const btn = document.getElementById(`btn-${v}`);
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });

    // Show the requested section and activate its button
    const activeSection = document.getElementById(`view-${view}`);
    if (activeSection) activeSection.classList.remove('hidden');
    const activeBtn = document.getElementById(`btn-${view}`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.setAttribute('aria-pressed', 'true');
    }

    // Render the new views on first switch (appData may not be ready on init)
    if (appData) {
      if (view === 'mois') renderMonthView(appData);
      if (view === 'session') renderSessionView(appData);
    }

    // Admin: if already authed, re-render panel on switch
    if (view === 'admin' && adminAuthed) {
      adminLoadSessions().then(() => renderAdminPanel());
    }
  }

  /* ============================================================
     WEEK VIEW — TIMELINE
     ============================================================ */

  /**
   * Compute the min and max minutes (with padding) across all classes.
   */
  function computeTimelineBounds(schedule) {
    let minMins = Infinity;
    let maxMins = -Infinity;

    for (const day of schedule) {
      for (const cls of (day.classes || [])) {
        const s = timeToMinutes(cls.startTime);
        const e = timeToMinutes(cls.endTime);
        if (s < minMins) minMins = s;
        if (e > maxMins) maxMins = e;
      }
    }

    if (minMins === Infinity) {
      // Fallback
      minMins = 15 * 60 + 30;
      maxMins = 21 * 60 + 30;
    }

    // Snap to whole hour boundaries with padding
    minMins = Math.floor((minMins - TIMELINE_PAD_BEFORE) / 60) * 60;
    maxMins = Math.ceil((maxMins + TIMELINE_PAD_AFTER) / 60) * 60;

    return { minMins, maxMins };
  }

  /**
   * Convert absolute minutes to a pixel top offset within the timeline.
   */
  function minsToPixels(mins, minMins) {
    return ((mins - minMins) / 60) * HOUR_HEIGHT_PX;
  }

  /**
   * Build the HTML for the week timeline view.
   */
  function renderWeekView(data) {
    const { schedule, holidays, disciplines, sessionStart, sessionEnd } = data;
    const { minMins, maxMins } = computeTimelineBounds(schedule);
    const totalHeight = minsToPixels(maxMins, minMins);

    // Determine today's dayIndex (0=Sun)
    const now        = new Date();
    const todayJS    = now.getDay();
    const todayYMD   = toYMD(now);

    // Build hour ticks array
    const ticks = [];
    for (let m = minMins; m <= maxMins; m += 30) {
      ticks.push(m);
    }

    // --- DAY HEADERS ---
    const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];

    // Header row HTML
    const labelHeaderHtml = `<div class="timeline-label-cell" aria-hidden="true"></div>`;

    const dayHeadersHtml = DAY_ORDER.map(di => {
      const dayData  = schedule.find(d => d.dayIndex === di);
      const isToday  = di === todayJS;
      const shortDay = dayData ? esc(dayData.dayShort) : ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][di];
      const fullDay  = dayData ? esc(dayData.day) : ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][di];
      const todayCls = isToday ? ' today-col' : '';
      const classCount = dayData && dayData.classes ? dayData.classes.length : 0;

      return `
        <div class="week-day-header${todayCls}" aria-label="${fullDay}${isToday ? ' — aujourd\'hui' : ''}">
          ${shortDay}
          ${classCount > 0 ? `<span class="day-class-count">${classCount} cours</span>` : ''}
        </div>`;
    }).join('');

    // --- TIME AXIS COLUMN ---
    const axisHtml = `
      <div class="timeline-axis" style="height:${totalHeight}px; position:relative;" aria-hidden="true">
        ${ticks.map(m => {
          const top = minsToPixels(m, minMins);
          const isHour = m % 60 === 0;
          return `
            <div class="timeline-tick" style="top:${top}px;">
              <span class="timeline-tick-label">${isHour ? minutesToTime(m) : ''}</span>
            </div>`;
        }).join('')}
      </div>`;

    // --- DAY COLUMNS ---
    const dayColsHtml = DAY_ORDER.map(di => {
      const dayData = schedule.find(d => d.dayIndex === di);
      const isToday = di === todayJS;

      // Week view = "semaine type" (template) — show all courses, no date filtering
      const filteredClasses = dayData && dayData.classes ? dayData.classes : [];
      const hasClasses = filteredClasses.length > 0;

      const todayCls = isToday ? ' week-col-today' : '';

      // Grid lines
      const gridLines = ticks.map(m => {
        const top    = minsToPixels(m, minMins);
        const isHour = m % 60 === 0;
        return `<div class="week-hour-line${isHour ? ' full' : ''}" style="top:${top}px;"></div>`;
      }).join('');

      // Class blocks
      let blocksHtml = '';
      if (false) {
        // Holiday overlay (disabled in template mode — holidays show in month view)
        blocksHtml = `
          <div style="
            position:absolute; inset:4px;
            background:rgba(220,38,38,0.07);
            border:1px dashed rgba(220,38,38,0.25);
            border-radius:8px;
            display:flex; align-items:center; justify-content:center;
          ">
            <span style="
              font-size:0.65rem; font-weight:700; color:rgba(248,113,113,0.7);
              text-transform:uppercase; letter-spacing:0.08em;
              writing-mode:vertical-lr; transform:rotate(180deg);
            ">${esc(holiday.name)}</span>
          </div>`;
      } else if (hasClasses) {
        blocksHtml = filteredClasses.map(cls => {
          const startMins = timeToMinutes(cls.startTime);
          const endMins   = timeToMinutes(cls.endTime);
          const topPx     = minsToPixels(startMins, minMins);
          const heightPx  = minsToPixels(endMins, minMins) - topPx;
          const hiddenCls = activeFilters.has(cls.discipline) ? '' : ' discipline-hidden';
          const ariaHidden = hiddenCls ? ' aria-hidden="true"' : '';
          const mixed = isMixedCourse(cls);

          return `
            <div
              class="timeline-block${hiddenCls}${mixed ? ' mixed-sk-jj' : ''}"
              data-discipline="${esc(cls.discipline)}"
              data-type="${esc(cls.type || '')}"
              style="top:${topPx}px; height:${heightPx}px;"
              role="listitem"
              aria-label="${esc(cls.name)}, ${esc(cls.ageGroup)}, ${esc(cls.time)}"
              ${ariaHidden}
              title="${esc(cls.name)} — ${esc(cls.ageGroup)} — ${esc(cls.time)}"
              tabindex="0">
              ${DISC_LOGOS[cls.discipline] ? `<img src="${DISC_LOGOS[cls.discipline]}" alt="" class="week-block-watermark" loading="lazy">` : ''}
              <span class="tb-time">${esc(cls.startTime)} - ${esc(cls.endTime)}</span>
              <span class="tb-name">${formatCourseName(cls.name)}</span>
              <span class="tb-age">${esc(cls.ageGroup)}</span>
            </div>`;
        }).join('');
      } else {
        // Rest day
        blocksHtml = `
          <div class="week-col-empty" aria-label="Repos — aucun cours">
            <span class="week-col-repos" aria-hidden="true">Repos</span>
          </div>`;
      }

      const roleAttr = hasClasses ? ' role="list"' : '';

      return `
        <div class="week-col-wrapper${todayCls}"
             style="height:${totalHeight}px; position:relative;"
             ${roleAttr}
             aria-label="${(dayData ? esc(dayData.day) : '')}">
          <div class="week-col-inner" aria-hidden="true">${gridLines}</div>
          ${blocksHtml}
        </div>`;
    }).join('');

    // --- WEEK TITLE ---
    const titleEl = document.getElementById('week-title');
    if (titleEl) {
      titleEl.innerHTML = `
        <div class="week-title-month">Semaine type</div>`;
    }

    // --- WEEK GRID ---
    const container = document.getElementById('week-grid-container');
    if (!container) return;

    container.innerHTML = `
      <div class="week-view-wrapper" tabindex="0" aria-label="Grille horaire semaine — défilement horizontal possible">
        <div class="week-grid">
          ${labelHeaderHtml}
          ${dayHeadersHtml}
          ${axisHtml}
          ${dayColsHtml}
        </div>
      </div>`;
  }

  /* ============================================================
     DAY VIEW
     ============================================================ */

  /**
   * Find the best default day index in schedule[] to show:
   * today if it has classes, otherwise the next day that does.
   */
  function findDefaultDayIdx(schedule) {
    const todayJS = new Date().getDay();

    // Find schedule index for today
    let idx = schedule.findIndex(d => d.dayIndex === todayJS);
    if (idx === -1) idx = 0;

    // If today has classes, start there
    const todayData = schedule[idx];
    if (todayData && todayData.classes && todayData.classes.length > 0) return idx;

    // Otherwise find the next day in the week with classes (wrapping)
    for (let i = 1; i <= 7; i++) {
      const nextDI = (todayJS + i) % 7;
      const nextIdx = schedule.findIndex(d => d.dayIndex === nextDI);
      if (nextIdx !== -1 && schedule[nextIdx].classes && schedule[nextIdx].classes.length > 0) {
        return nextIdx;
      }
    }

    return 0;
  }

  function renderDayView(data) {
    const day = data.schedule[currentDayIdx];
    if (!day) return;

    // Use session-aware reference date (same logic as week view)
    let refDate = new Date();
    const sessionStartDate = data.sessionStart ? new Date(data.sessionStart + 'T00:00:00') : null;
    const sessionEndDate   = data.sessionEnd   ? new Date(data.sessionEnd   + 'T00:00:00') : null;
    if (sessionStartDate && refDate < sessionStartDate) refDate = sessionStartDate;
    if (sessionEndDate   && refDate > sessionEndDate)   refDate = sessionEndDate;

    const refJS = refDate.getDay();

    // Compute the actual calendar date for this day in the reference week
    const weekStart = new Date(refDate);
    weekStart.setDate(refDate.getDate() - refJS);
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + day.dayIndex);
    const dateYMD = toYMD(dayDate);
    const holiday = getHolidayForDate(dateYMD, data.holidays);

    // Day title
    const titleEl = document.getElementById('day-title');
    if (titleEl) {
      const todayJS = new Date().getDay();
      const isToday = day.dayIndex === todayJS && toYMD(new Date()) === dateYMD;
      titleEl.innerHTML = `
        <div class="day-title-name">${esc(day.day)}${isToday ? ' <span style="font-size:0.75rem; color:var(--gold); font-weight:700; vertical-align:middle;">Aujourd\'hui</span>' : ''}</div>
        <div class="day-title-date">${formatDateFr(dayDate)}</div>`;
    }

    // Classes list
    const listEl = document.getElementById('day-classes');
    if (!listEl) return;

    if (holiday) {
      listEl.innerHTML = `
        <div class="conge-card" role="status" aria-live="polite">
          <div class="conge-title">Congé</div>
          <div class="conge-reason">${esc(holiday.name)}</div>
        </div>`;
      return;
    }

    const classes = getClassesForDate(dateYMD, data.schedule, data.holidays)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    if (!classes.length) {
      listEl.innerHTML = `<p class="empty-day" role="status">Aucun cours ce jour.</p>`;
      return;
    }

    const cards = classes.map(cls => {
      const hiddenCls  = activeFilters.has(cls.discipline) ? '' : ' discipline-hidden';
      const ariaHidden = hiddenCls ? ' aria-hidden="true"' : '';
      const mixed = isMixedCourse(cls);

      return `
        <article
          class="day-card-v2 flex${hiddenCls}${mixed ? ' mixed-sk-jj' : ''}"
          data-discipline="${esc(cls.discipline)}"
          data-type="${esc(cls.type || '')}"
          role="listitem"
          ${ariaHidden}
          aria-label="${esc(cls.name)}, ${esc(cls.ageGroup)}, ${esc(cls.time)}">
          <div class="dc-left-border ${esc(cls.discipline)}${mixed ? ' mixed-border' : ''}" aria-hidden="true"></div>
          ${DISC_LOGOS[cls.discipline] ? `<img src="${DISC_LOGOS[cls.discipline]}" alt="" class="dc-logo ${esc(cls.discipline)}" loading="lazy">` : ''}
          <div class="dc-body">
            <div class="dc-header">
              <span class="dc-badge ${esc(cls.discipline)}">${esc(data.disciplines[cls.discipline]?.label || cls.discipline)}</span>
              <span class="dc-duration" aria-label="Durée ${esc(cls.duration)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                ${esc(cls.duration)}
              </span>
            </div>
            <div class="dc-name">${formatCourseName(cls.name)}</div>
            <div class="dc-age" aria-label="Groupe d'âge : ${esc(cls.ageGroup)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              ${esc(cls.ageGroup)}
            </div>
            ${cls.description ? `<div class="dc-desc">${esc(cls.description)}</div>` : ''}
            <div class="dc-time">${esc(cls.time)}</div>
          </div>
        </article>`;
    }).join('');

    listEl.innerHTML = cards;
  }

  function bindDayNav(schedule) {
    const prevBtn = document.getElementById('day-prev');
    const nextBtn = document.getElementById('day-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentDayIdx = (currentDayIdx - 1 + schedule.length) % schedule.length;
        renderDayView(appData);
        applyFilters();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentDayIdx = (currentDayIdx + 1) % schedule.length;
        renderDayView(appData);
        applyFilters();
      });
    }

    // Keyboard arrow navigation for day view
    document.addEventListener('keydown', e => {
      if (currentView !== 'jour') return;
      if (e.key === 'ArrowLeft') {
        currentDayIdx = (currentDayIdx - 1 + schedule.length) % schedule.length;
        renderDayView(appData);
        applyFilters();
        document.getElementById('day-prev')?.focus();
      } else if (e.key === 'ArrowRight') {
        currentDayIdx = (currentDayIdx + 1) % schedule.length;
        renderDayView(appData);
        applyFilters();
        document.getElementById('day-next')?.focus();
      }
    });
  }

  /* ============================================================
     MONTH VIEW
     ============================================================ */

  /**
   * Return the number of days in a given month (1-based month).
   */
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  /**
   * Return "YYYY-MM-DD" for a given year, month (1-based), day.
   */
  function ymd(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /**
   * Filter classes for a specific date, respecting date ranges and session bounds.
   */
  function getClassesForDate(dateYmd, schedule, holidays) {
    if (getHolidayForDate(dateYmd, holidays)) return [];
    if (!appData) return [];

    const d = new Date(dateYmd + 'T00:00:00');
    const jsDay = d.getDay();
    const dayData = schedule.find(dd => dd.dayIndex === jsDay);
    if (!dayData || !dayData.classes || !dayData.classes.length) return [];

    const dateRanges = appData.dateRanges || [];
    const sessionStart = appData.sessionStart || '';
    const sessionEnd   = appData.sessionEnd || '';

    return dayData.classes.filter(cls => {
      let start = sessionStart;
      let end   = sessionEnd;
      if (cls.dateRangeId) {
        const dr = dateRanges.find(r => r.id === cls.dateRangeId);
        if (dr) { start = dr.startDate; end = dr.endDate; }
      }
      return dateYmd >= start && dateYmd <= end;
    });
  }

  /**
   * Get the set of unique disciplines that have a class on a given YMD date.
   * Respects date ranges and session bounds.
   */
  function getDisciplinesForDate(dateYmd, schedule, holidays) {
    const classes = getClassesForDate(dateYmd, schedule, holidays);
    const discs = new Set();
    for (const cls of classes) {
      // Muay Thai enfants gets its own visual key (orange dot)
      if (cls.discipline === 'muaythai' && cls.type === 'Enfants') {
        discs.add('muaythai-enfants');
      } else {
        discs.add(cls.discipline);
      }
    }
    return discs;
  }

  /**
   * Get event(s) for a given YMD date.
   */
  function getEventsForDate(dateYmd, events) {
    if (!events) return [];
    return events.filter(e => e.date === dateYmd);
  }

  /**
   * Render the monthly calendar grid.
   */
  function renderMonthView(data) {
    const { schedule, holidays, events, disciplines } = data;

    const year  = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth() + 1; // 1-based

    const today     = new Date();
    const todayYMD  = toYMD(today);

    // Update month title
    const titleEl = document.getElementById('month-title');
    if (titleEl) {
      const monthName = new Date(year, month - 1, 1).toLocaleDateString('fr-CA', {
        month: 'long',
        year: 'numeric',
      });
      // Capitalize first letter
      titleEl.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }

    const firstDayOfMonth = new Date(year, month - 1, 1);
    const startDayJS      = firstDayOfMonth.getDay(); // 0=Sun
    const totalDays       = daysInMonth(year, month);

    // Day headers: DIM LUN MAR MER JEU VEN SAM
    const dayHeaders = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']
      .map(d => `<div class="month-cell month-header-cell" aria-hidden="true">${d}</div>`)
      .join('');

    // Build cells array
    const cells = [];

    // Blank cells for days before month start
    for (let i = 0; i < startDayJS; i++) {
      cells.push(`<div class="month-cell month-cell-empty" aria-hidden="true"></div>`);
    }

    // Day cells
    for (let day = 1; day <= totalDays; day++) {
      const dateStr  = ymd(year, month, day);
      const isToday  = dateStr === todayYMD;
      const holiday  = getHolidayForDate(dateStr, holidays);
      const dayEvents = getEventsForDate(dateStr, events);
      const discs    = getDisciplinesForDate(dateStr, schedule, holidays);

      let cellClasses = 'month-cell month-cell-day';
      if (isToday)  cellClasses += ' month-cell-today';
      if (holiday)  cellClasses += ' month-cell-holiday';

      // Selected state
      const isSelected = selectedMonthDay === dateStr;
      if (isSelected) cellClasses += ' month-cell-selected';

      // Discipline dots (respecting active filters)
      const VISUAL_COLORS = { 'muaythai-enfants': '#ea580c' };
      const discDots = Array.from(discs).map(disc => {
        const color = VISUAL_COLORS[disc] || (disciplines[disc] ? disciplines[disc].color : '#888');
        // muaythai-enfants should filter with muaythai
        const filterKey = disc === 'muaythai-enfants' ? 'muaythai' : disc;
        const hiddenCls = activeFilters.has(filterKey) ? '' : ' discipline-hidden';
        return `<span class="month-indicator-dot${hiddenCls}" data-discipline="${esc(filterKey)}" style="background:${esc(color)};" aria-hidden="true"></span>`;
      }).join('');

      // Star for events
      const eventStar = dayEvents.length
        ? `<span class="month-event-star" aria-label="Événement spécial" aria-hidden="true">&#9733;</span>`
        : '';

      // Holiday ring is applied via CSS class on the cell; number gets a ring span
      const dayNumHtml = holiday
        ? `<span class="month-day-num month-day-holiday-ring" aria-label="${day}, congé: ${esc(holiday.name)}">${day}</span>`
        : `<span class="month-day-num">${day}</span>`;

      cells.push(`
        <button
          class="${cellClasses}"
          data-date="${dateStr}"
          aria-label="${day} ${new Date(year, month - 1, day).toLocaleDateString('fr-CA', { month: 'long' })}${isToday ? ', aujourd\'hui' : ''}${holiday ? ', congé: ' + holiday.name : ''}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
          type="button">
          ${dayNumHtml}
          ${eventStar}
          <div class="month-indicators-row" aria-hidden="true">${discDots}</div>
        </button>`);
    }

    const calendarEl = document.getElementById('month-calendar');
    if (!calendarEl) return;

    calendarEl.innerHTML = `
      <div class="month-grid" role="grid" aria-label="Calendrier ${month}/${year}">
        ${dayHeaders}
        ${cells.join('')}
      </div>`;

    // Bind day cell clicks
    calendarEl.querySelectorAll('.month-cell-day').forEach(cell => {
      cell.addEventListener('click', () => {
        selectedMonthDay = cell.dataset.date;
        renderMonthDayDetail(data, selectedMonthDay);
        // Update pressed states
        calendarEl.querySelectorAll('.month-cell-day').forEach(c => {
          const isNowSelected = c.dataset.date === selectedMonthDay;
          c.classList.toggle('month-cell-selected', isNowSelected);
          c.setAttribute('aria-pressed', isNowSelected ? 'true' : 'false');
        });
      });
    });

    // Default: show today or next day with classes
    if (!selectedMonthDay) {
      // Find first day in this month that has classes
      const defaultDate = findDefaultMonthDay(year, month, schedule, holidays);
      selectedMonthDay = defaultDate;
    }
    renderMonthDayDetail(data, selectedMonthDay);

    // Mark the selected cell
    calendarEl.querySelectorAll('.month-cell-day').forEach(c => {
      const isNowSelected = c.dataset.date === selectedMonthDay;
      c.classList.toggle('month-cell-selected', isNowSelected);
      c.setAttribute('aria-pressed', isNowSelected ? 'true' : 'false');
    });
  }

  /**
   * Find best default day to show in month view: today if it has classes,
   * otherwise the next day in the month with classes.
   */
  function findDefaultMonthDay(year, month, schedule, holidays) {
    const today = new Date();
    const total = daysInMonth(year, month);

    // If current month, start from today; otherwise start from day 1
    const startDay = (today.getFullYear() === year && today.getMonth() + 1 === month)
      ? today.getDate()
      : 1;

    for (let d = startDay; d <= total; d++) {
      const dateStr = ymd(year, month, d);
      if (getHolidayForDate(dateStr, holidays)) continue;
      const discs = getDisciplinesForDate(dateStr, schedule, holidays);
      if (discs.size > 0) return dateStr;
    }

    // Fallback: first day of month
    return ymd(year, month, 1);
  }

  /**
   * Render the day detail panel under the month calendar.
   */
  function renderMonthDayDetail(data, dateYmd) {
    const detailEl = document.getElementById('month-day-detail');
    if (!detailEl || !dateYmd) return;

    const { schedule, holidays, events, disciplines } = data;
    const d        = new Date(dateYmd + 'T00:00:00');
    const jsDay    = d.getDay();
    const holiday  = getHolidayForDate(dateYmd, holidays);
    const dayEvents = getEventsForDate(dateYmd, events);

    const labelDate = d.toLocaleDateString('fr-CA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const capDate = labelDate.charAt(0).toUpperCase() + labelDate.slice(1);

    let content = `<div class="month-detail-header">Sessions du ${capDate}</div>`;

    if (holiday) {
      content += `
        <div class="month-detail-holiday">
          <span class="month-detail-holiday-label">Congé</span>
          <span>${esc(holiday.name)}</span>
        </div>`;
    }

    // Events for this day
    for (const evt of dayEvents) {
      content += `
        <div class="month-detail-event">
          <span class="month-detail-event-name">${esc(evt.name)}</span>
          ${evt.important ? '<span class="month-detail-event-badge">Important</span>' : ''}
          ${evt.description ? `<span class="month-detail-event-desc">${esc(evt.description)}</span>` : ''}
        </div>`;
    }

    if (!holiday) {
      const classes = getClassesForDate(dateYmd, schedule, holidays)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      if (classes.length === 0 && dayEvents.length === 0) {
        content += `<p class="month-detail-empty">Aucun cours ce jour.</p>`;
      }

      for (const cls of classes) {
        const hiddenCls  = activeFilters.has(cls.discipline) ? '' : ' discipline-hidden';
        const ariaHidden = hiddenCls ? ' aria-hidden="true"' : '';
        const color      = disciplines[cls.discipline] ? disciplines[cls.discipline].color : '#888';
        const mixed = isMixedCourse(cls);

        content += `
          <div class="month-detail-card${hiddenCls}${mixed ? ' mixed-sk-jj' : ''}" data-discipline="${esc(cls.discipline)}" data-type="${esc(cls.type || '')}" ${ariaHidden} role="listitem">
            ${DISC_LOGOS[cls.discipline] ? `<img src="${DISC_LOGOS[cls.discipline]}" alt="" class="month-detail-logo ${esc(cls.discipline)}" loading="lazy">` : ''}
            <div class="month-detail-card-time" style="color:${esc(color)};">
              <span class="month-detail-start">${esc(cls.startTime)}</span>
              <span class="month-detail-end">${esc(cls.endTime)}</span>
            </div>
            <div class="month-detail-card-info">
              <div class="month-detail-card-name">${formatCourseName(cls.name)}</div>
              <div class="month-detail-card-meta">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                </svg>
                ${esc(cls.ageGroup)}
              </div>
            </div>
          </div>`;
      }
    }

    detailEl.innerHTML = content;
  }

  /**
   * Bind month navigation buttons.
   */
  function bindMonthNav() {
    const prevBtn = document.getElementById('month-prev');
    const nextBtn = document.getElementById('month-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentMonthDate = new Date(
          currentMonthDate.getFullYear(),
          currentMonthDate.getMonth() - 1,
          1
        );
        selectedMonthDay = null;
        renderMonthView(appData);
        applyFilters();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentMonthDate = new Date(
          currentMonthDate.getFullYear(),
          currentMonthDate.getMonth() + 1,
          1
        );
        selectedMonthDay = null;
        renderMonthView(appData);
        applyFilters();
      });
    }
  }

  /**
   * Bind week navigation buttons.
   */
  function bindWeekNav() {
    const prevBtn = document.getElementById('week-prev');
    const nextBtn = document.getElementById('week-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        renderWeekView(appData);
        applyFilters();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        renderWeekView(appData);
        applyFilters();
      });
    }
  }

  /* ============================================================
     SESSION VIEW
     ============================================================ */

  /**
   * Calculate total hours per week from all classes (in minutes, convert to h).
   */
  function calcWeeklyStats(schedule) {
    let totalMins  = 0;
    let totalCount = 0;
    const discStats = {}; // discipline -> { mins, count, classes[] }

    for (const day of schedule) {
      for (const cls of (day.classes || [])) {
        const start = timeToMinutes(cls.startTime);
        const end   = timeToMinutes(cls.endTime);
        const dur   = end - start;
        totalMins  += dur;
        totalCount += 1;

        if (!discStats[cls.discipline]) {
          discStats[cls.discipline] = { mins: 0, count: 0, classes: [] };
        }
        discStats[cls.discipline].mins  += dur;
        discStats[cls.discipline].count += 1;
        discStats[cls.discipline].classes.push({ name: cls.name, ageGroup: cls.ageGroup, day: day.day });
      }
    }

    return { totalMins, totalCount, discStats };
  }

  /**
   * Format minutes as "Xh" or "Xh30".
   */
  function formatHours(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  /**
   * Format a "YYYY-MM-DD" string as "D Mois" in French.
   */
  function formatDateShort(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  }

  /**
   * Build a merged, chronologically sorted timeline of holidays + events.
   */
  function buildTimeline(holidays, events) {
    const items = [];

    for (const h of (holidays || [])) {
      items.push({
        type: 'holiday',
        date: h.date,
        endDate: h.endDate || h.date,
        name: h.name,
        description: h.endDate && h.endDate !== h.date
          ? `Du ${formatDateShort(h.date)} au ${formatDateShort(h.endDate)}`
          : formatDateShort(h.date),
        important: false,
      });
    }

    for (const e of (events || [])) {
      items.push({
        type: 'event',
        date: e.date,
        endDate: e.endDate || e.date,
        name: e.name,
        description: e.description || '',
        important: e.important || false,
      });
    }

    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return items;
  }

  /**
   * Render the session overview view.
   */
  function renderSessionView(data) {
    const { session, sessionStart, sessionEnd, schedule, holidays, events, disciplines, dateRanges } = data;

    // --- Session Header ---
    const headerEl = document.getElementById('session-view-header');
    if (headerEl) {
      const formatDateLong = (d) => d
        ? new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';

      const startFr = formatDateLong(sessionStart);
      const endFr   = formatDateLong(sessionEnd);

      // Check if date ranges exist and have different dates
      const ranges = dateRanges || [];
      const allSameDates = ranges.length === 0 || ranges.every(r =>
        r.startDate === sessionStart && r.endDate === sessionEnd
      );

      let datesHtml = '';
      if (ranges.length > 0 && !allSameDates) {
        // Show individual date ranges
        datesHtml = '<div class="session-date-ranges">' +
          ranges.map(r => {
            const s = formatDateLong(r.startDate);
            const e = formatDateLong(r.endDate);
            return `<p class="session-dates session-date-range-item"><strong>${esc(r.name)}</strong> : ${s} — ${e}</p>`;
          }).join('') +
          '</div>';
      } else if (startFr && endFr) {
        // All same dates or no ranges — show single date line
        datesHtml = `<p class="session-dates">${startFr} — ${endFr}</p>`;
      }

      headerEl.innerHTML = `
        <h2 class="session-title">Planning ${esc(session)}</h2>
        ${datesHtml}`;
    }

    // --- Stats ---
    const { totalMins, totalCount, discStats } = calcWeeklyStats(schedule);
    const statsEl = document.getElementById('session-stats');
    if (statsEl) {
      const disciplineCount = Object.keys(disciplines).length;
      statsEl.innerHTML = `
        <div class="session-stat-card" role="listitem">
          <div class="session-stat-label">Volume Horaire Total</div>
          <div class="session-stat-value">${formatHours(totalMins)}</div>
          <div class="session-stat-sub">par semaine</div>
        </div>
        <div class="session-stat-card" role="listitem">
          <div class="session-stat-label">Cours par Semaine</div>
          <div class="session-stat-value">${totalCount}</div>
          <div class="session-stat-sub">cours réguliers</div>
        </div>
        <div class="session-stat-card" role="listitem">
          <div class="session-stat-label">Disciplines</div>
          <div class="session-stat-value">${disciplineCount}</div>
          <div class="session-stat-sub">programmes actifs</div>
        </div>`;
    }

    // --- Timeline ---
    const timelineEl = document.getElementById('session-timeline');
    if (timelineEl) {
      const items = buildTimeline(holidays, events);
      if (!items.length) {
        timelineEl.innerHTML = `<p class="session-empty">Aucun événement pour cette session.</p>`;
      } else {
        timelineEl.innerHTML = items.map((item, idx) => {
          const isLast   = idx === items.length - 1;
          const typeClass = item.type === 'holiday' ? 'timeline-item-holiday' : 'timeline-item-event';
          const dotColor  = item.type === 'holiday' ? 'var(--red)' : 'var(--gold)';

          const dateLabel = item.endDate && item.endDate !== item.date
            ? `${formatDateShort(item.date)} – ${formatDateShort(item.endDate)}`
            : formatDateShort(item.date);

          return `
            <div class="session-timeline-item ${typeClass}" role="listitem">
              <div class="tl-connector" aria-hidden="true">
                <div class="tl-dot" style="background:${dotColor};"></div>
                ${!isLast ? '<div class="tl-line"></div>' : ''}
              </div>
              <div class="tl-content">
                <div class="tl-header">
                  <span class="tl-name">${esc(item.name)}</span>
                  <span class="tl-date-badge">${dateLabel}</span>
                  ${item.important ? '<span class="tl-important-badge">Important</span>' : ''}
                </div>
                ${item.description ? `<div class="tl-desc">${esc(item.description)}</div>` : ''}
              </div>
            </div>`;
        }).join('');
      }
    }

    // --- Groups / Disciplines ---
    const groupsEl = document.getElementById('session-groups');
    if (groupsEl) {
      const discEntries = Object.entries(disciplines);

      if (!discEntries.length) {
        groupsEl.innerHTML = `<p class="session-empty">Aucune donnée de groupe.</p>`;
      } else {
        groupsEl.innerHTML = discEntries.map(([key, disc]) => {
          const stats     = discStats[key] || { mins: 0, count: 0, classes: [] };
          const hiddenCls = activeFilters.has(key) ? '' : ' discipline-hidden';
          const ariaHidden = hiddenCls ? ' aria-hidden="true"' : '';

          // Build breakdown: group classes by ageGroup
          const ageGroups = {};
          for (const c of stats.classes) {
            if (!ageGroups[c.ageGroup]) ageGroups[c.ageGroup] = 0;
            ageGroups[c.ageGroup]++;
          }
          const breakdownHtml = Object.entries(ageGroups)
            .map(([ag, cnt]) => `${esc(ag)} : ${cnt} cours`)
            .join(' &bull; ');

          return `
            <div class="session-group-row${hiddenCls}" data-discipline="${esc(key)}" ${ariaHidden} role="listitem">
              <div class="session-group-dot" style="background:${esc(disc.color)};" aria-hidden="true"></div>
              <div class="session-group-info">
                <div class="session-group-name">${esc(disc.label)}</div>
                ${breakdownHtml ? `<div class="session-group-breakdown">${breakdownHtml}</div>` : ''}
              </div>
              <div class="session-group-stats">
                <span class="session-group-hours">${formatHours(stats.mins)}</span>
                <span class="session-group-count">${stats.count} cours/sem</span>
              </div>
            </div>`;
        }).join('');
      }
    }
  }

  /* ============================================================
     ADMIN — SESSIONS MANAGEMENT
     ============================================================ */

  const ADMIN_PASSWORD = 'amf2026admin';
  const ARCHIVE_PREFIX = '[ARCHIVE] '; // Workaround: no is_archived column yet — detect via name prefix
  let adminAuthed = false;
  let adminSessions = [];   // all sessions from Supabase
  let adminCurrentIdx = 0;  // index into adminSessions for the navigator

  /**
   * Check if a session is archived (workaround: name starts with "[ARCHIVE] ").
   * When the is_archived column exists in Supabase, this will use it instead.
   */
  function isSessionArchived(sess) {
    // Prefer DB column if present
    if (typeof sess.is_archived === 'boolean') return sess.is_archived;
    // Fallback: name prefix convention
    return (sess.name || '').startsWith(ARCHIVE_PREFIX);
  }

  /**
   * Get display name (strips archive prefix if present).
   */
  function sessionDisplayName(sess) {
    const name = sess.name || sess.id;
    return name.startsWith(ARCHIVE_PREFIX) ? name.slice(ARCHIVE_PREFIX.length) : name;
  }

  /**
   * Supabase POST/PATCH/DELETE helper for admin writes.
   */
  async function sbWrite(table, method, body, query) {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query || ''}`;
    const headers = {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'dojo',
      'Content-Profile': 'dojo',
      'Prefer': method === 'POST'
        ? 'resolution=merge-duplicates,return=representation'
        : 'return=representation',
    };
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${table}: ${res.status} — ${text}`);
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : null;
  }

  /**
   * Fetch all sessions from Supabase, sorted by start_date desc.
   */
  async function adminLoadSessions() {
    adminSessions = await sbQuery('schedule_sessions', 'select=*&order=start_date.desc');
    adminSessions.reverse(); // Invert order: oldest first (Hiver, then Printemps)
    if (!adminSessions.length) {
      adminSessions = [];
    }
  }

  /**
   * Get the session status label + badge class.
   */
  function getSessionStatus(sess) {
    if (isSessionArchived(sess)) return { label: 'Archive', cls: 'admin-badge-archived' };
    if (sess.is_current)  return { label: 'Actif', cls: 'admin-badge-active' };
    // Future = "En construction"
    const now = new Date();
    const start = sess.start_date ? new Date(sess.start_date + 'T00:00:00') : null;
    if (start && start > now) return { label: 'En construction', cls: 'admin-badge-building' };
    return { label: 'Inactif', cls: 'admin-badge-building' };
  }

  /**
   * Format date for admin display.
   */
  function adminFormatDate(d) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  /**
   * Render the admin panel for the current session index.
   */
  function renderAdminPanel() {
    if (!adminSessions.length) {
      document.getElementById('admin-session-info').innerHTML =
        '<p class="admin-session-name" style="color:var(--text-muted);">Aucune session</p>';
      document.getElementById('admin-status-row').innerHTML = '';
      document.getElementById('admin-detail-card').innerHTML =
        '<p style="text-align:center;color:var(--text-muted);padding:1rem;">Creez votre premiere session.</p>';
      document.getElementById('admin-actions').innerHTML =
        '<button class="admin-btn-primary" onclick="window.__adminCreate()">+ Nouvelle session</button>';
      document.getElementById('admin-session-prev').disabled = true;
      document.getElementById('admin-session-next').disabled = true;
      return;
    }

    // Clamp index
    if (adminCurrentIdx < 0) adminCurrentIdx = 0;
    if (adminCurrentIdx >= adminSessions.length) adminCurrentIdx = adminSessions.length - 1;

    const sess = adminSessions[adminCurrentIdx];
    const status = getSessionStatus(sess);

    // Nav arrows
    document.getElementById('admin-session-prev').disabled = adminCurrentIdx <= 0;
    document.getElementById('admin-session-next').disabled = adminCurrentIdx >= adminSessions.length - 1;

    // Session info
    document.getElementById('admin-session-info').innerHTML = `
      <div class="admin-session-name">${esc(sessionDisplayName(sess))}</div>
      <div class="admin-session-dates">${adminFormatDate(sess.start_date)} — ${adminFormatDate(sess.end_date)}</div>
      <div class="admin-session-counter">${adminCurrentIdx + 1} / ${adminSessions.length}</div>`;

    // Status badges
    document.getElementById('admin-status-row').innerHTML =
      `<span class="admin-badge ${status.cls}">${status.label}</span>` +
      (sess.is_current ? '<span class="admin-badge admin-badge-active">&#9679; Session courante</span>' : '');

    // Count courses for this session (approximate — courses may not be session-scoped)
    const courseCount = appData ? appData.schedule.reduce((sum, d) => sum + d.classes.length, 0) : '?';

    // Detail card
    const isArchived = isSessionArchived(sess);
    document.getElementById('admin-detail-card').innerHTML = `
      <div class="admin-detail-row">
        <span class="admin-detail-label">ID</span>
        <span class="admin-detail-value" style="font-family:monospace;font-size:0.8rem;">${esc(sess.id)}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-label">Nom</span>
        <span class="admin-detail-value">${esc(sessionDisplayName(sess))}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-label">Debut</span>
        <span class="admin-detail-value">${adminFormatDate(sess.start_date)}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-label">Fin</span>
        <span class="admin-detail-value">${adminFormatDate(sess.end_date)}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-label">Cours</span>
        <span class="admin-detail-value">${courseCount} cours/semaine</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-label">Cree le</span>
        <span class="admin-detail-value">${sess.created_at ? new Date(sess.created_at).toLocaleDateString('fr-CA') : '—'}</span>
      </div>
      ${isArchived ? '<div style="text-align:center;padding:0.5rem 0;color:var(--text-muted);font-size:0.8rem;font-style:italic;">Session archivee — lecture seule</div>' : ''}`;

    // Actions
    const actions = [];
    actions.push('<button class="admin-btn-primary" onclick="window.__adminCreate()">+ Nouvelle session</button>');
    actions.push('<button class="admin-btn-secondary" onclick="window.__adminDuplicate()">&#128203; Dupliquer</button>');

    if (!isArchived) {
      if (sess.is_current) {
        actions.push('<button class="admin-btn-secondary" onclick="window.__adminToggleActive()" style="border-color:var(--red);color:var(--red-light);">Desactiver</button>');
      } else {
        actions.push('<button class="admin-btn-primary" onclick="window.__adminToggleActive()" style="background:#22c55e;">&#9889; Activer</button>');
      }
      actions.push('<button class="admin-btn-secondary" onclick="window.__adminEdit()">&#9998; Modifier</button>');
      actions.push('<button class="admin-btn-danger" onclick="window.__adminArchive()">&#128451; Archiver</button>');
    }

    document.getElementById('admin-actions').innerHTML = actions.join('');
  }

  /**
   * Show admin toast notification.
   */
  function adminToast(msg) {
    let toast = document.querySelector('.admin-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'admin-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  /**
   * Show confirmation dialog. Returns a promise that resolves true/false.
   */
  function adminConfirm(message) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('admin-confirm-overlay');
      document.getElementById('admin-confirm-msg').textContent = message;
      overlay.classList.remove('hidden');

      const yes = document.getElementById('admin-confirm-yes');
      const no  = document.getElementById('admin-confirm-no');

      function cleanup() {
        overlay.classList.add('hidden');
        yes.replaceWith(yes.cloneNode(true));
        no.replaceWith(no.cloneNode(true));
      }

      document.getElementById('admin-confirm-yes').addEventListener('click', () => { cleanup(); resolve(true); });
      document.getElementById('admin-confirm-no').addEventListener('click', () => { cleanup(); resolve(false); });
    });
  }

  /**
   * Validate session form: dates, overlap.
   * Returns { valid, error }.
   */
  function validateSessionForm(name, startDate, endDate, excludeId) {
    if (!name.trim()) return { valid: false, error: 'Le nom est requis.' };
    if (!startDate || !endDate) return { valid: false, error: 'Les deux dates sont requises.' };
    if (startDate >= endDate) return { valid: false, error: 'La date de debut doit etre avant la date de fin.' };

    // Check overlap with other sessions
    for (const s of adminSessions) {
      if (s.id === excludeId) continue;
      if (isSessionArchived(s)) continue;
      if (startDate <= s.end_date && endDate >= s.start_date) {
        return {
          valid: false,
          error: `Chevauchement avec "${s.name}" (${s.start_date} → ${s.end_date}). Verifiez les dates.`
        };
      }
    }

    return { valid: true, error: null };
  }

  /**
   * Generate a slug ID from session name.
   */
  function slugify(str) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Show the session create/edit form.
   */
  function showSessionForm(mode, sess) {
    const container = document.getElementById('admin-form-container');
    const title = document.getElementById('admin-form-title');
    const submit = document.getElementById('admin-form-submit');
    const nameInput = document.getElementById('admin-f-name');
    const startInput = document.getElementById('admin-f-start');
    const endInput = document.getElementById('admin-f-end');
    const errorEl = document.getElementById('admin-form-error');

    errorEl.classList.add('hidden');
    container.classList.remove('hidden');

    if (mode === 'create') {
      title.textContent = 'Nouvelle session';
      submit.textContent = 'Creer';
      nameInput.value = '';
      startInput.value = '';
      endInput.value = '';
    } else if (mode === 'edit') {
      title.textContent = 'Modifier la session';
      submit.textContent = 'Sauvegarder';
      nameInput.value = sessionDisplayName(sess);
      startInput.value = sess.start_date || '';
      endInput.value = sess.end_date || '';
    } else if (mode === 'duplicate') {
      title.textContent = 'Dupliquer la session';
      submit.textContent = 'Dupliquer';
      nameInput.value = sessionDisplayName(sess) + ' (copie)';
      startInput.value = '';
      endInput.value = '';
    }

    // Store mode in form dataset
    const form = document.getElementById('admin-session-form');
    form.dataset.mode = mode;
    form.dataset.editId = sess ? sess.id : '';

    nameInput.focus();
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Bind all admin event listeners.
   */
  function bindAdmin() {
    // Login form
    document.getElementById('admin-login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const pw = document.getElementById('admin-password').value;
      if (pw === ADMIN_PASSWORD) {
        adminAuthed = true;
        document.getElementById('admin-gate').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');
        adminLoadSessions().then(() => {
          // Try to set current session as the initial view
          const currentIdx = adminSessions.findIndex(s => s.is_current);
          adminCurrentIdx = currentIdx >= 0 ? currentIdx : 0;
          renderAdminPanel();
        });
      } else {
        document.getElementById('admin-login-error').classList.remove('hidden');
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-password').focus();
      }
    });

    // Nav arrows
    document.getElementById('admin-session-prev').addEventListener('click', () => {
      if (adminCurrentIdx > 0) {
        adminCurrentIdx--;
        renderAdminPanel();
      }
    });
    document.getElementById('admin-session-next').addEventListener('click', () => {
      if (adminCurrentIdx < adminSessions.length - 1) {
        adminCurrentIdx++;
        renderAdminPanel();
      }
    });

    // Form cancel
    document.getElementById('admin-form-cancel').addEventListener('click', () => {
      document.getElementById('admin-form-container').classList.add('hidden');
    });

    // Form submit
    document.getElementById('admin-session-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const mode = form.dataset.mode;
      const editId = form.dataset.editId;
      const name = document.getElementById('admin-f-name').value.trim();
      const startDate = document.getElementById('admin-f-start').value;
      const endDate = document.getElementById('admin-f-end').value;
      const errorEl = document.getElementById('admin-form-error');

      const excludeId = mode === 'edit' ? editId : null;
      const check = validateSessionForm(name, startDate, endDate, excludeId);
      if (!check.valid) {
        errorEl.textContent = check.error;
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');

      try {
        if (mode === 'create' || mode === 'duplicate') {
          const newId = slugify(name) || ('session-' + Date.now());
          await sbWrite('schedule_sessions', 'POST', [{
            id: newId,
            name: name,
            start_date: startDate,
            end_date: endDate,
            is_current: false,
          }]);
          adminToast('Session creee!');
        } else if (mode === 'edit') {
          await sbWrite('schedule_sessions', 'PATCH', {
            name: name,
            start_date: startDate,
            end_date: endDate,
          }, `?id=eq.${editId}`);
          adminToast('Session modifiee!');
        }

        // Reload
        await adminLoadSessions();
        if (mode === 'create' || mode === 'duplicate') {
          adminCurrentIdx = 0; // newest first
        }
        renderAdminPanel();
        document.getElementById('admin-form-container').classList.add('hidden');
      } catch (err) {
        errorEl.textContent = 'Erreur Supabase: ' + err.message;
        errorEl.classList.remove('hidden');
      }
    });

    // Expose global action handlers (called from onclick in rendered HTML)
    window.__adminCreate = () => showSessionForm('create', null);

    window.__adminEdit = () => {
      const sess = adminSessions[adminCurrentIdx];
      if (sess) showSessionForm('edit', sess);
    };

    window.__adminDuplicate = () => {
      const sess = adminSessions[adminCurrentIdx];
      if (sess) showSessionForm('duplicate', sess);
    };

    window.__adminToggleActive = async () => {
      const sess = adminSessions[adminCurrentIdx];
      if (!sess) return;

      if (sess.is_current) {
        // Deactivate
        const ok = await adminConfirm(`Desactiver la session "${sessionDisplayName(sess)}"?\n\nLe site n'affichera plus aucune session active.`);
        if (!ok) return;
        try {
          await sbWrite('schedule_sessions', 'PATCH', { is_current: false }, `?id=eq.${sess.id}`);
          adminToast('Session desactivee');
          await adminLoadSessions();
          renderAdminPanel();
        } catch (err) {
          adminToast('Erreur: ' + err.message);
        }
      } else {
        // Activate — deactivate all others first
        const ok = await adminConfirm(`Activer la session "${sessionDisplayName(sess)}"?\n\nToutes les autres sessions seront desactivees.`);
        if (!ok) return;
        try {
          // Deactivate all
          await sbWrite('schedule_sessions', 'PATCH', { is_current: false }, '?is_current=eq.true');
          // Activate this one
          await sbWrite('schedule_sessions', 'PATCH', { is_current: true }, `?id=eq.${sess.id}`);
          adminToast('Session activee!');
          await adminLoadSessions();
          const newIdx = adminSessions.findIndex(s => s.id === sess.id);
          if (newIdx >= 0) adminCurrentIdx = newIdx;
          renderAdminPanel();
        } catch (err) {
          adminToast('Erreur: ' + err.message);
        }
      }
    };

    window.__adminArchive = async () => {
      const sess = adminSessions[adminCurrentIdx];
      if (!sess) return;

      const displayName = sessionDisplayName(sess);
      const ok = await adminConfirm(`Archiver la session "${displayName}"?\n\nElle restera consultable mais en lecture seule.`);
      if (!ok) return;

      try {
        // Workaround: no is_archived column — prefix name with "[ARCHIVE] "
        // Also deactivate if currently active
        const archivedName = ARCHIVE_PREFIX + displayName;
        const updates = { name: archivedName };
        if (sess.is_current) updates.is_current = false;
        await sbWrite('schedule_sessions', 'PATCH', updates, `?id=eq.${sess.id}`);
        adminToast('Session archivee');
        await adminLoadSessions();
        renderAdminPanel();
      } catch (err) {
        adminToast('Erreur: ' + err.message);
      }
    };
  }

  /* ============================================================
     BOOT / INIT
     ============================================================ */

  async function init() {
    showLoading();
    bindFilters();
    bindViewToggle();
    bindAdmin();

    try {
      const data = await loadSchedule();
      appData = data;

      // Set month view to session start (or today if no session dates)
      if (data.sessionStart) {
        currentMonthDate = new Date(data.sessionStart + 'T00:00:00');
      } else {
        currentMonthDate = new Date();
      }

      renderHeader(data);
      renderLegend(data.disciplines);
      renderAnnouncements(data.announcements || []);
      renderUpcomingEvents(data.events || [], data.sessionStart, data.sessionEnd);
      renderUpcomingHolidays(data.holidays || []);

      // Set initial day index for jour view
      currentDayIdx = findDefaultDayIdx(data.schedule);

      // Set initial week start (session-aware)
      {
        let refDate = new Date();
        const startD = data.sessionStart ? new Date(data.sessionStart + 'T00:00:00') : null;
        const endD   = data.sessionEnd   ? new Date(data.sessionEnd   + 'T00:00:00') : null;
        if (startD && refDate < startD) refDate = startD;
        if (endD   && refDate > endD)   refDate = endD;
        currentWeekStart = new Date(refDate);
        currentWeekStart.setDate(refDate.getDate() - refDate.getDay());
      }

      // Render both views
      renderWeekView(data);
      renderDayView(data);
      bindDayNav(data.schedule);
      bindMonthNav();
      bindWeekNav();

      // Apply any pre-existing filter state (all on by default)
      applyFilters();

      // Countdown: initial + every minute
      updateCountdown();
      setInterval(updateCountdown, 60 * 1000);

    } catch (err) {
      showError('Impossible de charger l\'horaire. Vérifiez votre connexion ou rechargez la page.');
    }
  }

  /* ============================================================
     MAILTO FALLBACK — copy email to clipboard if no handler
     ============================================================ */

  function setupMailtoFallback() {
    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const email = link.href.replace('mailto:', '');
        // Copy to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(email).then(() => {
            showEmailToast('Adresse copiée : ' + email);
          });
        }
        // Let the browser also try mailto: (don't preventDefault)
      });
    });
  }

  function showEmailToast(msg) {
    let toast = document.querySelector('.email-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'email-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); setupMailtoFallback(); });
  } else {
    init();
    setupMailtoFallback();
  }

})();
