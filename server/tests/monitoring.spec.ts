import request from 'supertest';
import type { Express } from 'express';

// Minimal schema guards
const isLogsPayload = (b: any): boolean =>
  b && typeof b === 'object' && typeof b.content === 'string' && typeof b.truncated === 'boolean';

const isStatsPayload = (b: any): boolean =>
  b && typeof b === 'object' &&
  ['cpuPct', 'memPct', 'memBytes', 'blkRead', 'blkWrite', 'netRx', 'netTx']
    .every(k => typeof b[k] === 'number') &&
  typeof b.ts === 'string';

describe('Monitoring API (read-only)', () => {
  let app: Express;
  const hostId = 'piapps';
  const cid = process.env.TEST_CONTAINER_ID || 'replace_me';

  beforeAll(async () => {
    // Import app dynamically
    const { createApp } = await import('../src/index');
    const { app: appInstance } = await createApp();
    app = appInstance;
  });

  describe('GET /api/hosts/:hostId/containers/:cid/logs', () => {
    it('returns logs with tail=100', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}/containers/${cid}/logs`)
        .query({ tail: 100 })
        .expect(200);
      
      expect(isLogsPayload(res.body)).toBe(true);
      expect(res.body.content.length).toBeGreaterThan(0);
    });

    it('supports grep and since', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}/containers/${cid}/logs`)
        .query({ since: 3600, grep: 'error' })
        .expect(200);
      
      expect(isLogsPayload(res.body)).toBe(true);
    });

    it('respects stdout/stderr filters', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}/containers/${cid}/logs`)
        .query({ tail: 50, stdout: true, stderr: false })
        .expect(200);
      
      expect(isLogsPayload(res.body)).toBe(true);
    });

    it('enforces max tail limit of 5000', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}/containers/${cid}/logs`)
        .query({ tail: 10000 })
        .expect(200);
      
      expect(res.body.truncated).toBe(true);
    });
  });

  describe('GET /api/hosts/:hostId/containers/:cid/stats', () => {
    it('returns normalized stats', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}/containers/${cid}/stats`)
        .expect(200);
      
      expect(isStatsPayload(res.body)).toBe(true);
      expect(res.body.cpuPct).toBeGreaterThanOrEqual(0);
      expect(res.body.memPct).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/hosts/:hostId/containers/:cid/logs/stream', () => {
    it('returns SSE stream for Docker hosts', (done) => {
      request(app)
        .get(`/api/hosts/${hostId}/containers/${cid}/logs/stream`)
        .query({ stdout: true, stderr: false })
        .expect('Content-Type', /text\/event-stream/)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    }, 10000);
  });
});
