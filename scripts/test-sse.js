// node scripts/test-sse.js https://containeryard.example.com local <cid> "__Secure-cy.sid=<cookie>"
import http from 'node:http';
import https from 'node:https';
const [,, base, host, cid, cookie] = process.argv;

if (!base || !host || !cid || !cookie) {
  console.error('Usage: node scripts/test-sse.js <base_url> <host_id> <container_id> <cookie>');
  console.error('Example: node scripts/test-sse.js https://containeryard.example.com local abc123 "__Secure-cy.sid=xxx"');
  process.exit(1);
}

const url = `${base.replace(/\/+$/, '')}/api/hosts/${encodeURIComponent(host)}/containers/${encodeURIComponent(cid)}/logs/stream?stdout=true&stderr=false`;
const transport = url.startsWith('http://') ? http : https;

console.log(`Connecting to: ${url}`);
console.log('---\n');

const req = transport.request(url, { headers: { 'Cookie': cookie }}, res => {
  res.setEncoding('utf8');
  let count = 0;
  
  res.on('data', chunk => {
    process.stdout.write(chunk);
    if (chunk.includes('data:') && ++count >= 10) { 
      console.log('\n\n--- Received 10 data lines, closing connection ---');
      req.destroy(); 
    }
  });

  res.on('end', () => {
    console.log('\n--- Stream ended ---');
  });
});

req.on('error', e => {
  console.error('Error:', e.message);
  process.exit(1);
});

req.end();
