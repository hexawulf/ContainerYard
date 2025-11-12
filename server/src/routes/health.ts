import { Router } from 'express';
export const health = Router();

health.get('/api/health', async (_req, res) => {
  try {
    // lightweight checks; do NOT hit DB or cAdvisor
    res.status(200).json({ ok: true, uptime: process.uptime(), ts: Date.now() });
  } catch {
    res.status(200).json({ ok: true, degraded: true, ts: Date.now() });
  }
});