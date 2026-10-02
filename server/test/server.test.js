import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { configFromEnv } from '../src/config.js';
import { loadLegal } from '../src/legal.js';
import { migrate, cleanup } from '../src/db.js';
import { createApp } from '../src/app.js';
import { canonical } from '../src/security.js';
import { mailer } from '../src/mail.js';

// Real PostgreSQL SQL/transactions in WebAssembly. This adapter serializes the single
// PGlite connection; production uses pg.Pool with the same client/query contract.
function testPool(db) {
  let tail=Promise.resolve();
  async function connect() {
    const previous=tail;
    let release;
    tail=new Promise(resolve => {release=resolve;});
    await previous;
    return {query:async (sql,args) => {
      if (!args && sql.includes(';')) return db.exec(sql);
      const result=await db.query(sql,args);
      return {...result,rowCount:result.rowCount ?? result.affectedRows ?? result.rows.length};
    },release};
  }
  return {connect,async query(sql,args) {const c=await connect();try{return await c.query(sql,args);}finally{c.release();}}};
}
function fixtureLegal(dir) {
  const manifest={accountsReady:true,operator:{name:'Test Operator',address:'Test address',contact:'test@example.invalid'},documents:{}};
  for(const type of ['terms','privacy','consent']) {
    const content='<!doctype html><html lang="ru"><body>Test '+type+'</body></html>';
    writeFileSync(join(dir,type+'.html'),content);
    manifest.documents[type]={file:type+'.html',version:'test-v1',sha256:createHash('sha256').update(content).digest('hex')};
  }
  writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));
}

