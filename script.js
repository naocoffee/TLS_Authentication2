'use strict';

/* ==========================================================
   共通ユーティリティ
   ========================================================== */

// SHA-256ハッシュを16進文字列で返す（Web Crypto API使用）
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function el(id) { return document.getElementById(id); }

function renderStepProgress(container, total, current) {
  container.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < current) dot.classList.add('is-done');
    else if (i === current) dot.classList.add('is-current');
    container.appendChild(dot);
  }
}

function addLogEntry(panel, { no, title, body, tone }) {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (tone ? ` is-${tone}` : '');
  entry.innerHTML = `
    <div class="log-step-no">${no}</div>
    <div><h4>${title}</h4><p>${body}</p></div>
  `;
  panel.appendChild(entry);
  entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ==========================================================
   タブ切替
   ========================================================== */
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
      panels.forEach(p => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      el('panel-' + btn.dataset.tab).classList.add('is-active');
    });
  });
}

/* ==========================================================
   タブ1：全体の流れ（HTTP vs HTTPS）
   ========================================================== */
function initTab1() {
  const modeBtns = document.querySelectorAll('#panel-1 .mode-btn');
  const httpControls = el('t1-http-controls');
  const httpsControls = el('t1-https-controls');
  const packet = el('t1-packet');
  const attacker = el('t1-attacker');
  const peekBox = el('t1-peek');
  const peekLabel = el('t1-peek-label');
  const peekContent = el('t1-peek-content');
  const log = el('t1-log');
  const stepProgress = el('t1-step-progress');
  const nextBtn = el('t1-next-step');
  const resetBtn = el('t1-reset-steps');

  let mode = 'http';
  let httpSent = false;
  let httpsStep = -1; // -1 = 未開始

  const HTTPS_STEPS = [
    {
      title: '① Client Hello',
      body: 'クライアントが「対応できる暗号方式の一覧」と乱数Aをサーバーへ送る。まだ何も暗号化されていない、あいさつの段階。',
      dir: 'toServer', kind: 'plain', content: '対応暗号方式リスト + 乱数A',
    },
    {
      title: '② Server Hello・証明書の送付',
      body: 'サーバーが使用する暗号方式・乱数Bと、公開鍵の入った「サーバー証明書」を返す。',
      dir: 'toClient', kind: 'plain', content: 'サーバー証明書（公開鍵入り）+ 乱数B',
    },
    {
      title: '③ 証明書の検証',
      body: 'クライアントはブラウザに組み込まれた「CAの公開鍵」で証明書の署名を検証し、サーバーが本物であることを確認する（詳しくはタブ2）。',
      dir: 'none', kind: 'plain', content: '',
    },
    {
      title: '④ 改ざんの検知',
      body: '受け取った内容のハッシュ値を計算し、通信の途中で書き換えが起きていないかを確認する（詳しくはタブ3）。',
      dir: 'none', kind: 'plain', content: '',
    },
    {
      title: '⑤ 共通鍵のもとを鍵交換',
      body: 'クライアントが生成した「共通鍵のもと」を、検証済みのサーバー公開鍵で暗号化してから送る。盗聴者には暗号文にしか見えない。',
      dir: 'toServer', kind: 'cipher', content: '8f$aQ2#mZx9…（暗号化された共通鍵）',
    },
    {
      title: '⑥ 鍵交換完了の通知（Finished）',
      body: '両者が共通鍵を安全に共有できたことをお互いに確認し合う。',
      dir: 'toClient', kind: 'cipher', content: 'Finished（暗号化済み確認信号）',
    },
    {
      title: '⑦ 暗号化通信の開始',
      body: 'ここから先は高速な共通鍵暗号で本文をやり取りする。盗聴者が覗いても記号の羅列にしか見えない。',
      dir: 'toServer', kind: 'cipher', content: 'x8&Fq!93kLp…（暗号化された本文）',
    },
  ];

  function setMode(newMode) {
    mode = newMode;
    modeBtns.forEach(b => b.classList.toggle('is-active', b.dataset.mode === newMode));
    httpControls.hidden = newMode !== 'http';
    httpsControls.hidden = newMode !== 'https';
    packet.hidden = true;
    peekBox.hidden = true;
    log.innerHTML = '';
    httpSent = false;
    httpsStep = -1;
    el('t1-http-tamper').disabled = true;
    el('t1-http-status').textContent = '「送信する」を押すと、平文のままサーバーへ向かう。';
    nextBtn.textContent = '最初のステップへ進む';
    resetBtn.hidden = true;
    renderStepProgress(stepProgress, HTTPS_STEPS.length, -1);
    attacker.classList.remove('is-disabled');
  }

  modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // --- HTTPモード ---
  el('t1-http-send').addEventListener('click', () => {
    packet.hidden = false;
    packet.className = 'packet is-plain';
    packet.textContent = 'ID: taro / PW: 123456';
    packet.style.left = '8%';
    requestAnimationFrame(() => { packet.style.left = '92%'; });
    httpSent = true;
    peekBox.hidden = true;
    el('t1-http-tamper').disabled = false;
    el('t1-http-status').textContent = 'サーバーに平文のまま届いた。盗聴者アイコンをクリックして、通信路の様子を覗いてみよう。';
    log.innerHTML = '';
    addLogEntry(log, { no: '!', title: '暗号化なしで送信', body: 'ログイン情報がそのままの文字列で流れている。', tone: 'danger' });
  });

  el('t1-http-tamper').addEventListener('click', () => {
    packet.textContent = 'ID: taro / PW: HACKED!!';
    packet.classList.add('is-atrest');
    addLogEntry(log, {
      no: '!!', title: '盗聴者がデータを書き換えた', tone: 'danger',
      body: 'HTTPには改ざんを検知するしくみがないため、サーバーは書き換えに気づかず受け取ってしまう。',
    });
    el('t1-http-tamper').disabled = true;
  });

  attacker.addEventListener('click', () => {
    if (mode === 'http') {
      if (!httpSent) return;
      peekBox.hidden = false;
      peekBox.className = 'peek-box is-danger';
      peekLabel.textContent = '盗聴者に見えているデータ（丸見え）';
      peekContent.textContent = packet.textContent;
    } else {
      if (httpsStep < 0) return;
      const step = HTTPS_STEPS[httpsStep];
      peekBox.hidden = false;
      if (step.kind === 'cipher') {
        peekBox.className = 'peek-box is-safe';
        peekLabel.textContent = '盗聴者に見えているデータ（暗号文・解読不能）';
        peekContent.textContent = step.content || '（このステップでは通信路にデータは流れていない）';
      } else {
        peekBox.className = 'peek-box';
        peekLabel.textContent = '盗聴者に見えているデータ';
        peekContent.textContent = step.content || '（このステップでは通信路にデータは流れていない。クライアント内部の処理）';
      }
    }
  });

  // --- HTTPSモード ---
  function playStep(index) {
    const step = HTTPS_STEPS[index];
    peekBox.hidden = true;

    if (step.dir === 'none') {
      packet.hidden = true;
    } else {
      packet.hidden = false;
      packet.classList.remove('is-atrest');
      packet.className = 'packet ' + (step.kind === 'cipher' ? 'is-cipher' : 'is-plain');
      packet.textContent = step.content;
      if (step.dir === 'toServer') {
        packet.style.transition = 'none';
        packet.style.left = '8%';
        packet.offsetHeight; // reflow
        packet.style.transition = '';
        requestAnimationFrame(() => { packet.style.left = '92%'; });
      } else {
        packet.style.transition = 'none';
        packet.style.left = '92%';
        packet.offsetHeight;
        packet.style.transition = '';
        requestAnimationFrame(() => { packet.style.left = '8%'; });
      }
    }

    addLogEntry(log, { no: index + 1, title: step.title, body: step.body });
    renderStepProgress(stepProgress, HTTPS_STEPS.length, index);
  }

  nextBtn.addEventListener('click', () => {
    if (httpsStep >= HTTPS_STEPS.length - 1) return;
    httpsStep++;
    playStep(httpsStep);
    if (httpsStep === HTTPS_STEPS.length - 1) {
      nextBtn.hidden = true;
      resetBtn.hidden = false;
    } else {
      nextBtn.textContent = '次のステップへ（' + (httpsStep + 2) + ' / ' + HTTPS_STEPS.length + '）';
    }
  });

  resetBtn.addEventListener('click', () => {
    httpsStep = -1;
    packet.hidden = true;
    peekBox.hidden = true;
    log.innerHTML = '';
    nextBtn.hidden = false;
    resetBtn.hidden = true;
    nextBtn.textContent = '最初のステップへ進む';
    renderStepProgress(stepProgress, HTTPS_STEPS.length, -1);
  });

  setMode('http');
}

