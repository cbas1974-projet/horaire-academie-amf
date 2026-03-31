#!/usr/bin/env node
/**
 * Seed Supabase from schedule.json — ONE-SHOT script
 * Run: node seed-supabase.js
 *
 * Reads schedule.json and inserts into dojo.schedule_* tables.
 * Uses Supabase REST API directly (no npm install needed).
 */

const fs = require('fs');
const path = require('path');

// ── Supabase config ──────────────────────────────────────────
const SUPABASE_URL = 'https://enkwnelkwlvlyjvbwyzq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVua3duZWxrd2x2bHlqdmJ3eXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMzU1MjgsImV4cCI6MjA4NDYxMTUyOH0.SzvyfEQGjfav927--cYQZVF8jJ47B6V9jHrNh6KuT6M';

// ── ID mapping: schedule.json → JC-compatible IDs ────────────
// Courses tracked by Gracie Combatives keep their JC IDs
// so gc_variation_history references stay valid.
const COURSE_ID_MAP = {
  c1:  'dim-16h-superkids',
  c2:  'dim-17h-enfants-deb',
  c3:  'dim-18h-enfants',       // GC tracked
  c4:  'dim-19h-avance',        // GC tracked
  c5:  'lun-19h10-muaythai',
  c6:  'lun-20h-muaythai',
  c7:  'mar-17h45-enfants',     // GC tracked
  c8:  'mar-18h45-ado',         // GC tracked
  c9:  'mer-19h30-muaythai',
  c10: 'jeu-17h45-superkids',
  c11: 'jeu-18h30-avance',      // GC tracked
  c12: 'jeu-19h30-adulte',      // GC tracked
};

// Courses tracked in Junior Combative (Gracie Combatives)
const GC_TRACKED_IDS = new Set([
  'dim-18h-enfants', 'dim-19h-avance',
  'mar-17h45-enfants', 'mar-18h45-ado',
  'jeu-18h30-avance', 'jeu-19h30-adulte',
]);

// JC type mapping (for GC-tracked courses)
const JC_TYPE_MAP = {
  'dim-18h-enfants':    'Enfants',
  'dim-19h-avance':     'Ado',
  'mar-17h45-enfants':  'Enfants',
  'mar-18h45-ado':      'Ado',
  'jeu-18h30-avance':   'Enfants',
  'jeu-19h30-adulte':   'Adulte',
};

const JC_ADVANCED_MAP = {
  'dim-19h-avance': true,
  'jeu-18h30-avance': true,
};

// Inactive JC courses (historical — for gc_variation_history references)
const INACTIVE_GC_COURSES = [
  { id: 'lun-19h-adulte',     day: 'Lundi',  day_index: 1, start_time: '19:00', end_time: '20:00', name: 'Adultes (ancien)', description: 'Jiu-Jitsu', age_group: 'Adultes', discipline: 'jiujitsu', type: 'Adulte', is_advanced: false },
  { id: 'mar-19h45-adulte',   day: 'Mardi',  day_index: 2, start_time: '19:45', end_time: '21:00', name: 'Adultes (ancien)', description: 'Jiu-Jitsu', age_group: 'Adultes', discipline: 'jiujitsu', type: 'Adulte', is_advanced: false },
  { id: 'jeu-18h30-enfants',  day: 'Jeudi',  day_index: 4, start_time: '18:30', end_time: '19:25', name: 'Enfants (ancien)', description: 'Jiu-Jitsu', age_group: '8-10 ans', discipline: 'jiujitsu', type: 'Enfants', is_advanced: false },
  { id: 'jeu-19h30-ado',      day: 'Jeudi',  day_index: 4, start_time: '19:30', end_time: '21:00', name: 'Ados (ancien)',    description: 'Jiu-Jitsu', age_group: 'Ados', discipline: 'jiujitsu', type: 'Ado', is_advanced: false },
];

// ── Supabase REST helper ─────────────────────────────────────

