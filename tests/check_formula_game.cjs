const assert = require('node:assert/strict');
const {groups, formulas} = require('../formula-game-data.js');
const game = require('../formula-game.js');
const katex = require('../katex/katex.min.js');
const fs = require('node:fs');
assert.equal(formulas.length,72);
assert.equal(new Set(formulas.map(f=>f.id)).size,formulas.length);
assert.equal(new Set(formulas.map(f=>f.name)).size,formulas.length);
assert.equal(new Set(formulas.map(f=>f.tex)).size,formulas.length);
for (const card of formulas) {
  assert.ok(groups[card.group]);
  assert.equal(card.template.split('__').length,2,card.id);
  assert.equal(card.options.length,4,card.id);
  assert.equal(new Set(card.options).size,4,card.id);
  assert.equal(card.template.replace('__',card.answer),card.tex);
  for (const tex of [card.tex,card.template.replace('__',String.raw`\boxed{?}`),...card.options,card.condition].filter(Boolean)) {
    const html = katex.renderToString(tex,{throwOnError:true,strict:'ignore'});
    assert.ok(html.includes('katex-mathml'),card.id);
    assert.ok(!html.includes('katex-error'),card.id);
  }
}
for (const pool of [formulas,...Object.keys(groups).map(g=>formulas.filter(f=>f.group===g))]) {
  for (const mode of ['gap','match','mixed']) {
    for(let i=0;i<30;i++) {
      const rounds = game.buildRounds(pool,mode);
      assert.ok(rounds.length>0);
      const cards=rounds.flatMap(r=>r.cards);
      assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
      assert.ok(cards.every(c=>pool.includes(c)));
      assert.ok(rounds.every(r=>r.kind==='gap'?r.cards.length===1:r.cards.length>=2&&r.cards.length<=3));
      if(mode==='match')assert.ok(rounds.every(r=>r.kind==='match'));
      const s=game.createSession(rounds);
      for(const card of cards)assert.equal(game.recordAnswer(s,card.id,true),true);
      assert.equal(s.solved,cards.length);
      assert.equal(s.score,cards.length*10);
      assert.equal(s.bestStreak,cards.length);
    }
  }
}
assert.deepEqual(game.buildRounds([],'gap'),[]);
assert.deepEqual(game.buildRounds([],'match'),[]);
const rounds=game.buildRounds(formulas.slice(0,3),'gap');
const s=game.createSession(rounds),[a,b,c]=rounds.map(r=>r.cards[0].id);
assert.equal(game.recordAnswer(s,'unknown',true),false);
game.recordAnswer(s,a,true);
game.recordAnswer(s,b,false);game.recordAnswer(s,b,false);game.recordAnswer(s,b,true);
assert.equal(s.score,10);assert.equal(s.streak,0);assert.equal(s.answers[b].wrong,2);
assert.equal(game.recordAnswer(s,b,true),false);
game.recordAnswer(s,c,true);
assert.equal(s.solved,3);assert.equal(s.score,20);assert.equal(s.bestStreak,1);
s.finished=true;assert.equal(game.recordAnswer(s,a,false),false);
assert.deepEqual(game.normalizeHistory({games:-3,bestPercent:999,bestStreak:'4'}),{games:0,bestPercent:100,bestStreak:0});
assert.deepEqual(game.normalizeHistory(null),{games:0,bestPercent:0,bestStreak:0});
assert.ok(fs.readFileSync(require.resolve('../index.html'),'utf8').includes('id="formulaGameLink"'));
assert.notEqual(game.STORAGE_KEY,'egeUnifiedTrainerProgress1');
console.log('PASS: 72 formula records, all KaTeX expressions, distinct names/formulas, topic filtering, 810 random games, first-attempt scores, retries, duplicate clicks, streaks and independent storage.');
