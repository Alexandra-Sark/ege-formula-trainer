(function (root) {
  'use strict';
  const STORAGE_KEY = 'egeFormulaGameProgress1';
  function shuffled(values, random = Math.random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function buildRounds(pool, mode, random = Math.random) {
    const cards = shuffled(pool, random).slice(0, mode === 'gap' ? 10 : 12);
    if (mode === 'gap') return cards.map(card => ({kind:'gap', cards:[card]}));
    if (mode === 'match') {
      const rounds = [];
      for (let i = 0; i + 2 < cards.length; i += 3) rounds.push({kind:'match', cards:cards.slice(i, i + 3)});
      return rounds;
    }
    const rounds = [];
    for (let i = 0; i < cards.length;) {
      const size = rounds.length % 2 === 1 && cards.length - i >= 2 ? Math.min(3, cards.length - i) : 1;
      rounds.push({kind:size === 1 ? 'gap' : 'match', cards:cards.slice(i, i + size)});
      i += size;
    }
    return rounds;
  }
  function createSession(rounds) {
    return {rounds, index:0, score:0, streak:0, bestStreak:0, solved:0, finished:false,
      answers:Object.fromEntries(rounds.flatMap(r => r.cards).map(card => [card.id,{done:false, clean:true, wrong:0}]))};
  }
  function recordAnswer(session, id, correct) {
    const answer = session.answers[id];
    if (!answer || answer.done || session.finished) return false;
    if (!correct) {
      answer.clean = false;
      answer.wrong++;
      session.streak = 0;
      return true;
    }
    answer.done = true;
    session.solved++;
    if (answer.clean) {
      session.score += 10;
      session.streak++;
      session.bestStreak = Math.max(session.bestStreak, session.streak);
    } else session.streak = 0;
    return true;
  }
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  function normalizeHistory(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {games:count(raw.games), bestPercent:Math.min(100,count(raw.bestPercent)), bestStreak:count(raw.bestStreak)};
  }
  const api = {STORAGE_KEY, shuffled, buildRounds, createSession, recordAnswer, normalizeHistory};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;

  const {groups, formulas} = root.FormulaGameData;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function math(tex, display = false) {
    if (!root.katex) return `<span class="math-fallback">${esc(tex)}</span>`;
    return root.katex.renderToString(tex, {displayMode:display, throwOnError:true, strict:'ignore', trust:false});
  }
  const modeLabels = {gap:'Заполни формулу', match:'Найди пару', mixed:'Микс'};
  let session = null;
  let currentMode = 'gap';
  let currentPool = formulas;
  let selected = {name:null, formula:null};
  let missed = [];
  function show(id) {
    for (const screen of ['setup','play','results']) $(screen).hidden = screen !== id;
  }
  function history() {
    try { return normalizeHistory(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return normalizeHistory(null); }
  }
  function updateBest() {
    const h = history();
    $('personalBest').textContent = h.games ? `Завершено игр: ${h.games} · Лучший результат: ${h.bestPercent}%` : 'Первая игра? Попробуй короткий раунд!';
  }
  function selectedPool() {
    const selectedGroups = new Set([...document.querySelectorAll('#topicChoices input:checked')].map(el => el.value));
    return formulas.filter(card => selectedGroups.has(card.group));
  }
  function selectedMode() { return document.querySelector('[name="gameMode"]:checked').value; }
  function updateSetup() {
    const pool = selectedPool(), mode = selectedMode(), rounds = buildRounds(pool, mode);
    const total = rounds.flatMap(r => r.cards).length;
    $('roundDescription').textContent = pool.length ? `${modeLabels[mode]}: раундов — ${rounds.length}, формул — ${total}. Формул в выбранных темах: ${pool.length}.` : 'Выбери хотя бы одну тему.';
    $('startGame').disabled = !total;
    $('setupError').textContent = '';
    $('selectAll').textContent = pool.length === formulas.length ? 'Снять выбор тем' : 'Выбрать все темы';
    updateBest();
  }
  function updateScore() {
    $('score').textContent = session.score;
    $('streak').textContent = session.streak;
    const total = Object.keys(session.answers).length;
    $('solved').textContent = `${session.solved} / ${total}`;
    $('gameProgress').max = total;
    $('gameProgress').value = session.solved;
  }
  function feedback(message, good) {
    $('feedback').textContent = message;
    $('feedback').className = 'feedback ' + (good ? 'good' : 'bad');
  }
  function roundComplete() {
    const complete = session.rounds[session.index].cards.every(card => session.answers[card.id].done);
    $('nextRound').hidden = !complete;
    if (complete) {
      $('nextRound').textContent = session.index === session.rounds.length - 1 ? 'Показать результат' : 'Дальше →';
      $('nextRound').focus();
    }
  }
  function renderGap(card) {
    const options = shuffled(card.options);
    $('gameBoard').innerHTML = `<div class="formula-card"><div class="formula-name">${esc(card.name)}</div><div class="formula">${math(card.template.replace('__',String.raw`\boxed{?}`),true)}</div>${card.condition ? `<div class="condition">${math(card.condition)}</div>` : ''}</div><div class="options">${options.map((tex,i) => `<button class="answer" type="button" data-option="${i}">${math(tex)}</button>`).join('')}</div>`;
    for (const button of $('gameBoard').querySelectorAll('[data-option]')) {
      button.addEventListener('click', () => {
        const correct = options[Number(button.dataset.option)] === card.answer;
        if (!recordAnswer(session,card.id,correct)) return;
        button.classList.add(correct ? 'correct' : 'wrong');
        button.disabled = true;
        if (correct) {
          for (const other of $('gameBoard').querySelectorAll('.answer')) other.disabled = true;
          $('gameBoard').querySelector('.formula').innerHTML = math(card.tex,true);
          feedback(session.answers[card.id].clean ? 'Верно! +10 очков.' : 'Теперь верно! Формула восстановлена.',true);
        } else {
          button.setAttribute('aria-label','Неверный вариант');
          feedback('Пока неверно. Выбери другой элемент формулы.',false);
        }
        updateScore(); roundComplete();
      });
    }
  }
  function renderMatch(cards) {
    selected = {name:null,formula:null};
    $('gameBoard').innerHTML = `<div class="matching"><div class="pair-column"><span class="column-label">Названия</span>${shuffled(cards).map(card => `<button type="button" class="pair" data-name="${card.id}" aria-pressed="false">${esc(card.name)}</button>`).join('')}</div><div class="pair-column"><span class="column-label">Формулы</span>${shuffled(cards).map(card => `<button type="button" class="pair formula-pair" data-formula="${card.id}" aria-pressed="false">${math(card.tex)}${card.condition ? `<span class="condition">${math(card.condition)}</span>` : ''}</button>`).join('')}</div></div>`;
    for (const button of $('gameBoard').querySelectorAll('.pair')) {
      button.addEventListener('click', () => {
        const side = button.dataset.name ? 'name' : 'formula';
        selected[side] = selected[side] === button ? null : button;
        for (const other of $('gameBoard').querySelectorAll(`[data-${side}]`)) {
          const active = selected[side] === other;
          other.classList.toggle('selected',active);
          other.setAttribute('aria-pressed',String(active));
        }
        if (!selected.name || !selected.formula) return;
        const id = selected.name.dataset.name;
        const correct = id === selected.formula.dataset.formula;
        if (!recordAnswer(session,id,correct)) return;
        for (const chosen of [selected.name,selected.formula]) {
          chosen.classList.remove('selected');
          chosen.setAttribute('aria-pressed','false');
          if (correct) {chosen.classList.add('matched');chosen.disabled = true;}
        }
        const label = cards.find(card => card.id === id).name;
        feedback(correct ? `${label}: пара найдена!${session.answers[id].clean ? ' +10 очков.' : ''}` : `${label}: эта запись не подходит. Попробуй другую пару.`,correct);
        selected = {name:null,formula:null};
        updateScore(); roundComplete();
      });
    }
  }
  function renderRound() {
    show('play');
    const round = session.rounds[session.index];
    $('roundCounter').textContent = `Раунд ${session.index + 1} из ${session.rounds.length}`;
    $('playTitle').textContent = round.kind === 'gap' ? 'Какого элемента не хватает?' : 'Собери пары';
    $('playInstruction').textContent = round.kind === 'gap' ? 'Выбери элемент, который восстановит верную формулу.' : 'Нажми на название, затем на соответствующую формулу. Можно начать с любой колонки.';
    $('feedback').textContent = '';
    $('feedback').className = 'feedback';
    $('nextRound').hidden = true;
    if (round.kind === 'gap') renderGap(round.cards[0]); else renderMatch(round.cards);
    updateScore();
    $('playTitle').focus();
  }
  function start(pool = selectedPool(), mode = selectedMode()) {
    if (!root.katex) {
      show('setup');
      $('setupError').textContent = 'Формулы не загрузились. Обнови страницу и попробуй ещё раз.';
      return;
    }
    const rounds = buildRounds(pool,mode);
    if (!rounds.length) return;
    currentPool = pool;
    currentMode = mode;
    session = createSession(rounds);
    renderRound();
  }
  function finish() {
    if (!session || session.finished) return;
    session.finished = true;
    const total = Object.keys(session.answers).length;
    const firstCorrect = Object.values(session.answers).filter(a => a.clean && a.done).length;
    const percent = Math.round(100 * firstCorrect / total);
    missed = session.rounds.flatMap(r => r.cards).filter(card => !session.answers[card.id].clean);
    show('results');
    $('resultsTitle').textContent = percent === 100 ? 'Все формулы узнаны!' : percent >= 70 ? 'Хорошая тренировка!' : 'Формулы стали ближе!';
    $('resultMessage').textContent = `С первой попытки: ${firstCorrect} из ${total}. Все ${total} формул пройдены; к тем, где были ошибки, можно вернуться ещё раз.`;
    $('resultStats').innerHTML = `<div class="result-stat">Очки<strong>${session.score} / ${total * 10}</strong></div><div class="result-stat">С первой попытки<strong>${percent}%</strong></div><div class="result-stat">Лучшая серия<strong>${session.bestStreak}</strong></div>`;
    const weakGroups = [...new Set(missed.map(card => card.group))];
    $('reviewList').innerHTML = missed.length ? `<div class="review"><h3>Что стоит повторить</h3><p class="muted">${weakGroups.map(group => esc(groups[group])).join(' · ')}</p><ul>${missed.map(card => `<li>${esc(card.name)}</li>`).join('')}</ul></div>` : `<div class="review"><p>В этой игре ты узнал(а) каждую формулу с первой попытки. Попробуй другую тему или режим!</p></div>`;
    $('repeatMissed').hidden = !missed.length;
    const h = history();
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({games:h.games + 1,bestPercent:Math.max(h.bestPercent,percent),bestStreak:Math.max(h.bestStreak,session.bestStreak)}));
      $('saveNotice').textContent = 'Результат сохранён в этом браузере. На другое устройство он автоматически не переносится.';
    } catch {
      $('saveNotice').textContent = 'Браузер не разрешил сохранить результат. Играть можно, но рекорд после закрытия страницы не сохранится.';
    }
    $('resultsTitle').focus();
  }
  $('topicChoices').innerHTML = Object.entries(groups).map(([key,title]) => `<label class="topic"><input type="checkbox" value="${key}" checked><span>${esc(title)}</span></label>`).join('');
  $('topicChoices').addEventListener('change',updateSetup);
  document.querySelector('.mode-picker').addEventListener('change',updateSetup);
  $('selectAll').addEventListener('click', () => {
    const select = selectedPool().length !== formulas.length;
    for (const input of $('topicChoices').querySelectorAll('input')) input.checked = select;
    updateSetup();
  });
  $('startGame').addEventListener('click', () => start());
  $('nextRound').addEventListener('click', () => {
    if (!session || session.finished || !session.rounds[session.index].cards.every(card => session.answers[card.id].done)) return;
    if (session.index === session.rounds.length - 1) finish();
    else { session.index++; renderRound(); }
  });
  $('leaveGame').addEventListener('click', () => {
    if (root.confirm('Завершить игру? Результат незаконченной игры не сохраняется.')) {session = null;show('setup');updateSetup();$('setupTitle').setAttribute('tabindex','-1');$('setupTitle').focus();}
  });
  $('playAgain').addEventListener('click', () => start(currentPool,currentMode));
  $('repeatMissed').addEventListener('click', () => start(missed,'gap'));
  $('changeGame').addEventListener('click', () => {show('setup');updateSetup();$('startGame').focus();});
  updateSetup();
})(typeof globalThis !== 'undefined' ? globalThis : this);