async function supabaseRequest(table, method, body, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Accept-Profile': 'dojo',
    'Content-Profile': 'dojo',
  };
  // Upsert: merge on conflict
  if (method === 'POST') {
    headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
  } else {
    headers['Prefer'] = 'return=minimal';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${table}: ${res.status} — ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    return res.json();
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('Reading schedule.json...');
  const raw = fs.readFileSync(path.join(__dirname, 'schedule.json'), 'utf-8');
  const data = JSON.parse(raw);

  // 1. Session
  console.log('\n1. Seeding schedule_sessions...');
  const sessionId = 'printemps-2026';
  const session = {
    id: sessionId,
    name: data.session,
    start_date: data.sessionStart,
    end_date: data.sessionEnd,
    is_current: true,
  };
  await supabaseRequest('schedule_sessions', 'POST', [session]);
  console.log(`   ✓ Session: ${session.name}`);

  // 2. Courses (active from schedule.json)
  console.log('\n2. Seeding schedule_courses...');
  let sortOrder = 0;
  const courses = [];

  for (const dayEntry of data.schedule) {
    for (const cls of dayEntry.classes) {
      const newId = COURSE_ID_MAP[cls.id] || cls.id;
      const tracksGc = GC_TRACKED_IDS.has(newId);
      courses.push({
        id: newId,
        day: dayEntry.day,
        day_index: dayEntry.dayIndex,
        start_time: cls.startTime,
        end_time: cls.endTime,
        name: cls.name,
        description: cls.description || '',
        age_group: cls.ageGroup || '',
        discipline: cls.discipline,
        type: JC_TYPE_MAP[newId] || guessType(cls.ageGroup),
        is_advanced: JC_ADVANCED_MAP[newId] || false,
        is_active: true,
        tracks_gc: tracksGc,
        sort_order: sortOrder++,
      });
    }
  }

  // Add inactive GC courses (historical references)
  for (const ic of INACTIVE_GC_COURSES) {
    courses.push({
      ...ic,
      is_active: false,
      tracks_gc: true,
      sort_order: sortOrder++,
    });
  }

  await supabaseRequest('schedule_courses', 'POST', courses);
  console.log(`   ✓ ${courses.length} courses (${courses.filter(c => c.tracks_gc).length} GC-tracked, ${courses.filter(c => !c.is_active).length} inactive)`);

  // 3. Holidays
  console.log('\n3. Seeding schedule_holidays...');
  if (data.holidays && data.holidays.length > 0) {
    const holidays = data.holidays.map(h => ({
      session_id: sessionId,
      date: h.date,
      label: h.name || h.label || '',
    }));
    await supabaseRequest('schedule_holidays', 'POST', holidays);
    console.log(`   ✓ ${holidays.length} holidays`);
  } else {
    console.log('   (aucun congé)');
  }

  // 4. Events
  console.log('\n4. Seeding schedule_events...');
  if (data.events && data.events.length > 0) {
    const events = data.events.map(e => ({
      session_id: sessionId,
      title: e.name,
      date: e.date,
      end_date: e.endDate || null,
      description: e.description || '',
      event_type: e.type || 'autre',
      importance: e.important ? 'high' : 'normal',
    }));
    await supabaseRequest('schedule_events', 'POST', events);
    console.log(`   ✓ ${events.length} events`);
  } else {
    console.log('   (aucun événement)');
  }

  // 5. Announcements
  console.log('\n5. Seeding schedule_announcements...');
  if (data.announcements && data.announcements.length > 0) {
    const announcements = data.announcements.map(a => ({
      session_id: sessionId,
      title: a.text,
      message: '',
      type: a.type || 'info',
      is_active: a.active !== false,
    }));
    await supabaseRequest('schedule_announcements', 'POST', announcements);
    console.log(`   ✓ ${announcements.length} announcements`);
  } else {
    console.log('   (aucune annonce)');
  }

  // Verification
  console.log('\n── Vérification ──');
  const counts = await Promise.all([
    supabaseRequest('schedule_sessions', 'GET', null, '?select=id'),
    supabaseRequest('schedule_courses', 'GET', null, '?select=id'),
    supabaseRequest('schedule_holidays', 'GET', null, '?select=id'),
    supabaseRequest('schedule_events', 'GET', null, '?select=id'),
    supabaseRequest('schedule_announcements', 'GET', null, '?select=id'),
  ]);
  console.log(`   Sessions:      ${counts[0].length}`);
  console.log(`   Courses:       ${counts[1].length}`);
  console.log(`   Holidays:      ${counts[2].length}`);
  console.log(`   Events:        ${counts[3].length}`);
  console.log(`   Announcements: ${counts[4].length}`);
  console.log('\n✅ Seed terminé!');
}

// ── Helpers ──────────────────────────────────────────────────

function guessType(ageGroup) {
  if (!ageGroup) return 'Enfants';
  const lower = ageGroup.toLowerCase();
  if (lower.includes('adulte') || lower.includes('16 ans')) return 'Adulte';
  if (lower.includes('ado') || lower.includes('11 ans')) return 'Ado';
  return 'Enfants';
}

main().catch(err => {
  console.error('\n❌ Erreur:', err.message);
  process.exit(1);
});
