import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('accounts protect trip writes and keep membership across logins', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-auth-'));
  const port = 46000 + Math.floor(Math.random() * 15000);
  const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(port) }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  async function request(route, method = 'GET', data, cookie = '', headers = {}) {
    const response = await fetch(`${base}${route}`, { method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { const result = await request('/api/auth/me'); if (result.status === 200) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'test server starts');
    assert.equal(fs.existsSync(path.join(dataDir, 'auth.json')), false, 'account store is created on first registration');
    assert.equal((await request('/api/trips', 'POST', { title: '未登录' })).status, 401);
    const alice = await request('/api/auth/register', 'POST', { name: '小雨', email: 'alice@example.test', password: 'a long password 123' });
    assert.equal(alice.status, 201);
    assert.ok(alice.cookie.startsWith('travel_session='));
    assert.equal(fs.existsSync(path.join(dataDir, 'auth.json')), true);
    assert.equal(alice.data.user.email, 'alice@example.test');
    assert.ok(!fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8').includes('a long password 123'));
    assert.equal((await request('/api/auth/me', 'GET', undefined, alice.cookie)).data.user.id, alice.data.user.id);
    assert.equal((await request('/api/trips', 'POST', { title: '未定位的旅行', startDate: '2026-10-10', endDate: '2026-10-11' }, alice.cookie)).status, 400);
    assert.equal((await request('/api/auth/register', 'POST', { name: '另一个', email: 'alice@example.test', password: 'another password 123' })).status, 409);
    assert.equal((await request('/api/auth/login', 'POST', { email: 'alice@example.test', password: 'wrong password' })).status, 401);
    const tripResult = await request('/api/trips', 'POST', { title: '周末旅行', destination: '上海', center: [31.23, 121.47], startDate: '2026-10-10', endDate: '2026-10-11' }, alice.cookie);
    assert.equal(tripResult.status, 201);
    const tripId = tripResult.data.trip.id;
    const aliceMember = tripResult.data.trip.members[0];
    assert.equal(aliceMember.userId, alice.data.user.id);
    assert.equal((await request('/api/auth/trips', 'GET', undefined, alice.cookie)).data.trips[0].id, tripId);
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'rename-trip', title: '擅自改名' })).status, 401);
    const bob = await request('/api/auth/register', 'POST', { name: '小林', email: 'bob@example.test', password: 'another long password' });
    assert.equal(bob.status, 201);
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { actorId: aliceMember.id, action: 'message', text: '冒名发言' }, bob.cookie)).status, 403);
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'rename-trip', title: '未加入改名' }, bob.cookie)).status, 403);
    const joined = await request(`/api/trips/${tripId}/join`, 'POST', { name: '假名字' }, bob.cookie);
    assert.equal(joined.status, 201);
    assert.equal(joined.data.member.name, '小林');
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'rename-trip', title: '  ' }, bob.cookie)).status, 400);
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'rename-trip', title: '旅伴的上海周末' }, bob.cookie)).status, 200);
    assert.equal((await request(`/api/trips/${tripId}`)).data.trip.title, '旅伴的上海周末');
    assert.equal((await request('/api/auth/trips', 'GET', undefined, alice.cookie)).data.trips[0].title, '旅伴的上海周末');
    assert.equal((await request(`/api/trips/${tripId}/join`, 'POST', {}, bob.cookie)).data.member.id, joined.data.member.id);
    const message = await request(`/api/trips/${tripId}/actions`, 'POST', { actorId: aliceMember.id, action: 'message', text: '大家好' }, bob.cookie);
    assert.equal(message.status, 201);
    const trip = (await request(`/api/trips/${tripId}`)).data.trip;
    assert.equal(trip.messages[0].authorId, joined.data.member.id);
    const addedPlace = await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'add-place', name: '一家小店', lat: 31.23, lng: 121.47, category: '美食' }, alice.cookie);
    assert.equal(addedPlace.status, 201);
    const placeId = addedPlace.data.place.id;
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'comment', placeId, text: '周六中午来吃吧' }, bob.cookie)).status, 201);
    const linkedPost = 'https://www.xiaohongshu.com/explore/example';
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'comment', placeId, sourceUrl: linkedPost, sourceTitle: '店铺攻略' }, alice.cookie)).status, 201);
    const withComments = (await request(`/api/trips/${tripId}`)).data.trip;
    const comments = withComments.places.find(place => place.id === placeId).comments;
    const commentMessages = withComments.messages.filter(message => message.type === 'place-comment');
    assert.equal(commentMessages.length, 2);
    assert.deepEqual(commentMessages.map(message => message.commentId), comments.map(comment => comment.id));
    assert.equal(commentMessages[0].authorId, joined.data.member.id);
    assert.equal(commentMessages[0].text, '周六中午来吃吧');
    assert.equal(commentMessages[1].sourceUrl, linkedPost);
    assert.equal(commentMessages[1].sourceTitle, '店铺攻略');
    assert.equal((await request(`/api/trips/${tripId}/images`, 'POST', undefined, '', { 'x-member-id': aliceMember.id })).status, 401);
    assert.equal((await request(`/api/trips/${tripId}/actions`, 'POST', { action: 'message', text: '跨站请求' }, alice.cookie, { origin: 'https://other.example.test' })).status, 403);
    assert.equal((await request('/api/auth/logout', 'POST', {}, alice.cookie)).status, 200);
    assert.equal((await request('/api/auth/me', 'GET', undefined, alice.cookie)).data.user, null);
    const login = await request('/api/auth/login', 'POST', { email: 'alice@example.test', password: 'a long password 123' });
    assert.equal(login.status, 200);
    assert.equal((await request('/api/auth/trips', 'GET', undefined, login.cookie)).data.trips[0].id, tripId);
  } finally {
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
