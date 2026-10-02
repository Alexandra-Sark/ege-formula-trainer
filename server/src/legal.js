import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fail, record } from './security.js';

export function loadLegal(config) {
  const manifest = JSON.parse(readFileSync(join(config.legalDir, 'manifest.json'), 'utf8'));
  const documents = {};
  for (const type of ['terms','privacy','consent']) {
    const item = manifest.documents?.[type];
    if (!item) continue;
    if (!/^[a-z0-9._-]+\.html$/.test(item.file) || basename(item.file) !== item.file || !item.version)
      throw new Error('Invalid legal document manifest');
    const content = readFileSync(join(config.legalDir, item.file), 'utf8');
    const digest = createHash('sha256').update(content).digest('hex');
    if (item.sha256 !== digest) throw new Error('Legal document hash mismatch: ' + type);
    documents[type] = { version: item.version, sha256: digest, url: '/legal/' + type, content };
  }
  const operator = manifest.operator;
  const ready = manifest.accountsReady === true && ['terms','privacy','consent'].every(t => documents[t])
    && record(operator) && ['name','address','contact'].every(k => typeof operator[k] === 'string' && operator[k].trim().length > 3);
  if (config.enabled && !ready) throw new Error('Accounts need approved terms, privacy, consent and operator details');
  return {
    ready,
    documents,
    publicInfo() {
      return {accountsEnabled: config.enabled && ready,
        documents: Object.fromEntries(Object.entries(documents).map(([k,{content,...publicDocument}]) => [k,publicDocument]))};
    },
    verifyAccepted(value) {
      if (!record(value)) fail(400, 'CONSENTS_REQUIRED');
      for (const type of ['terms','consent']) {
        const item = value[type], actual = documents[type];
        if (!record(item) || item.accepted !== true) fail(400, 'CONSENTS_REQUIRED');
        if (item.version !== actual.version || item.sha256 !== actual.sha256) fail(409, 'LEGAL_DOCUMENT_CHANGED');
      }
      return Object.fromEntries(['terms','consent'].map(type => [type,{
        version: documents[type].version, sha256: documents[type].sha256
      }]));
    }
  };
}