/* ==========================================================
   タブ2：証明書と検証
   ========================================================== */
function initTab2() {
  const kindBtns = document.querySelectorAll('#panel-2 .mode-switch .mode-btn');
  const issueBtn = el('t2-issue');
  const presentBtn = el('t2-present');
  const verifyBtn = el('t2-verify');
  const certEl = el('t2-certificate');
  const domainEl = el('t2-domain');
  const pubkeyEl = el('t2-pubkey');
  const sigEl = el('t2-signature');
  const resultEl = el('t2-result');
  const serverLabel = el('t2-server-label');
  const browser = el('t2-browser');
  const browserLock = el('t2-browser-lock');
  const browserUrl = el('t2-browser-url');
  const log = el('t2-log');

  let serverKind = 'real';
  let certContent = null;
  let certSignature = null;

  function reset() {
    certEl.hidden = true;
    certEl.classList.remove('is-forged');
    presentBtn.disabled = true;
    verifyBtn.disabled = true;
    resultEl.hidden = true;
    browser.className = 'browser-mock';
    browserLock.textContent = '🔒';
    browserUrl.style.textDecoration = 'none';
    log.innerHTML = '';
    certContent = null;
    certSignature = null;
    serverLabel.textContent = serverKind === 'real' ? 'Webサーバー（正規）' : 'なりすましサーバー';
    domainEl.textContent = 'example-shop.jp';
    browserUrl.textContent = 'example-shop.jp';
  }

  kindBtns.forEach(b => b.addEventListener('click', () => {
    kindBtns.forEach(x => x.classList.toggle('is-active', x === b));
    serverKind = b.dataset.serverKind;
    reset();
  }));

  issueBtn.addEventListener('click', async () => {
    const domain = 'example-shop.jp';
    const pubkey = 'PubKey-' + Math.random().toString(16).slice(2, 10);

    if (serverKind === 'real') {
      // 正規：CAが本物のドメイン・公開鍵に対して署名する
      certContent = `${domain}|${pubkey}`;
      certSignature = 'CAsig-' + (await sha256Hex('CA_SECRET|' + certContent)).slice(0, 24);
      addLogEntry(log, { no: '✓', title: 'CAが審査のうえ証明書を発行', body: 'ドメインと公開鍵の組み合わせに対して、CAの秘密鍵で署名した。' });
    } else {
      // なりすまし：攻撃者はCAの秘密鍵を持っていないので、正規の署名は作れない
      certContent = `${domain}|${pubkey}`;
      certSignature = 'CAsig-' + Math.random().toString(16).slice(2, 26); // でたらめな署名
      addLogEntry(log, { no: '!', title: 'なりすまし側が「自称・証明書」を用意', tone: 'danger', body: 'CAの秘密鍵を持っていないため、本物そっくりの署名は作れない。それらしい文字列を並べるしかない。' });
    }

    domainEl.textContent = domain;
    pubkeyEl.textContent = pubkey;
    sigEl.textContent = certSignature;
    certEl.hidden = false;
    certEl.classList.toggle('is-forged', serverKind === 'fake');
    presentBtn.disabled = false;
  });

  presentBtn.addEventListener('click', () => {
    verifyBtn.disabled = false;
    addLogEntry(log, { no: '→', title: 'サーバーが証明書をクライアントに提示', body: '接続時、サーバーはこの証明書をそのままクライアントへ送ってくる。' });
  });

  verifyBtn.addEventListener('click', async () => {
    const expectedSig = 'CAsig-' + (await sha256Hex('CA_SECRET|' + certContent)).slice(0, 24);
    const isValid = expectedSig === certSignature;

    resultEl.hidden = false;
    browser.classList.add('is-active');

    if (isValid) {
      resultEl.className = 'verify-result is-ok';
      resultEl.innerHTML = '✅ 署名が一致しました。この証明書は信頼できます。<p>CAの公開鍵で署名を検証した結果、証明書の内容と一致した。安心して公開鍵を使ってよい。</p>';
      browser.classList.add('is-safe');
      browser.classList.remove('is-danger');
      browserLock.textContent = '🔒';
      browserUrl.style.textDecoration = 'none';
      addLogEntry(log, { no: '✓', title: '検証成功', body: 'この公開鍵は確かにexample-shop.jp本人のものだと確認できた。' });
    } else {
      resultEl.className = 'verify-result is-fail';
      resultEl.innerHTML = '⚠️ 署名が一致しません。証明書は信頼できません。<p>CAの公開鍵で検証しても、署名がでたらめなため照合結果が合わない。ブラウザは接続を警告する。</p>';
      browser.classList.add('is-danger');
      browser.classList.remove('is-safe');
      browserLock.textContent = '⚠️';
      browserUrl.style.textDecoration = 'line-through';
      addLogEntry(log, { no: '✗', title: '検証失敗（なりすまし検知）', tone: 'danger', body: 'ブラウザは「この接続は安全ではありません」と警告し、通信を止めるべきだと判断する。' });
    }
  });

  kindBtns[0].classList.add('is-active');
  reset();
}

