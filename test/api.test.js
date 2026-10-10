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

test('draft preview and readiness stay behind admin authentication', async () => {
  const previousUsername = process.env.ADMIN_USERNAME;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = 'test-admin';
  process.env.ADMIN_PASSWORD = 'test-password';
  const server = http.createServer(app).listen(0);
  try {
    assert.equal((await request(server, 'GET', '/api/admin/preview')).status, 401);
    assert.equal((await request(server, 'POST', '/api/admin/readiness', { draft:{} })).status, 401);
    assert.equal((await request(server, 'POST', '/api/admin/preview/document', {})).status, 401);
    const login = await request(server, 'POST', '/api/auth/login', { username:'test-admin', password:'test-password' });
    assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const preview = await request(server, 'GET', '/api/admin/preview', null, cookie);
    assert.equal(preview.status, 200);
    assert.ok(Array.isArray(preview.body.form.pages));
    const readiness = await request(server, 'POST', '/api/admin/readiness', {
      draft:{ pages:[{ id:'start', title:'Start', isEnd:true, questions:[] }] }
    }, cookie);
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.valid, true);
    assert.deepEqual(readiness.body.errors, []);
  } finally {
    if (previousUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = previousUsername;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    server.close();
  }
});

test('public endpoint does not expose draft state before publish', async () => {
  const server = http.createServer(app).listen(0);
  try { const result = await request(server, 'GET', '/api/public/form'); assert.ok([404, 200].includes(result.status)); if (result.status === 200) assert.ok(result.body.form); }
  finally { server.close(); }
});
