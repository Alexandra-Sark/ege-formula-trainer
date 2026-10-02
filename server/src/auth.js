import { randomUUID } from 'node:crypto';
import { transaction } from './db.js';
import { hash,token,code,equal,email,nickname,uuid,fail,record,cookieValue } from './security.js';

export function authService({pool,config,legal,mail}) {
  const cookieName = config.production ? '__Host-ege_session' : 'ege_session';
  const sessionHash = value => hash(config.secret,'session|' + value);
  const csrfToken = value => hash(config.secret,'csrf|' + value);
  const accountLock = (client,address) => client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[address]);
  async function limit(client,key,max) {
    const keyHash = hash(config.secret,'rate|' + key);
    const {rows} = await client.query(`INSERT INTO rate_limits(key_hash) VALUES($1)
      ON CONFLICT(key_hash) DO UPDATE SET
      hits=CASE WHEN rate_limits.window_start < now()-interval '1 hour' THEN 1 ELSE rate_limits.hits+1 END,
      window_start=CASE WHEN rate_limits.window_start < now()-interval '1 hour' THEN now() ELSE rate_limits.window_start END
      RETURNING hits`,[keyHash]);
    if (rows[0].hits > max) fail(429,'TOO_MANY_REQUESTS');
  }
  function enabled() { if (!config.enabled || !legal.ready) fail(503,'ACCOUNTS_NOT_ENABLED'); }
  async function start(body,ip) {
    enabled();
    if (!record(body) || !['register','login'].includes(body.purpose)) fail(400,'INVALID_REQUEST');
    const address=email(body.email), name=body.purpose === 'register' ? nickname(body.nickname) : null;
    const accepted=legal.verifyAccepted(body.legal);
    const id=randomUUID(), oneTimeCode=code();
    await transaction(pool,async client => {
      await limit(client,'send-ip|' + ip,30);
      await limit(client,'send-email|' + address,6);
      await accountLock(client,address);
      await client.query(`INSERT INTO auth_challenges(id,email,purpose,nickname,code_hash,legal,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')`,
      [id,address,body.purpose,name,hash(config.secret,'otp|' + id + '|' + oneTimeCode),JSON.stringify(accepted)]);
    });
    // Same mail and response for existing and unknown addresses; account existence is not returned.
    try { await mail.sendCode({email:address,code:oneTimeCode}); }
    catch {
      await pool.query('UPDATE auth_challenges SET consumed=true WHERE id=$1',[id]);
      fail(503,'EMAIL_DELIVERY_UNAVAILABLE');
    }
    return {challengeId:id,expiresInSeconds:600,message:'Если адрес указан верно, на него отправлен код.'};
  }
  async function verify(body,ip) {
    enabled();
    if (!record(body) || !uuid(body.challengeId) || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) fail(400,'INVALID_CODE');
    const sessionToken=token();
    const result=await transaction(pool,async client => {
      await limit(client,'verify-ip|' + ip,100);
      const found=(await client.query('SELECT email FROM auth_challenges WHERE id=$1',[body.challengeId])).rows[0];
      if (!found) return null;
      await accountLock(client,found.email);
      const challenge=(await client.query('SELECT *,expires_at>now() AS valid FROM auth_challenges WHERE id=$1 FOR UPDATE',[body.challengeId])).rows[0];
      if (!challenge || !challenge.valid || challenge.consumed || challenge.attempts >= 5) return null;
      await client.query('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=$1',[challenge.id]);
      if (!equal(challenge.code_hash,hash(config.secret,'otp|' + challenge.id + '|' + body.code))) return null;
      // A document changed since the email was requested: require a fresh confirmation.
      for (const type of ['terms','consent']) {
        const saved=challenge.legal?.[type], current=legal.documents[type];
        if (!saved || saved.version !== current.version || saved.sha256 !== current.sha256) {
          await client.query('UPDATE auth_challenges SET consumed=true WHERE id=$1',[challenge.id]);
          return {legalChanged:true};
        }
      }
      if (challenge.purpose === 'register') await client.query(`INSERT INTO users(id,email,nickname)
        VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING`,[randomUUID(),challenge.email,challenge.nickname]);
      const user=(await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE',[challenge.email])).rows[0];
      if (!user) {await client.query('UPDATE auth_challenges SET consumed=true WHERE id=$1',[challenge.id]);return null;}
      for (const type of ['terms','consent']) {
        const accepted=challenge.legal[type];
        await client.query(`INSERT INTO legal_acceptances(user_id,document_type,document_version,document_sha256,accepted_at)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[user.id,type,accepted.version,accepted.sha256,challenge.accepted_at]);
      }
      await client.query('UPDATE auth_challenges SET consumed=true WHERE email=$1',[challenge.email]);
      await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3*interval '1 hour')",
        [sessionHash(sessionToken),user.id,config.sessionHours]);
      return {user:{id:user.id,email:user.email,nickname:user.nickname}};
    });
    if (result?.legalChanged) fail(409,'LEGAL_DOCUMENT_CHANGED');
    if (!result) fail(400,'INVALID_OR_EXPIRED_CODE');
    return {...result,sessionToken,csrfToken:csrfToken(sessionToken)};
  }
  function setCookie(res,value) {
    res.cookie(cookieName,value,{httpOnly:true,secure:config.production,sameSite:'lax',path:'/',maxAge:config.sessionHours*3600000});
  }
  function clearCookie(res) {res.clearCookie(cookieName,{httpOnly:true,secure:config.production,sameSite:'lax',path:'/'});}
  async function session(req) {
    enabled();
    const value=cookieValue(req.headers.cookie,cookieName);
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) fail(401,'AUTHENTICATION_REQUIRED');
    const row=(await pool.query(`SELECT u.id,u.email,u.nickname,s.created_at FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[sessionHash(value)])).rows[0];
    if (!row) fail(401,'AUTHENTICATION_REQUIRED');
    return {user:{id:row.id,email:row.email,nickname:row.nickname},tokenHash:sessionHash(value),csrfToken:csrfToken(value),createdAt:row.created_at};
  }
  async function logout(current) {await pool.query('DELETE FROM sessions WHERE token_hash=$1',[current.tokenHash]);}
  async function deleteAccount(current) {
    await transaction(pool,async client => {
      await accountLock(client,current.user.email);
      // Re-check freshness in PostgreSQL, not using a timestamp supplied by the browser.
      const fresh=(await client.query(`SELECT token_hash FROM sessions WHERE token_hash=$1
        AND expires_at>now() AND created_at>now()-interval '15 minutes'`,[current.tokenHash])).rowCount;
      if (!fresh) fail(403,'RECENT_LOGIN_REQUIRED');
      await client.query('DELETE FROM users WHERE id=$1',[current.user.id]);
      await client.query('DELETE FROM auth_challenges WHERE email=$1',[current.user.email]);
    });
  }
  return {start,verify,session,logout,deleteAccount,setCookie,clearCookie};
}
