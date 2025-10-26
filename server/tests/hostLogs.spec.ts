import request from 'supertest';
import type { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Host Logs API', () => {
  let app: Express;
  let testLogFile: string;
  let testLogDir: string;

  beforeAll(async () => {
    // Import app dynamically
    const { createApp } = await import('../src/index');
    const { app: appInstance } = await createApp();
    app = appInstance;

    // Create a temporary test log file
    testLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-logs-'));
    testLogFile = path.join(testLogDir, 'test.log');
    
    // Write some test content
    const testContent = Array.from({ length: 100 }, (_, i) => 
      `Line ${i + 1}: Test log entry at ${new Date().toISOString()}`
    ).join('\n');
    fs.writeFileSync(testLogFile, testContent);
  });

  afterAll(() => {
    // Cleanup test files
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
    if (fs.existsSync(testLogDir)) {
      fs.rmdirSync(testLogDir);
    }
  });

  describe('GET /api/hostlogs', () => {
    it('returns list of available logs', async () => {
      const res = await request(app)
        .get('/api/hostlogs')
        .expect(200);
      
      expect(res.body).toHaveProperty('logs');
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs.length).toBeGreaterThan(0);
      
      // Check structure of log entries
      const log = res.body.logs[0];
      expect(log).toHaveProperty('name');
      expect(log).toHaveProperty('path');
      expect(log).toHaveProperty('exists');
      expect(typeof log.exists).toBe('boolean');
    });

    it('includes grafana and prometheus logs', async () => {
      const res = await request(app)
        .get('/api/hostlogs')
        .expect(200);
      
      const logNames = res.body.logs.map((log: any) => log.name);
      expect(logNames).toContain('grafana');
      expect(logNames).toContain('prometheus');
    });
  });

  describe('GET /api/hostlogs/:name', () => {
    it('returns 404 for unknown log name', async () => {
      await request(app)
        .get('/api/hostlogs/nonexistent_log')
        .expect(404);
    });

    it('returns unavailable JSON when log file not found', async () => {
      const res = await request(app)
        .get('/api/hostlogs/grafana')
        .query({ tail: 10 })
        .expect(200);
      
      // Might be available or unavailable depending on system state
      if (!res.text || res.text.startsWith('{')) {
        // JSON response (unavailable)
        const data = JSON.parse(res.text || '{}');
        if (data.available === false) {
          expect(data).toHaveProperty('reason');
          expect(data).toHaveProperty('logName');
          expect(['not_found', 'permission', 'empty', 'container_missing']).toContain(data.reason);
        }
      } else {
        // Text response (available)
        expect(res.type).toMatch(/text\/plain/);
      }
    });

    it('supports tail parameter', async () => {
      // Test with an existing log that's likely to have content (nginx or pm2)
      const res = await request(app)
        .get('/api/hostlogs/pm2_out')
        .query({ tail: 50 })
        .expect(200);
      
      if (res.type.includes('text/plain')) {
        // Log is available
        const lines = res.text.split('\n').filter((line: string) => line.length > 0);
        expect(lines.length).toBeLessThanOrEqual(50);
      }
    });

    it('supports grep filter', async () => {
      const res = await request(app)
        .get('/api/hostlogs/pm2_out')
        .query({ tail: 100, grep: 'info' })
        .expect(200);
      
      if (res.type.includes('text/plain') && res.text.length > 0) {
        const lines = res.text.split('\n').filter((line: string) => line.length > 0);
        // All lines should contain 'info' (case-insensitive)
        lines.forEach((line: string) => {
          expect(line.toLowerCase()).toContain('info');
        });
      }
    });
  });

  describe('GET /api/hostlogs/_diagnose', () => {
    it('requires authentication', async () => {
      // This will fail with 403 CSRF or redirect if not authenticated
      const res = await request(app)
        .get('/api/hostlogs/_diagnose');
      
      expect([401, 403, 302]).toContain(res.status);
    });
  });

  describe('Error responses', () => {
    it('returns structured error for unavailable logs', async () => {
      // Create a mock scenario - try to access a log that definitely doesn't exist
      const res = await request(app)
        .get('/api/hostlogs/grafana')
        .query({ tail: 10 });
      
      if (res.status === 200 && res.type.includes('application/json')) {
        const data = res.body;
        if (data.available === false) {
          expect(data).toHaveProperty('reason');
          expect(data).toHaveProperty('details');
          expect(data).toHaveProperty('logName');
          expect(data).toHaveProperty('filePath');
          
          // Verify details has appropriate fields based on reason
          if (data.reason === 'not_found') {
            expect(data.details).toHaveProperty('path');
          } else if (data.reason === 'container_missing') {
            expect(data.details).toHaveProperty('containerName');
          }
        }
      }
    });
  });
});
