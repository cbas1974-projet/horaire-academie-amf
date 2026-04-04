#!/usr/bin/env node
/**
 * Seed date ranges — ONE-SHOT migration script
 * Run AFTER migrate-date-ranges.sql has been executed in Supabase Dashboard.
 *
 * Creates 2 date range groups and assigns existing courses.
 * Run: node seed-date-ranges.js
 */

const SUPABASE_URL = 'https://enkwnelkwlvlyjvbwyzq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVua3duZWxrd2x2bHlqdmJ3eXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMzU1MjgsImV4cCI6MjA4NDYxMTUyOH0.SzvyfEQGjfav927--cYQZVF8jJ47B6V9jHrNh6KuT6M';

const SESSION_ID = 'printemps-2026';

// Date ranges to create
const DATE_RANGES = [
  {
    id: 'dr-jiujitsu',
    session_id: SESSION_ID,
    name: 'Jiujitsu & Gracie',
    start_date: '2026-04-07',
    end_date: '2026-06-10',
    sort_order: 0,
  },
  {
    id: 'dr-muaythai',
    session_id: SESSION_ID,
    name: 'Muay Thai',
    start_date: '2026-04-07',
    end_date: '2026-06-10',
    sort_order: 1,
  },
];

// Course → date range assignments
const COURSE_ASSIGNMENTS = {
  'dr-jiujitsu': [
    'dim-16h-superkids',
    'dim-17h-enfants-deb',
    'dim-18h-enfants',
    'dim-19h-avance',
    'mar-17h45-enfants',
    'mar-18h45-ado',
    'jeu-17h45-superkids',
    'jeu-18h30-avance',
    'jeu-19h30-adulte',
  ],
  'dr-muaythai': [
    'lun-19h10-muaythai',
    'lun-20h-muaythai',
    'mer-19h30-muaythai',
  ],
};

async function supabaseRequest(table, method, body, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Accept-Profile': 'dojo',
    'Content-Profile': 'dojo',
  };
  if (method === 'POST') {
    headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
  } else if (method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
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

  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : null;
}

async function main() {
  console.log('Seeding date ranges...\n');

  // 1. Create date ranges
  console.log('1. Creating date ranges...');
  await supabaseRequest('schedule_date_ranges', 'POST', DATE_RANGES);
  console.log(`   ✓ ${DATE_RANGES.length} date ranges created`);

  // 2. Assign courses to date ranges
  console.log('\n2. Assigning courses to date ranges...');
  for (const [rangeId, courseIds] of Object.entries(COURSE_ASSIGNMENTS)) {
    for (const courseId of courseIds) {
      await supabaseRequest(
        'schedule_courses',
        'PATCH',
        { date_range_id: rangeId },
        `?id=eq.${encodeURIComponent(courseId)}`
      );
    }
    console.log(`   ✓ ${rangeId}: ${courseIds.length} courses assigned`);
  }

  // 3. Verify
  console.log('\n── Verification ──');
  const ranges = await supabaseRequest('schedule_date_ranges', 'GET', null, '?select=*');
  console.log(`   Date ranges: ${ranges.length}`);
  for (const r of ranges) {
    const courses = await supabaseRequest('schedule_courses', 'GET', null,
      `?date_range_id=eq.${r.id}&select=id`);
    console.log(`   ${r.name}: ${r.start_date} → ${r.end_date} (${courses.length} courses)`);
  }

  console.log('\n✅ Date ranges migration complete!');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