test('configuration and document integrity',() => {
  const config=configFromEnv({});
  assert.equal(loadLegal(config).publicInfo().accountsEnabled,false);
  assert.deepEqual(Object.keys(loadLegal(config).documents),['terms']);
  assert.throws(() => loadLegal({...config,enabled:true}),/approved/);
  assert.throws(() => configFromEnv({ACCOUNTS_ENABLED:'true'}),/AUTH_SECRET/);
  assert.throws(() => configFromEnv({NODE_ENV:'production',PUBLIC_ORIGIN:'http://example.invalid'}),/HTTPS/);
  assert.throws(() => configFromEnv({PUBLIC_ORIGIN:'https://example.invalid/path'}),/origin/);
  assert.throws(() => configFromEnv({PG_SSL_MODE:'no-verify'}),/PG_SSL_MODE/);
  assert.equal(configFromEnv({PG_SSL_MODE:'verify-full'}).db.ssl.rejectUnauthorized,true);
  assert.throws(()=>mailer({...config,enabled:true}),/SMTP_HOST/);
  assert.throws(()=>mailer({...config,enabled:true,smtp:{host:'mail.invalid',port:465,secure:false,user:'u',pass:'p',from:'test@example.invalid'}}),/requires/);
  assert.notEqual(canonical({date:new Date(1)}),canonical({date:new Date(2)}));
  const dir=mkdtempSync(join(tmpdir(),'ege-legal-'));
  try {
    fixtureLegal(dir);
    writeFileSync(join(dir,'terms.html'),'changed');
    assert.throws(() => loadLegal({...config,legalDir:dir}),/hash mismatch/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('HTTP API, authentication and progress against PostgreSQL',async t => {
  const db=new PGlite(),pool=testPool(db);
  const dir=mkdtempSync(join(tmpdir(),'ege-api-'));
  fixtureLegal(dir);
  const config=configFromEnv({PUBLIC_ORIGIN:'http://localhost:3000',ACCOUNTS_ENABLED:'true',AUTH_SECRET:randomBytes(32).toString('base64url'),LEGAL_DIR:dir});
  const legal=loadLegal(config),messages=[];
  let mailFails=false;
  const mail={async sendCode(message){if(mailFails) throw Error('SMTP unavailable');messages.push(message);}};
  const logs=[];
  const app=createApp({pool,config,legal,mail,logger:{error:value=>logs.push(value)}});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const catalog=JSON.parse(readFileSync(new URL('../task-catalog.json',import.meta.url)));
  const automatic=catalog.find(q=>!['proof','solution'].includes(q.format)).uid;
  const written=catalog.find(q=>['proof','solution'].includes(q.format)).uid;
  const legalBody=() => Object.fromEntries(['terms','consent'].map(type => [type,{accepted:true,version:legal.documents[type].version,sha256:legal.documents[type].sha256}]));
  async function request(path,{method='GET',body,account,headers={}}={}) {
    const response=await fetch(base+path,{method,headers:{...(method!=='GET'?{'Origin':config.origin,'Content-Type':'application/json'}:{}),
      ...(account?{Cookie:account.cookie,'X-CSRF-Token':account.csrfToken}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await response.text();
    return {status:response.status,data:text?JSON.parse(text):null,headers:response.headers};
  }
  async function start(email,purpose='register',nickname='Ученик') {
    const r=await request('/api/auth/start',{method:'POST',body:{purpose,email,nickname,legal:legalBody()}});
    assert.equal(r.status,202,JSON.stringify(r.data));
    return {challengeId:r.data.challengeId,code:messages.at(-1).code};
  }
  async function finish(challenge) {
    return request('/api/auth/verify',{method:'POST',body:challenge});
  }
  async function register(email) {
    const r=await finish(await start(email));
    assert.equal(r.status,200,JSON.stringify(r.data));
    return {...r.data,cookie:r.headers.get('set-cookie').split(';')[0]};
  }
  let a,b;
  try {
    await t.test('health, readiness, migration replay and disabled accounts',async()=>{
      assert.equal((await request('/health')).status,200);
      assert.equal((await request('/ready')).status,503);
      await migrate(pool);await migrate(pool);
      assert.equal((await request('/ready')).status,200);
      assert.equal((await pool.query('SELECT * FROM schema_migrations')).rowCount,1);
      const disabledConfig={...config,enabled:false};
      const disabled=createApp({pool,config:disabledConfig,legal:loadLegal(configFromEnv({})),mail,logger:{error:()=>{}}});
      const s=disabled.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));
      try {
        const r=await fetch('http://127.0.0.1:'+s.address().port+'/api/auth/start',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:'{}'});
        assert.equal(r.status,503);assert.equal((await r.json()).error,'ACCOUNTS_NOT_ENABLED');
      } finally {await new Promise(r=>s.close(r));}
    });
    await t.test('separate current consent, validation, origin and JSON gates',async()=>{
      const body={purpose:'register',email:'one@example.invalid',nickname:'Ученик',legal:legalBody()};
      assert.equal((await request('/api/auth/start',{method:'POST',body:{...body,legal:{terms:body.legal.terms}}})).data.error,'CONSENTS_REQUIRED');
      const old=legalBody();old.consent.version='old';
      assert.equal((await request('/api/auth/start',{method:'POST',body:{...body,legal:old}})).status,409);
      assert.equal((await request('/api/auth/start',{method:'POST',body:{...body,email:'bad'}})).data.error,'INVALID_EMAIL');
      assert.equal((await request('/api/auth/start',{method:'POST',body:{...body,nickname:'<script>'}})).data.error,'INVALID_NICKNAME');
      assert.equal((await request('/api/auth/start',{method:'POST',body,headers:{Origin:'https://other.invalid'}})).status,403);
      assert.equal((await request('/api/auth/start',{method:'POST',body,headers:{'Content-Type':'text/plain'}})).status,415);
      const bad=await fetch(base+'/api/auth/start',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:'{'});
      assert.equal(bad.status,400);assert.equal((await bad.json()).error,'INVALID_JSON');
      assert.equal((await pool.query('SELECT * FROM auth_challenges')).rowCount,0);
    });
    await t.test('verified registration, hashed secrets, consent evidence and session',async()=>{
      const challenge=await start('FIRST@example.invalid');
      assert.equal((await pool.query('SELECT * FROM users')).rowCount,0);
      const row=(await pool.query('SELECT * FROM auth_challenges WHERE id=$1',[challenge.challengeId])).rows[0];
      assert.notEqual(row.code_hash,challenge.code);
      const r=await finish(challenge);assert.equal(r.status,200,JSON.stringify(r.data));
      assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
      assert.equal(r.data.sessionToken,undefined);
      a={...r.data,cookie:r.headers.get('set-cookie').split(';')[0]};
      assert.equal(a.user.email,'first@example.invalid');
      const session=(await pool.query('SELECT * FROM sessions')).rows[0];assert.notEqual(session.token_hash,a.cookie.split('=')[1]);
      const accepts=(await pool.query('SELECT * FROM legal_acceptances')).rows;
      assert.equal(accepts.length,2);assert.equal(accepts[0].method,'checkbox-and-email-code');
      assert.equal((await finish(challenge)).status,400);
      assert.equal((await request('/api/session',{account:a})).data.user.id,a.user.id);
      assert.equal((await request('/api/progress')).status,401);
    });
    await t.test('OTP attempt limit, expiry, unknown login and SMTP failure',async()=>{
      const ch=await start('lockout@example.invalid');
      const wrong=ch.code==='000000'?'000001':'000000';
      for(let i=0;i<5;i++) assert.equal((await finish({...ch,code:wrong})).status,400);
      assert.equal((await finish(ch)).status,400);
      assert.equal((await pool.query('SELECT attempts FROM auth_challenges WHERE id=$1',[ch.challengeId])).rows[0].attempts,5);
      const expired=await start('expired@example.invalid');
      await pool.query("UPDATE auth_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.challengeId]);
      assert.equal((await finish(expired)).status,400);
      const unknown=await start('unknown@example.invalid','login');assert.equal((await finish(unknown)).status,400);
      mailFails=true;
      const r=await request('/api/auth/start',{method:'POST',body:{purpose:'register',email:'smtp@example.invalid',nickname:'Ученик',legal:legalBody()}});
      mailFails=false;assert.equal(r.status,503);assert.equal(r.data.error,'EMAIL_DELIVERY_UNAVAILABLE');
      assert.equal((await pool.query("SELECT * FROM users WHERE email='smtp@example.invalid'")).rowCount,0);
      assert.equal((await pool.query("SELECT consumed FROM auth_challenges WHERE email='smtp@example.invalid'")).rows[0].consumed,true);
    });
    await t.test('parallel codes, current documents and existing nickname',async()=>{
      const first=await start('second@example.invalid');
      const second=await start('second@example.invalid');
      const r=await finish(second);assert.equal(r.status,200);b={...r.data,cookie:r.headers.get('set-cookie').split(';')[0]};
      assert.equal((await finish(first)).status,400);
      const same=await start('second@example.invalid','register','Другое имя');assert.equal((await finish(same)).data.user.nickname,'Ученик');
      const changed=await start('changed@example.invalid');
      const old=legal.documents.consent.version;legal.documents.consent.version='new';
      assert.equal((await finish(changed)).data.error,'LEGAL_DOCUMENT_CHANGED');legal.documents.consent.version=old;
      assert.equal((await pool.query("SELECT * FROM users WHERE email='changed@example.invalid'")).rowCount,0);
    });
    await t.test('CSRF, task validation, idempotency and rollback',async()=>{
      const event={eventId:randomUUID(),kind:'answer',uid:automatic,correct:true,selfReviewed:false};
      assert.equal((await request('/api/progress/events',{method:'POST',account:a,body:{events:[event]},headers:{'X-CSRF-Token':''}})).status,403);
      assert.equal((await request('/api/progress/events',{method:'POST',account:a,body:{events:[{...event,uid:'unknown'}]}})).data.error,'UNKNOWN_TASK');
      assert.equal((await request('/api/progress/events',{method:'POST',account:a,body:{events:[{...event,selfReviewed:true}]}})).status,400);
      const send=events=>request('/api/progress/events',{method:'POST',account:a,body:{events}});
      assert.equal((await send([event])).data.added,1);assert.equal((await send([event])).data.duplicates,1);
      assert.equal((await send([{...event,eventId:event.eventId.toUpperCase()}])).data.duplicates,1);
      assert.equal((await send([{eventId:randomUUID(),kind:'session'},{...event,correct:false}])).status,409);
      assert.equal((await request('/api/progress',{account:a})).data.sessions,0);
      assert.equal((await send([{eventId:randomUUID(),kind:'session'},{eventId:randomUUID(),kind:'answer',uid:written,correct:false,selfReviewed:true}])).data.added,2);
      const p=(await request('/api/progress',{account:a})).data;
      assert.equal(p.weak[automatic].correct,1);assert.equal(p.weak[written].selfReviewed,1);assert.equal(p.sessions,1);
      assert.ok(p.mistakes.includes(written));
      assert.deepEqual((await request('/api/progress',{account:b})).data.weak,{});
    });
    await t.test('concurrent requests count once; drafts prevent lost updates',async()=>{
      const event={eventId:randomUUID(),kind:'answer',uid:automatic,correct:false,selfReviewed:false};
      const results=await Promise.all([1,2].map(()=>request('/api/progress/events',{method:'POST',account:a,body:{events:[event]}})));
      assert.deepEqual(results.map(r=>r.data.added).sort(),[0,1]);
      const body={uid:written,content:'Решение <script>текст</script>',expectedRevision:0};
      const drafts=await Promise.all([1,2].map(()=>request('/api/progress/draft',{method:'PUT',account:a,body})));
      assert.deepEqual(drafts.map(r=>r.status).sort(),[200,409]);
      const p=(await request('/api/progress',{account:a})).data;
      assert.equal(p.proofDrafts[written],body.content);assert.equal(p.draftVersions[written],1);
      assert.equal((await request('/api/progress/draft',{method:'PUT',account:a,body:{...body,uid:automatic}})).status,400);
      assert.equal((await request('/api/progress/draft',{method:'PUT',account:a,body:{...body,content:'я'.repeat(12001)}})).status,400);
    });
    await t.test('local import once, repeat recovery and changed payload conflict',async()=>{
      const timestamp=Date.now()-10000;
      const body={importId:randomUUID(),progress:{sessions:3,weak:{[automatic]:{correct:4,wrong:2,lastSeen:timestamp},[written]:{correct:2,wrong:1,lastSeen:timestamp},obsolete:{correct:99}},proofDrafts:{[written]:'Черновик'}}};
      const r=await request('/api/progress/import',{method:'POST',account:b,body});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.ignored,1);
      assert.equal((await request('/api/progress/import',{method:'POST',account:b,body})).data.alreadyImported,true);
      const changed=structuredClone(body);changed.progress.weak[automatic].lastSeen--;
      assert.equal((await request('/api/progress/import',{method:'POST',account:b,body:changed})).status,409);
      assert.equal((await request('/api/progress/import',{method:'POST',account:b,body:{...body,importId:randomUUID()}})).status,409);
      const p=(await request('/api/progress',{account:b})).data;
      assert.equal(p.sessions,3);assert.equal(p.weak[written].selfReviewed,3);assert.equal(p.weak[automatic].lastSeen,timestamp);
      assert.equal(p.proofDrafts[written],'Черновик');
      assert.equal((await request('/api/progress/import',{method:'POST',account:a,body})).data.error,'CLOUD_PROGRESS_NOT_EMPTY');
      assert.equal((await request('/api/progress/import',{method:'POST',account:a,body:{importId:randomUUID(),progress:{sessions:false}}})).status,400);
    });
    await t.test('body size and persistent email send limits',async()=>{
      assert.equal((await request('/api/auth/start',{method:'POST',body:{large:'a'.repeat(70000)}})).status,413);
      for(let i=0;i<6;i++) await start('limited@example.invalid');
      const r=await request('/api/auth/start',{method:'POST',body:{purpose:'login',email:'limited@example.invalid',legal:legalBody()}});
      assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'3600');
    });
    await t.test('production cookies are secure host-only and headers prohibit embedding',async()=>{
      const cfg={...config,production:true,origin:'https://trainer.example.invalid'};
      const prod=createApp({pool,config:cfg,legal,mail,logger:{error:()=>{}}});
      const s=prod.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));
      const url='http://127.0.0.1:'+s.address().port;
      try {
        const ch=await start('secure@example.invalid');
        const r=await fetch(url+'/api/auth/verify',{method:'POST',headers:{Origin:cfg.origin,'Content-Type':'application/json'},body:JSON.stringify(ch)});
        assert.equal(r.status,200);
        const cookie=r.headers.get('set-cookie');assert.match(cookie,/^__Host-ege_session=/);assert.match(cookie,/; Secure/);assert.match(cookie,/; HttpOnly/);assert.doesNotMatch(cookie,/Domain=/);
        assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(r.headers.get('strict-transport-security'),/31536000/);
        await r.text();
      } finally {await new Promise(r=>s.close(r));}
    });
    await t.test('account deletion needs recent login; deletion cascades and preserves other user',async()=>{
      await pool.query("UPDATE sessions SET created_at=now()-interval '16 minutes' WHERE user_id=$1",[a.user.id]);
      assert.equal((await request('/api/account',{method:'DELETE',account:a})).data.error,'RECENT_LOGIN_REQUIRED');
      const r=await finish(await start(a.user.email,'login'));assert.equal(r.status,200);
      const fresh={...r.data,cookie:r.headers.get('set-cookie').split(';')[0]};
      assert.equal((await request('/api/account',{method:'DELETE',account:fresh})).status,204);
      assert.equal((await request('/api/session',{account:a})).status,401);
      for(const table of ['sessions','legal_acceptances','task_progress','proof_drafts','progress_events'])
        assert.equal((await pool.query('SELECT * FROM '+table+' WHERE user_id=$1',[a.user.id])).rowCount,0);
      assert.equal((await request('/api/session',{account:b})).status,200);
    });
    await t.test('logout and expiry cleanup',async()=>{
      assert.equal((await request('/api/auth/logout',{method:'POST',account:b,body:{}})).status,204);
      assert.equal((await request('/api/session',{account:b})).status,401);
      await pool.query("UPDATE auth_challenges SET expires_at=now()-interval '1 minute'");
      await pool.query("UPDATE sessions SET expires_at=now()-interval '1 minute'");
      await pool.query("UPDATE rate_limits SET window_start=now()-interval '2 hours'");
      await cleanup(pool);
      for(const table of ['auth_challenges','sessions','rate_limits']) assert.equal((await pool.query('SELECT * FROM '+table)).rowCount,0);
      assert.equal(logs.length,1);assert.equal(logs[0].code,'SERVER_ERROR');
      assert.equal(JSON.stringify(logs).includes('smtp@example.invalid'),false);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));await db.close();rmSync(dir,{recursive:true,force:true});
  }
});
