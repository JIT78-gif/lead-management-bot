import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { config } from './config.js';

/**
 * Phase 5 in-process scheduler. Single Easypanel instance, so no distributed
 * locking is needed. All times are in Asia/Kolkata (IST).
 *
 * Tasks register themselves here so we keep one place to read the schedule.
 * Wrap each tick in try/catch so a single failure never kills the loop.
 */
export function startScheduler(log: FastifyBaseLogger): void {
  if (!config.scheduler.enabled) {
    log.info('Scheduler disabled (SCHEDULER_ENABLED=false)');
    return;
  }

  const tz = 'Asia/Kolkata';

  // Daily follow-up reminders → wired in Stage 2.
  cron.schedule(
    `0 ${config.scheduler.reminderHourIst} * * *`,
    () => {
      log.info({ job: 'daily-reminders' }, 'scheduler tick');
      // import dynamically to keep the dependency graph one-way.
      import('./services/reminders.js')
        .then((m) => m.runDailyReminders(log))
        .catch((err) => log.error({ err, job: 'daily-reminders' }, 'tick failed'));
    },
    { timezone: tz }
  );

  // Weekly digest (Monday) → wired in Stage 5.
  cron.schedule(
    `0 ${config.scheduler.digestHourIst} * * 1`,
    () => {
      log.info({ job: 'weekly-digest' }, 'scheduler tick');
      import('./services/digest.js')
        .then((m) => m.runWeeklyDigest(log))
        .catch((err) => log.error({ err, job: 'weekly-digest' }, 'tick failed'));
    },
    { timezone: tz }
  );

  log.info(
    {
      tz,
      reminderHourIst: config.scheduler.reminderHourIst,
      digestHourIst: config.scheduler.digestHourIst,
    },
    'Scheduler started'
  );
}
