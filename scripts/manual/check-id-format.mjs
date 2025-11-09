#!/usr/bin/env node

/**
 * Check Todoist Account ID Format
 * 
 * Determines if your Todoist account uses:
 * - Legacy numeric IDs (e.g., "8951709409")
 * - Modern ULIDs (e.g., "01J0M8KPV7Z2F4S9DX3T8HCN8F")
 * 
 * Usage:
 *   node scripts/manual/check-id-format.mjs
 * 
 * Requires:
 *   TODOIST_API_TOKEN environment variable or .env file
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

// Load .env lazily when available
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || process.env[key]) continue;
    const value = line.slice(idx + 1).trim();
    const trimmed = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    process.env[key] = trimmed;
  }
}

const todoistToken = process.env.TODOIST_API_TOKEN;
if (!todoistToken) {
  console.error('❌ Missing TODOIST_API_TOKEN');
  console.error('   Set it in your environment or .env file.');
  process.exit(1);
}

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const NUMERIC_ID_REGEX = /^\d+$/;

function detectIdType(id) {
  const stringId = String(id);
  if (ULID_REGEX.test(stringId)) return 'ULID';
  if (NUMERIC_ID_REGEX.test(stringId)) return 'numeric';
  return 'unknown';
}

async function checkIdFormat() {
  console.log('🔍 Checking Todoist account ID format...\n');

  const headers = {
    'Authorization': `Bearer ${todoistToken}`,
  };

  try {
    // Fetch a few tasks
    console.log('📋 Fetching tasks...');
    const tasksResponse = await fetch('https://api.todoist.com/rest/v2/tasks?limit=5', {
      headers
    });

    if (!tasksResponse.ok) {
      throw new Error(`Tasks API failed (${tasksResponse.status}): ${await tasksResponse.text()}`);
    }

    const tasks = await tasksResponse.json();

    // Fetch projects
    console.log('📁 Fetching projects...');
    const projectsResponse = await fetch('https://api.todoist.com/rest/v2/projects', {
      headers
    });

    if (!projectsResponse.ok) {
      throw new Error(`Projects API failed (${projectsResponse.status}): ${await projectsResponse.text()}`);
    }

    const projects = await projectsResponse.json();

    // Analyze IDs
    console.log('\n' + '═'.repeat(70));
    console.log('                    ID FORMAT ANALYSIS');
    console.log('═'.repeat(70) + '\n');

    const taskIds = tasks.slice(0, 3).map(t => ({ type: 'Task', id: t.id, format: detectIdType(t.id) }));
    const projectIds = projects.slice(0, 3).map(p => ({ type: 'Project', id: p.id, format: detectIdType(p.id) }));
    const allIds = [...taskIds, ...projectIds];

    console.log('Sample IDs:\n');
    allIds.forEach(({ type, id, format }) => {
      const icon = format === 'ULID' ? '✅' : format === 'numeric' ? '⚠️' : '❓';
      console.log(`  ${icon} ${type.padEnd(10)} ${id.padEnd(28)} [${format.toUpperCase()}]`);
    });

    // Determine account status
    const formats = allIds.map(i => i.format);
    const hasUlids = formats.includes('ULID');
    const hasNumeric = formats.includes('numeric');

    console.log('\n' + '═'.repeat(70));
    console.log('                      ACCOUNT STATUS');
    console.log('═'.repeat(70) + '\n');

    if (hasUlids && !hasNumeric) {
      console.log('✅ MIGRATED TO ULIDs');
      console.log('\n   Your account is using modern ULID identifiers!');
      console.log('   - All IDs are 26-character alphanumeric strings');
      console.log('   - REST v2 API fully supported');
      console.log('   - No ID conversion needed');
      console.log('\n   🎉 You can now use REST v2 /move endpoint directly!');
    } else if (hasNumeric && !hasUlids) {
      console.log('⚠️  USING LEGACY NUMERIC IDs');
      console.log('\n   Your account still uses numeric identifiers.');
      console.log('   - All IDs are numeric strings (e.g., "8951709409")');
      console.log('   - REST v2 /move endpoint may not work (404 errors)');
      console.log('   - Server uses Sync API v9 fallback (working!)');
      console.log('\n   📧 Migration Request Status:');
      console.log('      Contact Todoist support if you haven\'t already:');
      console.log('      https://todoist.com/contact');
    } else if (hasUlids && hasNumeric) {
      console.log('🔄 MIXED FORMAT (TRANSITION IN PROGRESS)');
      console.log('\n   Your account has both numeric and ULID identifiers.');
      console.log('   This suggests migration is in progress.');
      console.log('\n   ⏳ Check again in a few hours/days.');
    } else {
      console.log('❓ UNKNOWN FORMAT');
      console.log('\n   Could not determine ID format. Please check manually.');
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n💡 TIP: Run this script periodically to check migration status.');
    console.log('        Add to cron: 0 9 * * * cd /path/to/project && node scripts/manual/check-id-format.mjs\n');

  } catch (error) {
    console.error('\n❌ Error checking ID format:', error.message);
    process.exit(1);
  }
}

checkIdFormat().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});

