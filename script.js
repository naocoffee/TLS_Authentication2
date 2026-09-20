(() => {
  "use strict";

  /* ---------------------------------------------------------
     Data model
  --------------------------------------------------------- */

  const STEPS = [
    {
      id: "connect",
      label: "接続要求",
      sub: "Client Hello",
      actor: "client",
      desc: "クライアントがサーバーに「接続したい」と伝える最初のリクエスト。使える暗号方式の候補なども一緒に送る。"
    },
    {
      id: "cert",
      label: "証明書送付",
      sub: "Certificate",
      actor: "server",
      desc: "サーバーが自分の身元を示す「デジタル証明書」をクライアントに送付する。"
    },
    {
      id: "verify",
      label: "サーバー認証",
      sub: "Verify Certificate",
      actor: "client",
      desc: "クライアントが証明書の署名や発行元（認証局）を確認し、本物のサーバーかどうかを検証する。"
    },
    {
      id: "keyshare",
      label: "共通鍵の共有",
      sub: "Key Exchange",
      actor: "client",
      desc: "クライアントが共通鍵のもとになる情報を、サーバーの公開鍵で暗号化して送信する（簡略化した鍵交換モデル）。"
    },
    {
      id: "encrypt",
      label: "暗号化通信の開始",
      sub: "Finished",
      actor: "server",
      desc: "サーバーが準備完了を伝え、共有した鍵を使って実際のデータを暗号化したやり取りが始まる。"
    }
  ];

  const STEP_MAP = Object.fromEntries(STEPS.map(s => [s.id, s]));
  const CORRECT_ORDER = STEPS.map(s => s.id);
  const ROLE_LABEL = { client: "クライアント", server: "サーバー" };

  /* ---------------------------------------------------------
     State
  --------------------------------------------------------- */

  let trayItems = [];
  let slotState = [null, null, null, null, null];
  let actorState = [null, null, null, null, null];
  let selectedCard = null;

  /* ---------------------------------------------------------
     DOM refs
  --------------------------------------------------------- */

  const trayEl = document.getElementById("tray");
  const slotsEl = document.getElementById("slots");
  const checkBtn = document.getElementById("checkBtn");
  const resetBtn = document.getElementById("resetBtn");
  const intelEl = document.getElementById("intel");
  const reportEl = document.getElementById("reportArea");
  const statusChip = document.getElementById("statusChip");
  const wireActive = document.getElementById("wireActive");
  const packetEl = document.getElementById("packet");
  const attackerEl = document.getElementById("attacker");
  const attackerTag = document.getElementById("attackerTag");
  const lockEl = document.getElementById("lock");

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function init() {
    trayItems = shuffled(CORRECT_ORDER);
    slotState = [null, null, null, null, null];
    actorState = [null, null, null, null, null];
    selectedCard = null;
    renderIntel();
    renderAll();
    resetDiagram();
  }

  function renderIntel() {
    intelEl.innerHTML = "";
    STEPS.forEach((s, i) => {
      const div = document.createElement("div");
      div.className = "intel-card";
      div.innerHTML = `
        <span class="intel-label">${i + 1}. ${s.label}</span>
        <span class="intel-sub">${s.sub}</span>
        <span class="intel-actor role-${s.actor}">実行者: ${ROLE_LABEL[s.actor]}</span>
        <p>${s.desc}</p>
      `;
      intelEl.appendChild(div);
    });
  }

  /* ---------------------------------------------------------
     Rendering
  --------------------------------------------------------- */

  function makeCardEl(id, context) {
    const step = STEP_MAP[id];
    const el = document.createElement(context === "slot" ? "div" : "li");
    el.className = "card";
    el.setAttribute("draggable", "true");
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.dataset.id = id;
    if (id === selectedCard) el.classList.add("selected");
    el.innerHTML = `
      <span class="card-label">${step.label}</span>
      <span class="card-sub">${step.sub}</span>
    `;
    el.setAttribute(
      "aria-label",
      context === "slot"
        ? `${step.label}。タップで枠から取り出す`
        : `${step.label}。タップして選択`
    );

    el.addEventListener("click", () => onCardClick(id, context, el));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onCardClick(id, context, el);
      }
    });
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    return el;
  }

  function renderTray() {
    trayEl.innerHTML = "";
    trayItems.forEach((id) => {
      trayEl.appendChild(makeCardEl(id, "tray"));
    });
  }

  function renderSlots() {
    slotsEl.innerHTML = "";
    slotState.forEach((id, i) => {
      const li = document.createElement("li");
      li.className = "slot" + (id ? " filled" : "");
      li.dataset.index = String(i);
      li.setAttribute("data-index", String(i + 1));
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      li.setAttribute(
        "aria-label",
        id ? `枠${i + 1}：${STEP_MAP[id].label}` : `枠${i + 1}：空き`
      );

      if (id) {
        li.appendChild(makeCardEl(id, "slot"));
        li.appendChild(makeActorToggle(i));
      } else {
        const ph = document.createElement("div");
        ph.className = "slot-placeholder";
        ph.textContent = "ここに配置";
        li.appendChild(ph);
      }

      li.addEventListener("click", (e) => {
        if (e.target.closest(".card")) return; // handled by card click
        onSlotClick(i);
      });
      li.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === li) {
          e.preventDefault();
          onSlotClick(i);
        }
      });
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        li.classList.add("drag-over");
      });
      li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        li.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        if (id) placeCard(id, i);
      });

      slotsEl.appendChild(li);
    });
  }

  function makeActorToggle(slotIndex) {
    const wrap = document.createElement("div");
    wrap.className = "actor-toggle";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", `枠${slotIndex + 1}の実行者を選択`);

    ["client", "server"].forEach((role) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "actor-btn role-" + role;
      btn.textContent = ROLE_LABEL[role];
      if (actorState[slotIndex] === role) btn.classList.add("active");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        actorState[slotIndex] = role;
        onArrangementChanged();
      });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  function renderAll() {
    renderTray();
    renderSlots();
    checkBtn.disabled =
      slotState.some((s) => s === null) || actorState.some((a) => a === null);
  }

  /* ---------------------------------------------------------
     Interaction
  --------------------------------------------------------- */

  function onCardClick(id, context, el) {
    if (context === "slot") {
      const idx = slotState.indexOf(id);
      if (selectedCard && selectedCard !== id) {
        placeCard(selectedCard, idx);
      } else {
        returnToTray(idx);
      }
      return;
    }
    // tray card
    selectedCard = selectedCard === id ? null : id;
    renderAll();
  }

  function onSlotClick(index) {
    if (selectedCard) {
      placeCard(selectedCard, index);
    } else if (slotState[index]) {
      returnToTray(index);
    }
  }

  function placeCard(id, slotIndex) {
    const bumped = slotState[slotIndex];
    const trayIdx = trayItems.indexOf(id);
    const slotIdx = slotState.indexOf(id);

    if (trayIdx !== -1) trayItems.splice(trayIdx, 1);
    if (slotIdx !== -1) {
      slotState[slotIdx] = null;
      actorState[slotIdx] = null;
    }

    if (bumped && bumped !== id) trayItems.push(bumped);

    slotState[slotIndex] = id;
    actorState[slotIndex] = null;
    selectedCard = null;
    onArrangementChanged();
  }

  function returnToTray(slotIndex) {
    const id = slotState[slotIndex];
    if (!id) return;
    slotState[slotIndex] = null;
    actorState[slotIndex] = null;
    trayItems.push(id);
    selectedCard = null;
    onArrangementChanged();
  }

  function onArrangementChanged() {
    renderAll();
    resetDiagram();
    reportEl.innerHTML = "";
  }

  /* ---------------------------------------------------------
     Rule engine
  --------------------------------------------------------- */

  function posOf(id) {
    return slotState.indexOf(id);
  }

  function evaluate() {
    const violations = [];

    if (slotState[0] !== "connect") {
      violations.push({
        tag: "手順エラー",
        title: "「接続要求」が最初になっていない",
        desc:
          "そもそもクライアントからの接続要求がなければ通信は始まらない。手順①は必ず最初に置く必要がある。",
        slots: [0]
      });
    }

    if (posOf("cert") > posOf("verify")) {
      violations.push({
        tag: "なりすまし",
        title: "証明書を確認する前に先へ進んでいる",
        desc:
          "「証明書送付」より先に「サーバー認証」を済ませてしまうと、実際には届いていない証明書を検証したことになる。攻撃者が偽の証明書を送りつけ、本物のサーバーになりすませる隙が生まれる。",
        slots: [posOf("cert"), posOf("verify")]
      });
    }

    if (posOf("verify") > posOf("keyshare")) {
      violations.push({
        tag: "なりすまし",
        title: "サーバー認証の前に鍵交換をしている",
        desc:
          "証明書を検証する前に共通鍵を共有すると、相手が本物のサーバーかどうか確かめないまま鍵を渡すことになる。中間者（攻撃者）が本物のサーバーになりすまし、鍵をだまし取れてしまう。",
        slots: [posOf("verify"), posOf("keyshare")]
      });
    }

    if (posOf("keyshare") > posOf("encrypt")) {
      violations.push({
        tag: "盗聴",
        title: "鍵を共有する前に暗号化通信を始めている",
        desc:
          "共通鍵ができあがる前にデータのやり取りを始めると、そのデータは暗号化されず平文のまま流れてしまう。通信を見ている第三者にそのまま盗聴されてしまう。",
        slots: [posOf("keyshare"), posOf("encrypt")]
      });
    }

    return violations;
  }

  function evaluateActors() {
    const violations = [];
    slotState.forEach((id, i) => {
      const correct = STEP_MAP[id].actor;
      const chosen = actorState[i];
      if (chosen !== correct) {
        violations.push({
          tag: "役割エラー",
          title: `「${STEP_MAP[id].label}」の実行者が違う`,
          desc: `この手順を実行するのは本来${ROLE_LABEL[correct]}。${
            chosen ? ROLE_LABEL[chosen] + "ではない。" : ""
          }役割を取り違えると、手順自体が成立しない、または想定外の相手の指示に従ってしまう危険がある。`,
          slots: [i]
        });
      }
    });
    return violations;
  }

  /* ---------------------------------------------------------
     Diagram / feedback
  --------------------------------------------------------- */

  function resetDiagram() {
    wireActive.setAttribute("x2", "0");
    wireActive.classList.remove("breach", "warn");
    packetEl.style.left = "0%";
    attackerEl.classList.remove("show", "warn");
    document.querySelector(".attacker-icon").textContent = "🕵️";
    lockEl.textContent = "🔓";
    statusChip.textContent = "待機中";
    statusChip.className = "status-chip status-idle";
    slotsEl.querySelectorAll(".slot").forEach((el) => {
      el.classList.remove("slot-danger", "slot-safe", "slot-warn");
    });
  }

  function highlightSlots(indices, className) {
    indices.forEach((i) => {
      const el = slotsEl.querySelector(`.slot[data-index="${i + 1}"]`);
      if (el) el.classList.add(className);
    });
  }

  function renderReport(orderViolations, actorViolations) {
    reportEl.innerHTML = "";
    if (orderViolations.length === 0 && actorViolations.length === 0) {
      const card = document.createElement("div");
      card.className = "report-card success";
      card.innerHTML = `
        <div class="report-title"><span class="report-tag">確立成功</span>ハンドシェイク完了</div>
        <p>すべての手順が正しい順序・正しい実行者で行われた。安全な暗号化通信が確立された。</p>
      `;
      reportEl.appendChild(card);
      return;
    }
    orderViolations.forEach((v) => {
      const card = document.createElement("div");
      card.className = "report-card";
      card.innerHTML = `
        <div class="report-title"><span class="report-tag">${v.tag}</span>${v.title}</div>
        <p>${v.desc}</p>
      `;
      reportEl.appendChild(card);
    });
    actorViolations.forEach((v) => {
      const card = document.createElement("div");
      card.className = "report-card warn";
      card.innerHTML = `
        <div class="report-title"><span class="report-tag">${v.tag}</span>${v.title}</div>
        <p>${v.desc}</p>
      `;
      reportEl.appendChild(card);
    });
  }

  function runCheck() {
    if (slotState.some((s) => s === null) || actorState.some((a) => a === null)) return;

    resetDiagram();
    const orderViolations = evaluate();
    const actorViolations = evaluateActors();
    renderReport(orderViolations, actorViolations);

    requestAnimationFrame(() => {
      if (orderViolations.length === 0 && actorViolations.length === 0) {
        wireActive.setAttribute("x2", "600");
        packetEl.style.left = "100%";
        lockEl.textContent = "🔒";
        statusChip.textContent = "確立成功 ✓";
        statusChip.className = "status-chip status-safe";
        launchConfetti();
        return;
      }

      const dangerSlots = new Set();
      orderViolations.forEach((v) => v.slots.forEach((s) => dangerSlots.add(s)));
      const warnSlots = new Set();
      actorViolations.forEach((v) => v.slots.forEach((s) => warnSlots.add(s)));
      dangerSlots.forEach((s) => warnSlots.delete(s));

      highlightSlots([...dangerSlots], "slot-danger");
      highlightSlots([...warnSlots], "slot-warn");

      if (orderViolations.length > 0) {
        wireActive.setAttribute("x2", "330");
        wireActive.classList.add("breach");
        packetEl.style.left = "55%";
        statusChip.textContent = "突破されました ⚠";
        statusChip.className = "status-chip status-breach";

        const tags = [...new Set(orderViolations.map((v) => v.tag))];
        attackerTag.textContent = tags.join(" / ");
        document.querySelector(".attacker-icon").textContent = "🕵️";
        attackerEl.classList.add("show");
      } else {
        wireActive.setAttribute("x2", "390");
        wireActive.classList.add("warn");
        packetEl.style.left = "65%";
        statusChip.textContent = "役割に誤りがあります";
        statusChip.className = "status-chip status-warn";

        attackerTag.textContent = "役割エラー";
        document.querySelector(".attacker-icon").textContent = "⚠️";
        attackerEl.classList.add("show", "warn");
      }
    });
  }

  /* ---------------------------------------------------------
     Confetti
  --------------------------------------------------------- */

  function launchConfetti() {
    const colors = ["#34D0C0", "#FFB703", "#E9F1F5", "#3FE0CE"];
    const count = 46;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = 2.2 + Math.random() * 1.4 + "s";
      piece.style.opacity = String(0.7 + Math.random() * 0.3);
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 4000);
    }
  }

  /* ---------------------------------------------------------
     Wire up controls
  --------------------------------------------------------- */

  checkBtn.addEventListener("click", runCheck);
  resetBtn.addEventListener("click", init);

  init();
})();
