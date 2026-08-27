(() => {
  "use strict";

  const STORAGE_KEY = "dpro_tutorial_cosmetics_first10_v1_1";
  const STANDARD = "1.1";
  const FLOW = "first10";
  const SAFE_MARGIN = 8;
  const INTERACTIVE = "button,a,input,select,textarea,label,[role='button'],[contenteditable],summary,option,details";

  const STEPS = [
    {
      route: "demo-guide.html",
      selectors: ["#primaryDemoLink"],
      title: "「まず体験する」から開始",
      copy: "公開デモの注意事項、デモ管理コード、推奨の確認順を見てから、お客様側の体験へ進みます。",
      action: "既存の「まず体験する」を選択してください。Tutorialは自動クリックしません。",
      safety: "実在する氏名・電話番号・肌悩み・購入情報は入力しません。",
      advanceOnTarget: true,
      nextRoute: "index.html"
    },
    {
      route: "index.html",
      selectors: ["#menuTitle", ".menu-grid"],
      title: "LINE会員ページの入口を確認",
      copy: "美容相談、取り置き、再購入、マイページ、問合せ、キャンペーン、商品カタログ、マイコスメへの入口です。",
      action: "内容を確認したら「次へ」でマイコスメの入口を確認します。",
      safety: "このステップは閲覧のみです。",
      nextRoute: "index.html"
    },
    {
      route: "index.html",
      selectors: ["#myCosmeticsStep13Button", ".menu-grid"],
      title: "使用中商品と再購入目安へ",
      copy: "「マイコスメ」から使用中商品、再購入時期、おすすめ、定期購入希望、サンプル状況を確認できます。",
      action: "既存の「マイコスメ」ボタンを選択してください。",
      safety: "Tutorialはボタンを自動操作しません。",
      advanceOnTarget: true,
      nextRoute: "my-cosmetics.html"
    },
    {
      route: "my-cosmetics.html",
      selectors: ["[data-tab='repurchase']"],
      title: "再購入の目安を見る",
      copy: "使用中商品の情報から、次に購入を検討する時期を確認する画面です。",
      action: "「再購入目安」タブを選択してください。",
      safety: "「商品を追加」「定期購入希望を登録」などの登録操作はFirst10では実行しません。",
      advanceOnTarget: true,
      nextRoute: "my-cosmetics.html"
    },
    {
      route: "my-cosmetics.html",
      selectors: ["a[data-pickup-link]"],
      title: "再購入候補から取り置き画面へ",
      copy: "再購入候補から、店頭受取の取り置き画面へ移動する安全な導線を確認します。",
      action: "既存の「取り置きへ」リンクを選択してください。",
      safety: "ここではページ移動だけです。商品登録や依頼確定はしません。",
      advanceOnTarget: true,
      nextRoute: "pickup.html"
    },
    {
      route: "pickup.html",
      selectors: ["[data-view='history']"],
      title: "購入履歴から再購入候補を確認",
      copy: "購入履歴タブから過去の商品を確認できます。カート追加や依頼確定はFirst10の対象外です。",
      action: "「購入履歴から再購入」タブを選択して内容を確認してください。",
      safety: "取り置き送信・重複統合・キャンセルは業務データを変更するため自動実行しません。",
      nextRoute: "pickup.html"
    },
    {
      route: "consultation.html",
      selectors: ["#menuStepTitle", "#menuOptions"],
      title: "5段階の美容相談予約を確認",
      copy: "相談メニュー → 担当スタッフ → 予約日 → 空き時間 → 相談内容 → 確認の流れを把握します。",
      action: "このステップは読み取り中心です。「次へ」で店舗iPadへ移動できます。",
      safety: "予約確定・変更・キャンセルはTutorialから実行しません。",
      nextRoute: "owner-ipad-care.html"
    },
    {
      route: "owner-ipad-care.html",
      selectors: ["#ipadCareLoginForm"],
      title: "店舗スタッフ画面へ入る",
      copy: "店舗iPadの継続接客画面は既存の管理コード認証を使用します。",
      action: "必要なら既存画面に表示されているデモ管理コードを自分で入力し、既存のログイン操作を行ってください。",
      safety: "Tutorialは管理コードを自動入力・保存・読取・送信しません。認証後は自動的に次の案内へ進みます。",
      loginGate: true,
      nextRoute: "owner-ipad-care.html"
    },
    {
      route: "owner-ipad-care.html",
      selectors: ["#ipadCareSearchForm", ".crm-tabs.crm-ipad-tabs", "#ipadCareLoginForm"],
      title: "お客様を選び、継続接客を確認",
      copy: "検索・顧客選択の後、使用中、再購入、おすすめ、定期購入、サンプルのタブ構造を確認します。",
      action: "検索・選択は既存画面で行えます。内容を確認したら「次へ」でオーナーCRMへ移動します。",
      safety: "商品登録、おすすめ公開、定期購入登録、サンプル結果保存はTutorialから実行しません。",
      nextRoute: "owner-crm.html"
    },
    {
      route: "owner-crm.html",
      selectors: ["[data-crm-view='customers']", ".crm-nav"],
      title: "顧客カルテから継続運用へ",
      copy: "顧客カルテの構造を確認し、次はGuide Centerから問合せ・フォロー・再購入候補・キャンペーン管理へ進めます。",
      action: "「顧客カルテ」を選択して構造を確認し、「完了」でFirst10を終了してください。",
      safety: "再購入同期、商品保存、画像アップロード、顧客ケア記録の保存はTutorialから実行しません。",
      finish: true
    }
  ];

  let state = readState();
  let card = null;
  let highlight = null;
  let launcher = null;
  let resumeBanner = null;
  let currentTarget = null;
  let currentTargetCleanup = null;
  let waitObserver = null;
  let opener = null;
  let manualPosition = null;
  let statusTimer = null;
  let drag = null;
  let mutationObserver = null;

  document.addEventListener("DOMContentLoaded", init, { once: true });
  if (document.readyState !== "loading") init();

  function init() {
    if (document.documentElement.dataset.dproTutorialReady === "1") return;
    document.documentElement.dataset.dproTutorialReady = "1";
    injectLauncher();
    bindGuideCenterActions();
    mutationObserver = new MutationObserver(() => {
      if (card && !card.hidden) refreshTarget(false);
      maybeAdvanceLoginGate();
    });
    mutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });

    const route = currentRoute();
    const liveDemo = queryDemo();
    if (state && liveDemo && state.demo !== liveDemo) saveState({ ...state, demo: liveDemo, updated_at: now() });
    if (state && !state.completed) {
      if (state.route === route) openTutorial({ preserveOpener: true });
      else showResumeBanner();
    }

    window.addEventListener("resize", handleViewportChange, { passive: true });
    window.addEventListener("orientationchange", handleViewportChange, { passive: true });
    window.addEventListener("scroll", () => refreshTarget(false), { passive: true, capture: true });
    document.addEventListener("keydown", handleKeydown);
  }

  function injectLauncher() {
    launcher = document.createElement("div");
    launcher.id = "dpro-tutorial-launcher";
    launcher.innerHTML = `
      <button class="dpro-tut-launch-button" type="button" data-tut-launch>操作ガイド</button>
      <a class="dpro-tut-guide-link" href="guide-center.html">Guide Center</a>`;
    document.body.appendChild(launcher);
    launcher.querySelector("[data-tut-launch]").addEventListener("click", (event) => {
      opener = event.currentTarget;
      if (state && !state.completed) openTutorial();
      else openStartMenu();
    });
  }

  function bindGuideCenterActions() {
    document.querySelectorAll("[data-tutorial-action]").forEach((node) => {
      node.addEventListener("click", (event) => {
        const action = node.dataset.tutorialAction;
        if (action === "start") {
          event.preventDefault();
          start();
        } else if (action === "resume") {
          event.preventDefault();
          resume();
        } else if (action === "replay") {
          event.preventDefault();
          replay();
        } else if (action === "reset") {
          event.preventDefault();
          resetOnly();
          setGuideStatus("Tutorial進捗だけをリセットしました。");
        }
      });
    });
    const status = document.querySelector("[data-tutorial-state]");
    if (status) status.textContent = stateSummary();
  }

  function openStartMenu() {
    ensureUi();
    cleanupTargetBinding();
    currentTarget = null;
    highlight.hidden = true;
    card.hidden = false;
    manualPosition = null;
    card.querySelector("[data-tut-progress]").textContent = "FIRST10 / STANDARD V1.1";
    card.querySelector("[data-tut-route]").textContent = "10ステップ";
    const title = card.querySelector("[data-tut-title]");
    title.textContent = state?.completed ? "First10をもう一度確認できます" : "COSMETICS First10";
    card.querySelector("[data-tut-copy]").textContent = "LINE会員から店舗iPad・CRMまで、業務データを変更せずに主要画面を10ステップで確認します。";
    card.querySelector("[data-tut-action-note]").textContent = state?.completed ? "Replayで最初から開始、またはGuide Centerで役割別の流れを確認できます。" : "Startで公開デモ案内から開始します。";
    card.querySelector("[data-tut-safety]").textContent = "Tutorialは業務POST/PUT/PATCH/DELETEを発行せず、認証情報・顧客情報・入力値を保存しません。";
    setStatus("");
    configureActions({ startMenu: true });
    placeCard(null);
    requestAnimationFrame(() => title.focus({ preventScroll: true }));
  }

  function ensureUi() {
    if (card) return;
    highlight = document.createElement("div");
    highlight.id = "dpro-tutorial-highlight";
    highlight.hidden = true;
    document.body.appendChild(highlight);

    card = document.createElement("section");
    card.id = "dpro-tutorial-card";
    card.hidden = true;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "DPRO COSMETICS 操作ガイド");
    card.innerHTML = `
      <div class="dpro-tut-handle" data-tut-handle aria-label="ガイドカード移動ハンドル">
        <span class="dpro-tut-handle-label">DPRO TUTORIAL</span><span class="dpro-tut-handle-hint">ここをドラッグ</span>
      </div>
      <div class="dpro-tut-body">
        <div class="dpro-tut-progress"><span data-tut-progress></span><span data-tut-route></span></div>
        <h2 class="dpro-tut-title" data-tut-title tabindex="-1"></h2>
        <p class="dpro-tut-copy" data-tut-copy></p>
        <div class="dpro-tut-action-note" data-tut-action-note></div>
        <div class="dpro-tut-safety" data-tut-safety></div>
        <div class="dpro-tut-status" data-tut-status role="status" aria-live="polite"></div>
      </div>
      <div class="dpro-tut-actions">
        <button type="button" data-tut-back>戻る</button>
        <button type="button" class="primary" data-tut-next>次へ</button>
        <button type="button" data-tut-skip>スキップ</button>
        <button type="button" data-tut-close>閉じる</button>
        <button type="button" data-tut-replay>Replay</button>
        <a href="guide-center.html" data-tut-guide>Guide Center</a>
      </div>`;
    document.body.appendChild(card);

    card.querySelector("[data-tut-back]").addEventListener("click", back);
    card.querySelector("[data-tut-next]").addEventListener("click", next);
    card.querySelector("[data-tut-skip]").addEventListener("click", skip);
    card.querySelector("[data-tut-close]").addEventListener("click", closeTutorial);
    card.querySelector("[data-tut-replay]").addEventListener("click", replay);
    card.querySelector("[data-tut-handle]").addEventListener("pointerdown", dragStart);
  }

  function openTutorial(options = {}) {
    if (!state || state.completed) return openStartMenu();
    ensureUi();
    if (!options.preserveOpener && !opener) opener = document.activeElement;
    card.hidden = false;
    manualPosition = null;
    renderStep();
  }

  function renderStep() {
    if (!state || state.completed) return openStartMenu();
    const step = STEPS[state.step];
    if (!step) return resetOnly();
    cleanupTargetBinding();
    setStatus("");
    card.querySelector("[data-tut-progress]").textContent = `STEP ${String(state.step + 1).padStart(2, "0")} / 10`;
    card.querySelector("[data-tut-route]").textContent = step.route;
    const title = card.querySelector("[data-tut-title]");
    title.textContent = step.title;
    card.querySelector("[data-tut-copy]").textContent = step.copy;
    card.querySelector("[data-tut-action-note]").textContent = step.action;
    card.querySelector("[data-tut-safety]").textContent = step.safety;
    configureActions({ step });
    waitForTarget(step).then((target) => {
      if (!state || STEPS[state.step] !== step || card.hidden) return;
      currentTarget = target;
      if (target) {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        bindTargetAction(step, target);
      } else {
        setStatus("対象が見つからないため、安全な代替位置で案内しています。Guide Centerから対象画面を確認できます。");
      }
      requestAnimationFrame(() => {
        refreshTarget(true);
        title.focus({ preventScroll: true });
      });
    });
    maybeAdvanceLoginGate();
  }

  function configureActions({ step = null, startMenu = false } = {}) {
    const backButton = card.querySelector("[data-tut-back]");
    const nextButton = card.querySelector("[data-tut-next]");
    const skipButton = card.querySelector("[data-tut-skip]");
    const replayButton = card.querySelector("[data-tut-replay]");

    if (startMenu) {
      backButton.disabled = true;
      nextButton.disabled = false;
      nextButton.textContent = state?.completed ? "Replay開始" : "Start";
      nextButton.dataset.mode = state?.completed ? "replay" : "start";
      skipButton.disabled = true;
      replayButton.disabled = !state;
      return;
    }

    nextButton.dataset.mode = "step";
    backButton.disabled = state.step === 0;
    skipButton.disabled = false;
    replayButton.disabled = false;
    if (step.finish) nextButton.textContent = "完了";
    else if (step.advanceOnTarget) nextButton.textContent = "対象を確認";
    else nextButton.textContent = "次へ";
  }

  function next() {
    const mode = card?.querySelector("[data-tut-next]")?.dataset.mode;
    if (mode === "start") return start();
    if (mode === "replay") return replay();
    if (!state) return start();
    const step = STEPS[state.step];
    if (!step) return;
    if (step.finish) return complete();
    if (step.advanceOnTarget) {
      currentTarget?.focus?.({ preventScroll: true });
      setStatus("強調されている既存画面の対象を操作すると、安全に次のステップへ進みます。");
      return;
    }
    if (step.loginGate) {
      if (isVisible(document.querySelector("#ipadCareSearchForm"))) return advanceTo(state.step + 1, currentRoute());
      currentTarget?.focus?.({ preventScroll: true });
      setStatus("既存のログインを完了すると、顧客検索の案内へ進みます。Tutorialは認証情報を扱いません。");
      return;
    }
    advanceTo(state.step + 1, STEPS[state.step + 1]?.route || currentRoute());
  }

  function back() {
    if (!state || state.step <= 0) return;
    const nextIndex = state.step - 1;
    const route = STEPS[nextIndex].route;
    saveState({ ...state, step: nextIndex, route, previous_route: currentRoute(), completed: false, updated_at: now() });
    if (route !== currentRoute()) navigate(route);
    else renderStep();
  }

  function skip() {
    if (!state) return;
    const nextIndex = state.step + 1;
    if (nextIndex >= STEPS.length) {
      saveState({ ...state, completed: true, skipped: true, route: currentRoute(), updated_at: now() });
      return showCompletion();
    }
    const route = STEPS[nextIndex].route;
    saveState({ ...state, step: nextIndex, route, previous_route: currentRoute(), skipped: true, completed: false, updated_at: now() });
    if (route !== currentRoute()) navigate(route);
    else renderStep();
  }

  function start() {
    const demo = queryDemo();
    saveState({ schema: 1, standard: STANDARD, flow: FLOW, step: 0, route: STEPS[0].route, demo, completed: false, skipped: false, updated_at: now() });
    if (currentRoute() !== STEPS[0].route) navigate(STEPS[0].route, false);
    else openTutorial();
  }

  function resume() {
    if (!state || state.completed) return start();
    hideResumeBanner();
    if (state.route !== currentRoute()) navigate(state.route);
    else openTutorial();
  }

  function replay() {
    const demo = state?.demo ?? queryDemo();
    saveState({ schema: 1, standard: STANDARD, flow: FLOW, step: 0, route: STEPS[0].route, demo, completed: false, skipped: false, updated_at: now() });
    if (currentRoute() !== STEPS[0].route) navigate(STEPS[0].route, false);
    else openTutorial();
  }

  function complete() {
    if (!state) return;
    saveState({ ...state, step: 9, route: currentRoute(), completed: true, updated_at: now() });
    showCompletion();
  }

  function showCompletion() {
    ensureUi();
    cleanupTargetBinding();
    currentTarget = null;
    highlight.hidden = true;
    card.hidden = false;
    manualPosition = null;
    card.querySelector("[data-tut-progress]").textContent = "FIRST10 COMPLETE";
    card.querySelector("[data-tut-route]").textContent = "STANDARD V1.1";
    const title = card.querySelector("[data-tut-title]");
    title.textContent = "First10が完了しました";
    card.querySelector("[data-tut-copy]").textContent = "主要10ステップの確認は完了です。Guide Centerでは顧客・店舗iPad・オーナー・販促・system-checkを役割別に確認できます。";
    card.querySelector("[data-tut-action-note]").textContent = "Guide Centerへ進むか、Replayで最初から確認できます。";
    card.querySelector("[data-tut-safety]").textContent = "Tutorialが業務データを自動更新する操作はありません。";
    setStatus(state?.skipped ? "一部ステップをスキップして完了しました。" : "10ステップを完了しました。");
    configureActions({ startMenu: true });
    const nextButton = card.querySelector("[data-tut-next]");
    nextButton.textContent = "Replay開始";
    nextButton.dataset.mode = "replay";
    placeCard(null);
    requestAnimationFrame(() => title.focus({ preventScroll: true }));
    updateGuideStatusNodes();
  }

  function closeTutorial() {
    if (!card || card.hidden) return;
    card.hidden = true;
    if (highlight) highlight.hidden = true;
    cleanupTargetBinding();
    if (opener && document.contains(opener) && typeof opener.focus === "function") opener.focus({ preventScroll: true });
  }

  function resetOnly() {
    localStorage.removeItem(STORAGE_KEY);
    state = null;
    if (card) card.hidden = true;
    if (highlight) highlight.hidden = true;
    hideResumeBanner();
    cleanupTargetBinding();
    updateGuideStatusNodes();
  }

  function bindTargetAction(step, target) {
    if (!step.advanceOnTarget || !target) return;
    const handler = () => {
      if (!state || STEPS[state.step] !== step) return;
      const nextIndex = state.step + 1;
      const nextRoute = STEPS[nextIndex]?.route || currentRoute();
      saveState({ ...state, step: nextIndex, route: nextRoute, previous_route: currentRoute(), completed: false, updated_at: now() });
      if (nextRoute === currentRoute()) setTimeout(renderStep, 0);
    };
    target.addEventListener("click", handler, { capture: true, once: true });
    currentTargetCleanup = () => target.removeEventListener("click", handler, true);
  }

  function cleanupTargetBinding() {
    if (currentTargetCleanup) currentTargetCleanup();
    currentTargetCleanup = null;
    if (waitObserver) waitObserver.disconnect();
    waitObserver = null;
  }

  function waitForTarget(step) {
    const find = () => step.selectors.map((selector) => safeQuery(selector)).find(Boolean) || null;
    const immediate = find();
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (waitObserver) waitObserver.disconnect();
        waitObserver = null;
        resolve(value);
      };
      waitObserver = new MutationObserver(() => {
        const found = find();
        if (found) finish(found);
      });
      waitObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
      const timer = setTimeout(() => finish(find()), 5000);
    });
  }

  function maybeAdvanceLoginGate() {
    if (!state || state.step !== 7) return;
    const search = document.querySelector("#ipadCareSearchForm");
    if (isVisible(search)) advanceTo(8, currentRoute());
  }

  function advanceTo(stepIndex, route) {
    if (!state) return;
    if (stepIndex >= STEPS.length) return complete();
    const previous = currentRoute();
    saveState({ ...state, step: stepIndex, route, previous_route: previous, completed: false, updated_at: now() });
    if (route !== previous) navigate(route);
    else renderStep();
  }

  function navigate(route, preserveDemo = true) {
    const url = new URL(route, location.href);
    const demo = preserveDemo ? (state?.demo ?? queryDemo()) : (state?.demo ?? queryDemo());
    if (demo === "returning") url.searchParams.set("demo", "1");
    else if (demo === "new") url.searchParams.set("demo", "new");
    location.href = `${url.pathname.split("/").pop()}${url.search}`;
  }

  function refreshTarget(place = false) {
    if (!card || card.hidden) return;
    if (currentTarget && document.contains(currentTarget) && isVisible(currentTarget)) {
      const rect = currentTarget.getBoundingClientRect();
      highlight.hidden = false;
      highlight.style.left = `${Math.max(0, rect.left - 4)}px`;
      highlight.style.top = `${Math.max(0, rect.top - 4)}px`;
      highlight.style.width = `${Math.max(1, Math.min(innerWidth, rect.width + 8))}px`;
      highlight.style.height = `${Math.max(1, Math.min(innerHeight, rect.height + 8))}px`;
      if (place && !manualPosition) placeCard(rect);
      else clampCard();
    } else {
      highlight.hidden = true;
      if (place) placeCard(null);
      else clampCard();
    }
  }

  function placeCard(targetRect) {
    if (!card || card.hidden) return;
    applyCardHeightLimit();
    const cardRect = card.getBoundingClientRect();
    const width = cardRect.width || Math.min(360, innerWidth - 16);
    const height = cardRect.height || Math.min(520, innerHeight - 16);
    const bounds = viewportBounds(width, height);
    let best = { x: bounds.maxX, y: bounds.minY, score: Infinity };
    if (targetRect) {
      const gap = 14;
      const candidates = [
        { x: targetRect.right + gap, y: targetRect.top },
        { x: targetRect.left, y: targetRect.bottom + gap },
        { x: targetRect.left - width - gap, y: targetRect.top },
        { x: targetRect.left, y: targetRect.top - height - gap }
      ];
      candidates.forEach((candidate) => {
        const x = clamp(candidate.x, bounds.minX, bounds.maxX);
        const y = clamp(candidate.y, bounds.minY, bounds.maxY);
        const overlap = intersectionArea({ left: x, top: y, right: x + width, bottom: y + height }, targetRect);
        const movement = Math.abs(x - candidate.x) + Math.abs(y - candidate.y);
        const score = overlap * 10 + movement;
        if (score < best.score) best = { x, y, score };
      });
    } else {
      best = { x: bounds.maxX, y: bounds.minY, score: 0 };
    }
    card.style.left = `${best.x}px`;
    card.style.top = `${best.y}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";
    clampCard();
  }

  function clampCard() {
    if (!card || card.hidden) return;
    applyCardHeightLimit();
    const rect = card.getBoundingClientRect();
    const bounds = viewportBounds(rect.width, rect.height);
    const currentLeft = Number.parseFloat(card.style.left);
    const currentTop = Number.parseFloat(card.style.top);
    const x = clamp(Number.isFinite(currentLeft) ? currentLeft : rect.left, bounds.minX, bounds.maxX);
    const y = clamp(Number.isFinite(currentTop) ? currentTop : rect.top, bounds.minY, bounds.maxY);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }


  function applyCardHeightLimit() {
    if (!card) return;
    const stickyBottom = stickyHeaderBottom();
    const minY = Math.max(SAFE_MARGIN, stickyBottom > 0 ? stickyBottom + 6 : SAFE_MARGIN);
    const maxHeight = Math.max(220, innerHeight - minY - SAFE_MARGIN);
    card.style.maxHeight = `${maxHeight}px`;
  }

  function viewportBounds(cardWidth, cardHeight) {
    const stickyBottom = stickyHeaderBottom();
    const minY = Math.max(SAFE_MARGIN, stickyBottom > 0 ? stickyBottom + 6 : SAFE_MARGIN);
    return {
      minX: SAFE_MARGIN,
      maxX: Math.max(SAFE_MARGIN, innerWidth - cardWidth - SAFE_MARGIN),
      minY,
      maxY: Math.max(minY, innerHeight - cardHeight - SAFE_MARGIN)
    };
  }

  function stickyHeaderBottom() {
    const candidates = document.querySelectorAll(".topbar,.owner-topbar,.crm-topbar,.cos-topbar,[data-sticky-header]");
    let bottom = 0;
    candidates.forEach((node) => {
      const style = getComputedStyle(node);
      if ((style.position === "sticky" || style.position === "fixed") && isVisible(node)) {
        const rect = node.getBoundingClientRect();
        if (rect.top <= 4) bottom = Math.max(bottom, rect.bottom);
      }
    });
    return Math.min(bottom, innerHeight * .35);
  }

  function dragStart(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest(INTERACTIVE)) return;
    const handle = event.currentTarget;
    const rect = card.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, active: false };
    try { handle.setPointerCapture(event.pointerId); } catch {}
    handle.addEventListener("pointermove", dragMove);
    handle.addEventListener("pointerup", dragEnd, { once: true });
    handle.addEventListener("pointercancel", dragEnd, { once: true });
  }

  function dragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < 5) return;
    if (!drag.active) {
      drag.active = true;
      document.documentElement.classList.add("dpro-tutorial-dragging");
    }
    event.preventDefault();
    card.style.left = `${drag.left + dx}px`;
    card.style.top = `${drag.top + dy}px`;
    manualPosition = true;
    clampCard();
  }

  function dragEnd(event) {
    const handle = event.currentTarget;
    if (drag) {
      try { handle.releasePointerCapture(drag.pointerId); } catch {}
    }
    handle.removeEventListener("pointermove", dragMove);
    document.documentElement.classList.remove("dpro-tutorial-dragging");
    drag = null;
    clampCard();
  }

  function handleViewportChange() {
    manualPosition = null;
    setTimeout(() => refreshTarget(true), 0);
  }

  function handleKeydown(event) {
    if (event.key !== "Escape") return;
    if (!card || card.hidden) return;
    if (document.querySelector("dialog[open]:not(#dpro-tutorial-card)")) return;
    closeTutorial();
  }

  function showResumeBanner() {
    if (!state || state.completed) return;
    if (!resumeBanner) {
      resumeBanner = document.createElement("div");
      resumeBanner.id = "dpro-tutorial-resume-banner";
      resumeBanner.innerHTML = `<div class="dpro-tut-resume-row"><span>First10の続きがあります。</span><button type="button">続きから</button></div>`;
      document.body.appendChild(resumeBanner);
      resumeBanner.querySelector("button").addEventListener("click", resume);
    }
    resumeBanner.hidden = false;
  }

  function hideResumeBanner() {
    if (resumeBanner) resumeBanner.hidden = true;
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      const allowedKeys = new Set(["schema", "standard", "flow", "step", "route", "previous_route", "demo", "completed", "skipped", "updated_at"]);
      const keysOk = Object.keys(value).every((key) => allowedKeys.has(key));
      const valid = keysOk && value.schema === 1 && value.standard === STANDARD && value.flow === FLOW && Number.isInteger(value.step) && value.step >= 0 && value.step <= 9 && typeof value.route === "string" && typeof value.completed === "boolean" && typeof value.skipped === "boolean" && ["returning", "new", null].includes(value.demo ?? null);
      if (!valid) throw new Error("invalid tutorial state");
      return value;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function saveState(value) {
    const clean = {
      schema: 1,
      standard: STANDARD,
      flow: FLOW,
      step: clamp(Number(value.step) || 0, 0, 9),
      route: basename(value.route || currentRoute()),
      ...(value.previous_route ? { previous_route: basename(value.previous_route) } : {}),
      demo: ["returning", "new"].includes(value.demo) ? value.demo : null,
      completed: Boolean(value.completed),
      skipped: Boolean(value.skipped),
      updated_at: value.updated_at || now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    state = clean;
    updateGuideStatusNodes();
  }

  function stateSummary() {
    if (!state) return "未開始";
    if (state.completed) return state.skipped ? "完了（一部スキップ）" : "完了";
    return `Step ${state.step + 1}/10・${state.route}`;
  }

  function updateGuideStatusNodes() {
    document.querySelectorAll("[data-tutorial-state]").forEach((node) => { node.textContent = stateSummary(); });
  }

  function setGuideStatus(message) {
    document.querySelectorAll("[data-tutorial-message]").forEach((node) => { node.textContent = message; });
  }

  function setStatus(message) {
    if (!card) return;
    const node = card.querySelector("[data-tut-status]");
    node.textContent = message || "";
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => { if (node.textContent === message) node.textContent = ""; }, 6500);
  }

  function currentRoute() {
    return basename(location.pathname) || "index.html";
  }

  function basename(value) {
    const clean = String(value || "").split(/[?#]/)[0];
    const parts = clean.split("/").filter(Boolean);
    return parts[parts.length - 1] || "index.html";
  }

  function queryDemo() {
    const raw = new URLSearchParams(location.search).get("demo");
    if (raw === "new") return "new";
    if (raw === "1" || raw === "returning") return "returning";
    return null;
  }

  function safeQuery(selector) {
    try { return document.querySelector(selector); } catch { return null; }
  }

  function isVisible(node) {
    if (!node || !node.isConnected) return false;
    if (node.hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function intersectionArea(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  }

  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function now() { return new Date().toISOString(); }
  function prefersReducedMotion() { return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  window.DPROTutorial = Object.freeze({ start, resume, replay, reset: resetOnly, state: () => state ? { ...state } : null });
})();
