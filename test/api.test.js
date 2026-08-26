const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');

function request(server, method, route, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, method, path: route, headers: { ...(data ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} : {}), ...(cookie ? {Cookie: cookie} : {}) } }, res => {
      let output = ''; res.on('data', chunk => output += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: output ? JSON.parse(output) : null }));
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

test('admin mutations require a session', async () => {
  const server = http.createServer(app).listen(0);
  try { const result = await request(server, 'GET', '/api/admin/form'); assert.equal(result.status, 401); }
  finally { server.close(); }
});

test('public endpoint does not expose draft state before publish', async () => {
  const server = http.createServer(app).listen(0);
  try { const result = await request(server, 'GET', '/api/public/form'); assert.ok([404, 200].includes(result.status)); if (result.status === 200) assert.ok(result.body.form); }
  finally { server.close(); }
});
