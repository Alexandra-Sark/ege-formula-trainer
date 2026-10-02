import { configFromEnv } from './config.js';
import { loadLegal } from './legal.js';
import { createPool,cleanup } from './db.js';
import { mailer } from './mail.js';
import { createApp } from './app.js';

const config=configFromEnv();
const legal=loadLegal(config);
const pool=createPool(config);
const mail=mailer(config);
const app=createApp({pool,config,legal,mail});
const server=app.listen(config.port,'0.0.0.0',() => console.log(`EGE API listening on port ${config.port}; accounts ${config.enabled ? 'enabled' : 'disabled'}`));
server.requestTimeout=30000;
server.headersTimeout=15000;
const cleanupTimer=setInterval(() => cleanup(pool).catch(() => console.error('Cleanup failed')),60*60*1000);
cleanupTimer.unref();
let closing=false;
async function shutdown() {
  if(closing) return;
  closing=true;clearInterval(cleanupTimer);
  const timeout=setTimeout(() => process.exit(1),10000);timeout.unref();
  server.close(async () => {await pool.end();clearTimeout(timeout);process.exit(0);});
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
