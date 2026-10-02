import { configFromEnv } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
const pool=createPool(configFromEnv());
try {await migrate(pool);console.log('Migration 001_accounts applied or already present.');}
catch {console.error('Migration failed. Check database access and migration-role privileges.');process.exitCode=1;}
finally {await pool.end();}
