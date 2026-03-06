import type { Client } from 'discord.js';
import {
  getAllActiveMonitors, getAllUserActiveSlips, getLegs, touchMonitor, setMonitorActive,
  type MonitorRow,
} from '../db/index.js';
import { evaluateSlip } from './prop-tracker.js';
import { buildStatusEmbed, buildSettledEmbed } from '../utils/embeds.js';

// Per-user interval handles
const timers = new Map<string, NodeJS.Timeout>();

export function startAllMonitors(client: Client): void {
  const monitors = getAllActiveMonitors();
  for (const monitor of monitors) {
    scheduleMonitor(client, monitor);
  }
  console.log(`[Monitor] Started ${monitors.length} active monitors`);
}

export function startMonitor(client: Client, monitor: MonitorRow): void {
  stopMonitor(monitor.user_id);
  scheduleMonitor(client, monitor);
  console.log(`[Monitor] Started for user ${monitor.user_id} every ${monitor.interval_ms / 1000}s`);
}

export function stopMonitor(userId: string): void {
  const timer = timers.get(userId);
  if (timer) {
    clearInterval(timer);
    timers.delete(userId);
  }
  setMonitorActive(userId, false);
}

function scheduleMonitor(client: Client, monitor: MonitorRow): void {
  const timer = setInterval(() => runMonitorCycle(client, monitor.user_id), monitor.interval_ms);
  timers.set(monitor.user_id, timer);

  // Run immediately on first start
  runMonitorCycle(client, monitor.user_id).catch(console.error);
}

async function runMonitorCycle(client: Client, userId: string): Promise<void> {
  const monitors = getAllActiveMonitors();
  const monitor = monitors.find(m => m.user_id === userId);
  if (!monitor) return;

  const activeSlips = getAllUserActiveSlips(userId);
  if (!activeSlips.length) return;

  touchMonitor(userId);

  // Fetch the Discord user for DM delivery
  let dmUser: import('discord.js').User | null = null;
  try {
    dmUser = await client.users.fetch(userId);
  } catch {
    console.warn(`[Monitor] Cannot fetch user ${userId} for DM`);
    return;
  }

  for (const slip of activeSlips) {
    try {
      const prevStatus = slip.status;
      const evals = await evaluateSlip(slip.id);

      const { getSlip } = await import('../db/index.js');
      const updatedSlip = getSlip(slip.id);

      if (updatedSlip && updatedSlip.status !== 'active' && prevStatus === 'active') {
        // Slip just settled — DM the user
        const legs = getLegs(slip.id);
        await dmUser.send({ embeds: [buildSettledEmbed(updatedSlip, legs)] }).catch((err) => {
          console.warn(`[Monitor] Could not DM user ${userId}:`, err.message);
        });
      } else if (evals.length > 0) {
        // Live update — DM the user
        const legs = getLegs(slip.id);
        const embed = buildStatusEmbed(slip, legs, evals);
        if (embed) {
          await dmUser.send({ embeds: [embed] }).catch((err) => {
            console.warn(`[Monitor] Could not DM user ${userId}:`, err.message);
          });
        }
      }
    } catch (err) {
      console.error(`[Monitor] Error evaluating slip ${slip.id}:`, err);
    }
  }
}
