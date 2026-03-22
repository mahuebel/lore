import { writeHookStatus } from '../hook-heartbeat.js';
import { output } from './utils.js';

writeHookStatus('SessionEnd', { lastFiredAt: Date.now(), success: true });
output({});