/* ==========================================================
   タブ3：改ざんの検知（ハッシュ）
   ========================================================== */
function initTab3() {
  const liveInput = el('t3-input');
  const liveHash = el('t3-hash-live');

  async function updateLiveHash() {
    liveHash.textContent = await sha256Hex(liveInput.value);
  }
  liveInput.addEventListener('input', updateLiveHash);
  updateLiveHash();

  const originalInput = el('t3-original');
  const lockBtn = el('t3-lock');
  const sentHashEl = el('t3-sent-hash');
  const transitStep = el('t3-transit-step');
  const transitInput = el('t3-transit');
  const verifyStep = el('t3-verify-step');
  const checkBtn = el('t3-check');
  const receivedHashEl = el('t3-received-hash');
  const resultEl = el('t3-result');
  const resetBtn = el('t3-reset');

  let sentHash = '';

  lockBtn.addEventListener('click', async () => {
    sentHash = await sha256Hex(originalInput.value);
    sentHashEl.textContent = '送信時のハッシュ値： ' + sentHash;
    originalInput.disabled = true;
    lockBtn.disabled = true;
    transitInput.value = originalInput.value;
    transitStep.hidden = false;
    verifyStep.hidden = false;
    resetBtn.hidden = false;
  });

  checkBtn.addEventListener('click', async () => {
    const receivedHash = await sha256Hex(transitInput.value);
    receivedHashEl.textContent = '受信データから再計算したハッシュ値： ' + receivedHash;
    resultEl.hidden = false;
    if (receivedHash === sentHash) {
      resultEl.className = 'verify-result is-ok';
      resultEl.innerHTML = '✅ ハッシュ値が一致。データは改ざんされていません。';
    } else {
      resultEl.className = 'verify-result is-fail';
      resultEl.innerHTML = '⚠️ ハッシュ値が不一致。通信の途中でデータが書き換えられています。';
    }
  });

  resetBtn.addEventListener('click', () => {
    originalInput.disabled = false;
    lockBtn.disabled = false;
    sentHashEl.textContent = '';
    transitStep.hidden = true;
    verifyStep.hidden = true;
    resultEl.hidden = true;
    resetBtn.hidden = true;
  });
}

