// node scripts/test-sse.js https://container.piapps.dev piapps <cid> cy.sid=<cookie>
const https = require('https');
const [,, base, host, cid, cookie] = process.argv;

if (!base || !host || !cid || !cookie) {
  console.error('Usage: node scripts/test-sse.js <base_url> <host_id> <container_id> <cookie>');
  console.error('Example: node scripts/test-sse.js https://container.piapps.dev piapps abc123 "cy.sid=xxx"');
  process.exit(1);
}

const url = `${base}/api/hosts/${host}/containers/${cid}/logs/stream?stdout=true&stderr=false`;

console.log(`Connecting to: ${url}`);
console.log(`Using cookie: ${cookie.substring(0, 20)}...`);
console.log('---\n');

const req = https.request(url, { headers: { 'Cookie': cookie }}, res => {
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
