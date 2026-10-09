import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const html=fs.readFileSync(new URL('../converter-express_1.html',import.meta.url),'utf8');
test('legal pages accurately identify payment and refund handling',()=>{for(const text of ['Whop','payment before an online order is confirmed','administrator review','Effective October 9, 2026','408-917-8099'])assert.match(html,new RegExp(text,'i'));for(const text of ['Placeholder draft for demo purposes only','Payments are processed by Stripe','Online payments are not connected'])assert(!html.includes(text));});
test('production customer copy excludes local-preview persistence claims',()=>{assert(!html.includes('saved on this computer'));});
