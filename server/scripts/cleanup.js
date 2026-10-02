import { configFromEnv } from '../src/config.js';
import { createPool,cleanup } from '../src/db.js';
const pool=createPool(configFromEnv());
try {await cleanup(pool);console.log('Expired challenges, sessions and rate-limit windows removed.');}
catch {console.error('Cleanup failed. Check database connection.');process.exitCode=1;}
finally {await pool.end();}
