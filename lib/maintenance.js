import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { getDb } from './db/index.js';
import { settings } from './db/schema.js';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

async function cleanExpiredAgentJobKeys() {
  try {
    const db = getDb();
    const cutoff = Date.now() - TWENTY_FOUR_HOURS;
    const rows = db
      .select({ id: settings.id, key: settings.key, lastUsedAt: settings.lastUsedAt, createdAt: settings.createdAt })
      .from(settings)
      .where(eq(settings.type, 'agent_job_api_key'))
      .all();

    // Filter to candidates not used in the last 24 hours
    const candidates = rows.filter(r =>
      (r.lastUsedAt !== null ? r.lastUsedAt : r.createdAt) < cutoff
    );

    if (candidates.length === 0) {
      console.log(`[maintenance] No expired agent job keys (${rows.length} active)`);
      return;
    }

    // Check if the container still exists for each candidate
    const { inspectContainer } = await import('./tools/docker.js');
    const expiredIds = [];
    for (const r of candidates) {
      const info = await inspectContainer(r.key);
      if (!info) {
        expiredIds.push(r.id);
      }
    }

    if (expiredIds.length > 0) {
      for (const id of expiredIds) {
        db.delete(settings).where(eq(settings.id, id)).run();
      }
      console.log(`[maintenance] Deleted ${expiredIds.length} orphaned agent job key(s)`);
    } else {
      console.log(`[maintenance] ${candidates.length} candidate(s) checked, all containers still running`);
    }
  } catch (err) {
    console.error('[maintenance] cleanExpiredAgentJobKeys failed:', err);
  }
}

async function runMaintenance() {
  console.log('[maintenance] Running maintenance...');
  await cleanExpiredAgentJobKeys();
}

export function startMaintenanceCron() {
  cron.schedule('0 * * * *', runMaintenance);
}
