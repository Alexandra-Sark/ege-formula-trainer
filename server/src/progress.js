import { readFileSync } from 'node:fs';
import { transaction } from './db.js';
import { record,uuid,fail,canonical,hash } from './security.js';

const catalog=new Map(JSON.parse(readFileSync(new URL('../task-catalog.json',import.meta.url),'utf8')).map(q => [q.uid,q]));
const selfTask=q => ['proof','solution'].includes(q.format);
const counter=value => Number.isInteger(value) && value >= 0 && value <= 100000;
const getTask=uid => {if (!catalog.has(uid)) fail(400,'UNKNOWN_TASK');return catalog.get(uid);};

export function progressService({pool,config}) {
  async function lock(client,userId) {
    if (!(await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])).rowCount) fail(401,'AUTHENTICATION_REQUIRED');
  }
  async function get(userId) {
    return transaction(pool,async client => {
      await lock(client,userId);
      const tasks=(await client.query('SELECT * FROM task_progress WHERE user_id=$1',[userId])).rows;
      const drafts=(await client.query('SELECT * FROM proof_drafts WHERE user_id=$1',[userId])).rows;
      const sessions=(await client.query('SELECT sessions FROM user_progress WHERE user_id=$1',[userId])).rows[0]?.sessions || 0;
      return {
        sessions,migrated:true,
        weak:Object.fromEntries(tasks.map(t => [t.task_uid,{
          skill:catalog.get(t.task_uid)?.skill || '',correct:t.correct,wrong:t.wrong,
          selfReviewed:t.self_reviewed,lastSeen:t.last_seen ? new Date(t.last_seen).getTime() : null
        }])),
        mistakes:tasks.filter(t => t.wrong>t.correct).map(t => t.task_uid),
        proofDrafts:Object.fromEntries(drafts.map(d => [d.task_uid,d.content])),
        draftVersions:Object.fromEntries(drafts.map(d => [d.task_uid,d.revision])),
        imported:!!(await client.query('SELECT user_id FROM progress_imports WHERE user_id=$1',[userId])).rowCount
      };
    });
  }
  async function events(userId,body) {
    if (!record(body) || !Array.isArray(body.events) || body.events.length<1 || body.events.length>50) fail(400,'INVALID_EVENTS');
    const normalized=body.events.map(event => {
      if (!record(event) || !uuid(event.eventId) || !['answer','session'].includes(event.kind)) fail(400,'INVALID_EVENTS');
      if (event.kind==='session') return {eventId:event.eventId.toLowerCase(),kind:'session'};
      const q=getTask(event.uid);
      if (typeof event.correct !== 'boolean' || event.selfReviewed !== selfTask(q)) fail(400,'INVALID_ANSWER_EVENT');
      return {eventId:event.eventId.toLowerCase(),kind:'answer',uid:q.uid,correct:event.correct,selfReviewed:selfTask(q)};
    });
    return transaction(pool,async client => {
      await lock(client,userId);
      let added=0;
      for (const event of normalized) {
        const payloadHash=hash(config.secret,canonical(event));
        const inserted=await client.query(`INSERT INTO progress_events(user_id,event_id,payload_hash,kind)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id`,[userId,event.eventId,payloadHash,event.kind]);
        if (!inserted.rowCount) {
          const previous=(await client.query('SELECT payload_hash FROM progress_events WHERE user_id=$1 AND event_id=$2',[userId,event.eventId])).rows[0];
          if (previous.payload_hash !== payloadHash) fail(409,'EVENT_ID_CONFLICT');
          continue;
        }
        added++;
        if (event.kind==='session') {
          await client.query(`INSERT INTO user_progress(user_id,sessions) VALUES($1,1)
            ON CONFLICT(user_id) DO UPDATE SET sessions=user_progress.sessions+1`,[userId]);
        } else {
          await client.query(`INSERT INTO task_progress(user_id,task_uid,correct,wrong,self_reviewed,last_seen)
            VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(user_id,task_uid) DO UPDATE SET
            correct=task_progress.correct+EXCLUDED.correct,wrong=task_progress.wrong+EXCLUDED.wrong,
            self_reviewed=task_progress.self_reviewed+EXCLUDED.self_reviewed,last_seen=now()`,
          [userId,event.uid,event.correct?1:0,event.correct?0:1,event.selfReviewed?1:0]);
        }
      }
      return {added,duplicates:normalized.length-added};
    });
  }
  async function draft(userId,body) {
    if (!record(body) || typeof body.uid !== 'string' || typeof body.content !== 'string'
        || [...body.content].length>12000 || !Number.isInteger(body.expectedRevision) || body.expectedRevision<0
        || body.expectedRevision>=2147483647) fail(400,'INVALID_DRAFT');
    if (!selfTask(getTask(body.uid))) fail(400,'NOT_A_WRITTEN_TASK');
    return transaction(pool,async client => {
      await lock(client,userId);
      const previous=(await client.query('SELECT revision FROM proof_drafts WHERE user_id=$1 AND task_uid=$2',[userId,body.uid])).rows[0];
      if ((previous?.revision || 0) !== body.expectedRevision) fail(409,'DRAFT_VERSION_CONFLICT');
      const revision=body.expectedRevision+1;
      await client.query(`INSERT INTO proof_drafts(user_id,task_uid,content,revision) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id,task_uid) DO UPDATE SET content=EXCLUDED.content,revision=EXCLUDED.revision,updated_at=now()`,
      [userId,body.uid,body.content,revision]);
      return {revision};
    });
  }
  async function importProgress(userId,body) {
    if (!record(body) || !uuid(body.importId) || !record(body.progress)) fail(400,'INVALID_IMPORT');
    body={...body,importId:body.importId.toLowerCase()};
    const p=body.progress;
    if (!counter(p.sessions ?? 0) || !record(p.weak ?? {}) || !record(p.proofDrafts ?? {})
        || Object.keys(p.weak ?? {}).length>5000 || Object.keys(p.proofDrafts ?? {}).length>5000) fail(400,'INVALID_IMPORT');
    let ignored=0;
    const tasks=[],drafts=[];
    for (const [uid,value] of Object.entries(p.weak ?? {})) {
      if (!catalog.has(uid)) {ignored++;continue;}
      if (!record(value) || !counter(value.correct ?? 0) || !counter(value.wrong ?? 0)) fail(400,'INVALID_IMPORT');
      const c=value.correct ?? 0,w=value.wrong ?? 0;
      const date=Number.isFinite(value.lastSeen) && value.lastSeen>0 && value.lastSeen<=Date.now() ? new Date(value.lastSeen) : null;
      tasks.push({uid,c,w,self:selfTask(catalog.get(uid))?c+w:0,date});
    }
    for (const [uid,content] of Object.entries(p.proofDrafts ?? {})) {
      if (!catalog.has(uid)) {ignored++;continue;}
      if (!selfTask(catalog.get(uid)) || typeof content !== 'string' || [...content].length>12000) fail(400,'INVALID_IMPORT');
      drafts.push({uid,content});
    }
    tasks.sort((a,b) => a.uid.localeCompare(b.uid));
    drafts.sort((a,b) => a.uid.localeCompare(b.uid));
    const normalized={sessions:p.sessions ?? 0,tasks,drafts};
    const payloadHash=hash(config.secret,canonical(normalized));
    return transaction(pool,async client => {
      await lock(client,userId);
      const previous=(await client.query('SELECT * FROM progress_imports WHERE user_id=$1',[userId])).rows[0];
      if (previous) {
        if (previous.import_id===body.importId && previous.payload_hash===payloadHash) return {imported:false,alreadyImported:true,ignored};
        fail(409,'PROGRESS_ALREADY_IMPORTED');
      }
      // Import is only for an empty cloud account: avoids overlap with already-synced answers.
      const used=(await client.query('SELECT user_id FROM progress_events WHERE user_id=$1 LIMIT 1',[userId])).rowCount
        || (await client.query('SELECT user_id FROM proof_drafts WHERE user_id=$1 LIMIT 1',[userId])).rowCount;
      if (used) fail(409,'CLOUD_PROGRESS_NOT_EMPTY');
      for (const t of tasks) await client.query(`INSERT INTO task_progress(user_id,task_uid,correct,wrong,self_reviewed,last_seen)
        VALUES($1,$2,$3,$4,$5,$6)`,[userId,t.uid,t.c,t.w,t.self,t.date]);
      for (const d of drafts) await client.query('INSERT INTO proof_drafts(user_id,task_uid,content,revision) VALUES($1,$2,$3,1)',[userId,d.uid,d.content]);
      await client.query('INSERT INTO user_progress(user_id,sessions) VALUES($1,$2)',[userId,normalized.sessions]);
      await client.query('INSERT INTO progress_imports(user_id,import_id,payload_hash) VALUES($1,$2,$3)',[userId,body.importId,payloadHash]);
      return {imported:true,ignored};
    });
  }
  return {get,events,draft,importProgress};
}