/* ==========================================================
   タブ4：鍵交換のしくみ
   ========================================================== */
function initTab4() {
  const runSpeedBtn = el('t4-run-speed');
  const barSlow = el('t4-bar-slow');
  const barFast = el('t4-bar-fast');
  const timeSlow = el('t4-time-slow');
  const timeFast = el('t4-time-fast');

  runSpeedBtn.addEventListener('click', () => {
    barSlow.style.width = '0%';
    barFast.style.width = '0%';
    timeSlow.textContent = '計測中…';
    timeFast.textContent = '計測中…';
    requestAnimationFrame(() => {
      barSlow.style.width = '92%';
      barFast.style.width = '8%';
    });
    setTimeout(() => { timeFast.textContent = '共通鍵暗号：あっという間に完了（イメージ）'; }, 700);
    setTimeout(() => { timeSlow.textContent = '公開鍵暗号：数十〜百倍以上の時間がかかる（イメージ）'; }, 2500);
  });

  const safeBox = el('t4-safebox');
  const keyClient = el('t4-key-client');
  const keyAttacker = el('t4-key-attacker');
  const keyServer = el('t4-key-server');
  const log = el('t4-log');
  const stepProgress = el('t4-step-progress');
  const nextBtn = el('t4-next-step');
  const resetBtn = el('t4-reset-steps');

  const STEPS = [
    {
      title: '① クライアントが共通鍵のもとを生成',
      body: 'この通信だけで使う「共通鍵（セッションキー）」をランダムに作る。まだ誰にも渡していない。',
      run() { keyClient.textContent = '🔑'; },
    },
    {
      title: '② サーバーの公開鍵で施錠して送信',
      body: '検証済みのサーバー公開鍵＝「誰でも施錠できるが、サーバーの秘密鍵でしか開けられない金庫」に共通鍵を入れて送る。',
      run() {
        safeBox.hidden = false;
        safeBox.style.transition = 'none';
        safeBox.style.left = '8%';
        safeBox.offsetHeight;
        safeBox.style.transition = '';
        requestAnimationFrame(() => { safeBox.style.left = '92%'; });
      },
    },
    {
      title: '③ 盗聴者が金庫を覗こうとするが開けられない',
      body: '盗聴者はこの金庫を手にしても、サーバーの秘密鍵を持っていないので開けられない。中の共通鍵は見えないまま。',
      run() { keyAttacker.textContent = '🔒'; },
    },
    {
      title: '④ サーバーが秘密鍵で開錠',
      body: 'サーバーだけが持つ秘密鍵で金庫を開け、中から共通鍵を取り出す。これでクライアントとサーバーだけが同じ鍵を共有した。',
      run() { keyServer.textContent = '🔑'; },
    },
    {
      title: '⑤ 鍵交換完了、共通鍵暗号での通信へ',
      body: '双方が同じ共通鍵を持てたので、これ以降は高速な共通鍵暗号でデータをやり取りする。',
      run() { keyClient.textContent = '🔑✅'; keyServer.textContent = '🔑✅'; },
    },
  ];

  let step = -1;

  function playStep(index) {
    const s = STEPS[index];
    s.run();
    addLogEntry(log, { no: index + 1, title: s.title, body: s.body });
    renderStepProgress(stepProgress, STEPS.length, index);
  }

  nextBtn.addEventListener('click', () => {
    if (step >= STEPS.length - 1) return;
    step++;
    playStep(step);
    if (step === STEPS.length - 1) {
      nextBtn.hidden = true;
      resetBtn.hidden = false;
    } else {
      nextBtn.textContent = '次のステップへ（' + (step + 2) + ' / ' + STEPS.length + '）';
    }
  });

  resetBtn.addEventListener('click', () => {
    step = -1;
    safeBox.hidden = true;
    keyClient.textContent = '';
    keyAttacker.textContent = '';
    keyServer.textContent = '';
    log.innerHTML = '';
    nextBtn.hidden = false;
    resetBtn.hidden = true;
    nextBtn.textContent = '鍵交換を始める';
    renderStepProgress(stepProgress, STEPS.length, -1);
  });

  renderStepProgress(stepProgress, STEPS.length, -1);
}

/* ==========================================================
   初期化
   ========================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTab1();
  initTab2();
  initTab3();
  initTab4();
});
