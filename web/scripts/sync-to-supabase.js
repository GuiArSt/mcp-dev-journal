#!/usr/bin/env node
/**
 * One-time sync: SQLite → Supabase
 * Run: node scripts/sync-to-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');
const path = require('path');

// Config - Load from environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SQLITE_PATH = path.join(__dirname, '..', '..', 'journal.db');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  console.error('   Set them in .env or pass them as environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const sqlite = new Database(SQLITE_PATH);

function parseJSON(str) {
  if (!str || typeof str !== 'string') return str;
  try { return JSON.parse(str); } catch { return str; }
}

async function syncToSupabase() {
  console.log('📤 Syncing SQLite → Supabase...');
  console.log('   From:', SQLITE_PATH, '\n');

  // 1. Journal entries
  console.log('1️⃣ Journal entries...');
  const entries = sqlite.prepare('SELECT * FROM journal_entries').all();
  for (const entry of entries) {
    const { id, ...data } = entry;
    const { error } = await supabase.from('journal_entries').upsert(data, { onConflict: 'commit_hash' });
    if (error) console.log('   ❌', entry.commit_hash.substring(0, 20), error.message);
  }
  console.log('   ✅', entries.length, 'entries synced');

  // 2. Repository overviews (Entry 0)
  console.log('2️⃣ Repository overviews...');
  const summaries = sqlite.prepare('SELECT * FROM repository_overviews').all();
  for (const s of summaries) {
    const { id, ...data } = s;
    const { error } = await supabase.from('repository_overviews').upsert(data, { onConflict: 'repository' });
    if (error) console.log('   ❌', s.repository, error.message);
  }
  console.log('   ✅', summaries.length, 'overviews synced');

  // 3. Documents
  console.log('3️⃣ Documents...');
  const docs = sqlite.prepare('SELECT * FROM documents').all();
  for (const doc of docs) {
    const { id, ...data } = doc;
    data.metadata = parseJSON(data.metadata);
    const { error } = await supabase.from('documents').upsert(data, { onConflict: 'slug' });
    if (error) console.log('   ❌', doc.slug, error.message);
  }
  console.log('   ✅', docs.length, 'documents synced');

  // 4. Skills
  console.log('4️⃣ Skills...');
  const skills = sqlite.prepare('SELECT * FROM skills').all();
  for (const skill of skills) {
    const data = { ...skill };
    data.tags = parseJSON(data.tags);
    // Rename camelCase to snake_case
    if (data.firstUsed) { data.first_used = data.firstUsed; delete data.firstUsed; }
    if (data.lastUsed) { data.last_used = data.lastUsed; delete data.lastUsed; }
    const { error } = await supabase.from('skills').upsert(data, { onConflict: 'id' });
    if (error) console.log('   ❌', skill.name, error.message);
  }
  console.log('   ✅', skills.length, 'skills synced');

  // 5. Work experience
  console.log('5️⃣ Work experience...');
  const exp = sqlite.prepare('SELECT * FROM work_experience').all();
  for (const e of exp) {
    const data = { ...e };
    data.achievements = parseJSON(data.achievements);
    if (data.dateStart) { data.date_start = data.dateStart; delete data.dateStart; }
    if ('dateEnd' in data) { data.date_end = data.dateEnd || null; delete data.dateEnd; }
    const { error } = await supabase.from('work_experience').upsert(data, { onConflict: 'id' });
    if (error) console.log('   ❌', e.company, error.message);
  }
  console.log('   ✅', exp.length, 'experiences synced');

  // 6. Education
  console.log('6️⃣ Education...');
  const edu = sqlite.prepare('SELECT * FROM education').all();
  for (const e of edu) {
    const data = { ...e };
    data.focus_areas = parseJSON(data.focusAreas); delete data.focusAreas;
    data.achievements = parseJSON(data.achievements);
    if (data.dateStart) { data.date_start = data.dateStart; delete data.dateStart; }
    if (data.dateEnd) { data.date_end = data.dateEnd; delete data.dateEnd; }
    const { error } = await supabase.from('education').upsert(data, { onConflict: 'id' });
    if (error) console.log('   ❌', e.institution, error.message);
  }
  console.log('   ✅', edu.length, 'education records synced');

  // 7. Media assets (insert, not upsert - no unique constraint)
  console.log('7️⃣ Media assets...');
  const media = sqlite.prepare('SELECT * FROM media_assets').all();
  let mediaCount = 0;
  for (const m of media) {
    const { id, ...data } = m;
    data.tags = parseJSON(data.tags);
    const { error } = await supabase.from('media_assets').insert(data);
    if (error) {
      if (!error.message.includes('duplicate')) console.log('   ❌', m.filename, error.message);
    } else {
      mediaCount++;
    }
  }
  console.log('   ✅', mediaCount, 'media assets synced');

  // 8. Chat conversations
  console.log('8️⃣ Chat conversations...');
  const convs = sqlite.prepare('SELECT * FROM chat_conversations').all();
  let convCount = 0;
  for (const c of convs) {
    const { id, ...data } = c;
    data.messages = parseJSON(data.messages);
    const { error } = await supabase.from('chat_conversations').insert(data);
    if (error) {
      if (!error.message.includes('duplicate')) console.log('   ❌ conv', c.id, error.message);
    } else {
      convCount++;
    }
  }
  console.log('   ✅', convCount, 'conversations synced');

  console.log('\n✅ Sync complete!');

  // Final counts
  console.log('\n📊 Supabase now has:');
  for (const table of ['journal_entries', 'repository_overviews', 'documents', 'skills', 'work_experience', 'education', 'media_assets', 'chat_conversations']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log('  ', table + ':', count);
  }
}

syncToSupabase().catch(console.error);
