import express from 'express';
import { randomUUID } from 'node:crypto';
import { authService } from './auth.js';
import { progressService } from './progress.js';
import { equal,fail,HttpError } from './security.js';

export function createApp({pool,config,legal,mail,logger=console}) {
  const app=express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy',config.trustProxy);
  const auth=authService({pool,config,legal,mail});
  const progress=progressService({pool,config});
  app.use((req,res,next) => {
    req.requestId=randomUUID();
    res.set({'X-Request-Id':req.requestId,'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
    if(config.production) res.set('Strict-Transport-Security','max-age=31536000');
    next();
  });
  app.get('/health',(req,res) => res.json({status:'ok',accountsEnabled:config.enabled}));
  app.get('/ready',async (req,res) => {
    try {
      await pool.query('SELECT 1');
      const migrated=(await pool.query("SELECT version FROM schema_migrations WHERE version='001_accounts'")).rowCount;
      if(!migrated) return res.status(503).json({status:'not_ready'});
      res.json({status:'ready'});
    } catch { res.status(503).json({status:'not_ready'}); }
  });
  app.get('/api/legal',(req,res) => res.json(legal.publicInfo()));
  app.get('/legal/:type',(req,res) => {
    const document=Object.hasOwn(legal.documents,req.params.type) ? legal.documents[req.params.type] : null;
    if(!document) return res.status(404).json({error:'DOCUMENT_NOT_AVAILABLE'});
    res.type('html').send(document.content);
  });
  app.use('/api',(req,res,next) => {
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if(req.get('origin')!==config.origin) return next(new HttpError(403,'ORIGIN_NOT_ALLOWED'));
      if(['POST','PUT','PATCH'].includes(req.method) && !req.is('application/json')) return next(new HttpError(415,'JSON_REQUIRED'));
    }
    next();
  });
  app.use('/api/progress/import',express.json({limit:'2mb'}));
  app.use('/api',express.json({limit:'64kb'}));
  app.post('/api/auth/start',async (req,res) => res.status(202).json(await auth.start(req.body,req.ip)));
  app.post('/api/auth/verify',async (req,res) => {
    const {sessionToken,...result}=await auth.verify(req.body,req.ip);
    auth.setCookie(res,sessionToken);res.json(result);
  });
  app.use('/api',async (req,res,next) => {
    try {
      req.account=await auth.session(req);
      if(['POST','PUT','PATCH','DELETE'].includes(req.method) && !equal(req.get('x-csrf-token'),req.account.csrfToken)) fail(403,'CSRF_TOKEN_REQUIRED');
      next();
    } catch(error) {next(error);}
  });
  app.get('/api/session',(req,res) => res.json({user:req.account.user,csrfToken:req.account.csrfToken}));
  app.post('/api/auth/logout',async (req,res) => {await auth.logout(req.account);auth.clearCookie(res);res.status(204).end();});
  app.delete('/api/account',async (req,res) => {await auth.deleteAccount(req.account);auth.clearCookie(res);res.status(204).end();});
  app.get('/api/progress',async (req,res) => res.json(await progress.get(req.account.user.id)));
  app.post('/api/progress/events',async (req,res) => res.json(await progress.events(req.account.user.id,req.body)));
  app.put('/api/progress/draft',async (req,res) => res.json(await progress.draft(req.account.user.id,req.body)));
  app.post('/api/progress/import',async (req,res) => res.json(await progress.importProgress(req.account.user.id,req.body)));
  app.use((req,res) => res.status(404).json({error:'NOT_FOUND'}));
  app.use((error,req,res,next) => {
    if(res.headersSent) return next(error);
    const status=error instanceof HttpError ? error.status : error.type==='entity.too.large' ? 413 : error.type==='entity.parse.failed' ? 400 : 500;
    const errorCode=error instanceof HttpError ? error.code : status===413 ? 'BODY_TOO_LARGE' : status===400 ? 'INVALID_JSON' : 'INTERNAL_ERROR';
    if(status===429) res.set('Retry-After','3600');
    if(status>=500) logger.error({requestId:req.requestId,code:'SERVER_ERROR'});
    res.status(status).json({error:errorCode,requestId:req.requestId});
  });
  return app;
}
