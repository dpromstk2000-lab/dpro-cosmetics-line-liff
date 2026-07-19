(() => {
  "use strict";

  const D = window.DPRO;
  const TOKEN_KEY = "dpro_cosmetics_owner_token";

  const pageDefinitions = [
    ["LINEトップ", "index.html"],
    ["会員マイページ", "member.html"],
    ["美容相談予約", "consultation.html"],
    ["商品取り置き・再購入", "pickup.html"],
    ["商品問合せ", "inquiry.html"],
    ["新商品・キャンペーン", "campaigns.html"],
    ["オーナーPC管理", "owner.html"],
    ["スタッフiPad", "owner-ipad.html"],
    ["店舗運営設定", "owner-settings.html"],
    ["問合せ・販促管理", "owner-engagement.html"],
    ["system-check", "system-check.html"],
  ];

  const apiGroupDefinitions = [
    {
      title: "基本データベース",
      icon: "🗄️",
      source: "database",
      checks: [
        ["データベース接続", "ok"],
        ["店舗設定", "store_ok"],
        ["運営設定", "settings_ok"],
        ["必要テーブル", "required_tables_ok"],
        ["電話番号正規化", "phone_normalize_test"],
        ["非公開Storage", "private_storage_bucket"],
      ],
    },
    {
      title: "LINE会員",
      icon: "👤",
      source: "member_api",
      checks: [
        ["会員API", "ok"],
        ["必要関数", "required_functions_ok"],
        ["既存顧客取得", "demo_returning_member_ok"],
        ["LINE連携承認", "line_link_approval_required"],
      ],
    },
    {
      title: "美容相談予約",
      icon: "🗓️",
      source: "consultation_api",
      checks: [
        ["予約API", "ok"],
        ["空き時間", "demo_availability_ok"],
        ["過去日時防止", "past_datetime_guard"],
        ["スタッフ重複防止", "staff_overlap_guard"],
        ["顧客重複防止", "customer_overlap_guard"],
        ["予約検証トリガー", "reservation_validation_trigger_ok"],
      ],
    },
    {
      title: "取り置き・再購入",
      icon: "🛍️",
      source: "pickup_api",
      checks: [
        ["取り置きAPI", "ok"],
        ["必要関数", "required_functions_ok"],
        ["過去受取日防止", "past_pickup_date_guard"],
        ["二重依頼防止", "duplicate_detection_enabled"],
        ["同一依頼統合", "merge_or_separate_enabled"],
        ["冪等性", "idempotency_guard"],
      ],
    },
    {
      title: "オーナーPC",
      icon: "💻",
      source: "owner_api",
      checks: [
        ["管理API", "ok"],
        ["ダッシュボード", "dashboard_ok"],
        ["顧客検索", "customer_search"],
        ["顧客詳細", "customer_detail"],
        ["美容相談管理", "reservation_management"],
        ["取り置き管理", "hold_management"],
        ["状態遷移防止", "status_transition_guard"],
      ],
    },
    {
      title: "スタッフiPad",
      icon: "📱",
      source: "ipad_api",
      checks: [
        ["iPad API", "ok"],
        ["顧客履歴", "customer_detail_ok"],
        ["美容相談記録", "counseling_registration"],
        ["購入登録", "purchase_registration"],
        ["サンプル重複防止", "sample_repeat_guard"],
        ["フォロー登録", "followup_registration"],
        ["予約完了", "reservation_completion"],
        ["機密メモ権限", "sensitive_note_guard"],
      ],
    },
    {
      title: "店舗運営設定",
      icon: "⚙️",
      source: "operations_api",
      checks: [
        ["運営API", "ok"],
        ["店舗・営業時間", "store_settings_management"],
        ["30分単位", "thirty_minute_rule"],
        ["スタッフ管理", "staff_management"],
        ["最終オーナー保護", "last_owner_guard"],
        ["商品管理", "product_management"],
        ["在庫管理", "inventory_management"],
        ["休業日管理", "holiday_management"],
        ["操作ログ", "activity_log"],
      ],
    },
    {
      title: "問合せ・販促",
      icon: "💬",
      source: "engagement_api",
      checks: [
        ["問合せAPI", "member_inquiry"],
        ["回答公開制御", "inquiry_response_visible_guard"],
        ["問合せ状態遷移", "inquiry_status_transition_guard"],
        ["使用後相談の優先化", "post_use_priority_guard"],
        ["フォロー管理", "followup_management"],
        ["再購入候補", "repurchase_candidate_management"],
        ["販促同意確認", "marketing_consent_guard"],
        ["キャンペーン管理", "campaign_management"],
        ["対象顧客同意確認", "campaign_target_consent_guard"],
      ],
    },
  ];

  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let lastReport = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bind();
    renderScreenLinks();

    if (D.demoScenario) {
      document.getElementById("systemCheckManagementCode").value = "1234";
    }

    if (token) {
      openApp().catch((error) => showLogin(withRequest(error)));
    }
  }

  function bind() {
    document.getElementById("systemCheckLoginForm").addEventListener("submit", login);
    document.getElementById("systemCheckToggleCode").addEventListener("click", toggleCode);
    document.getElementById("systemCheckClearCode").addEventListener("click", clearCode);
    document.getElementById("systemCheckLogoutButton").addEventListener("click", logout);
    document.getElementById("runSystemCheckButton").addEventListener("click", runAllChecks);
    document.getElementById("prepareDemoButton").addEventListener("click", openDemoPrepare);
    document.getElementById("copySystemCheckButton").addEventListener("click", copyReport);
    document.getElementById("downloadSystemCheckButton").addEventListener("click", downloadReport);
    document.getElementById("demoPrepareCancelButton").addEventListener("click", () => {
      document.getElementById("demoPrepareDialog").close();
    });
    document.getElementById("demoPrepareExecuteButton").addEventListener("click", executeDemoPrepare);
  }

  async function login(event) {
    event.preventDefault();
    loginError("");
    const code = document.getElementById("systemCheckManagementCode").value.trim();
    if (!code) return loginError("管理コードを入力してください。");

    const button = document.getElementById("systemCheckLoginButton");
    button.disabled = true;
    button.textContent = "確認しています…";

    try {
      const response = await D.request("/owner/auth", {
        method: "POST",
        body: { management_code: code },
      });
      token = response.admin_token;
      sessionStorage.setItem(TOKEN_KEY, token);
      document.getElementById("systemCheckManagementCode").value = "";
      await openApp();
    } catch (error) {
      loginError(withRequest(error));
    } finally {
      button.disabled = false;
      button.textContent = "システム確認を開く";
    }
  }

  async function openApp() {
    document.getElementById("systemCheckLoginView").hidden = true;
    document.getElementById("systemCheckAppView").hidden = false;
    await runAllChecks();
  }

  function showLogin(message) {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    document.getElementById("systemCheckAppView").hidden = true;
    document.getElementById("systemCheckLoginView").hidden = false;
    if (message) loginError(message);
  }

  function logout() {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  function toggleCode() {
    const input = document.getElementById("systemCheckManagementCode");
    input.type = input.type === "password" ? "text" : "password";
    document.getElementById("systemCheckToggleCode").textContent =
      input.type === "password" ? "表示" : "隠す";
  }

  function clearCode() {
    const input = document.getElementById("systemCheckManagementCode");
    input.value = "";
    input.focus();
  }

  async function adminRequest(path, options = {}) {
    try {
      return await D.request(path, {
        method: options.method || "GET",
        headers: { Authorization: `Bearer ${token}` },
        body: options.body,
      });
    } catch (error) {
      if (error.status === 401) {
        showLogin("管理者認証の有効期限が切れました。もう一度開いてください。");
      }
      throw error;
    }
  }

  async function runAllChecks() {
    loading(true);
    globalError("");
    setRunButton(true);

    try {
      const [apiReport, pageReport] = await Promise.all([
        adminRequest("/admin/system-check"),
        checkPages(),
      ]);

      lastReport = {
        ok: Boolean(apiReport.overall_ok && pageReport.ok),
        checked_at: new Date().toISOString(),
        api: apiReport,
        pages: pageReport,
        browser: {
          user_agent: navigator.userAgent,
          location: location.href,
        },
      };

      renderReport(lastReport);
      enableReportButtons(true);
    } catch (error) {
      globalError(withRequest(error));
      renderFailure(error);
    } finally {
      loading(false);
      setRunButton(false);
    }
  }

  async function checkPages() {
    const results = await Promise.all(pageDefinitions.map(async ([label, path]) => {
      const url = new URL(path, location.href);
      if (D.demoScenario) url.searchParams.set("demo", D.demoScenario === "returning" ? "1" : "new");

      const started = performance.now();
      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        const text = await response.text();
        const htmlOk = /<!doctype html>|<html[\s>]/i.test(text);
        return {
          label,
          path,
          url: url.toString(),
          ok: response.ok && htmlOk,
          status: response.status,
          html_ok: htmlOk,
          elapsed_ms: Math.round(performance.now() - started),
        };
      } catch (error) {
        return {
          label,
          path,
          url: url.toString(),
          ok: false,
          status: 0,
          html_ok: false,
          error: error.message,
          elapsed_ms: Math.round(performance.now() - started),
        };
      }
    }));

    return {
      ok: results.every((item) => item.ok),
      passed: results.filter((item) => item.ok).length,
      total: results.length,
      results,
    };
  }

  function renderReport(report) {
    const api = report.api || {};
    const pages = report.pages || { results: [], passed: 0, total: 0 };

    const storeName =
      api.database?.store?.store_name ||
      api.database?.database?.store_name ||
      "DPROコスメティックサロン";

    document.getElementById("systemCheckStoreName").textContent = storeName;
    document.getElementById("systemCheckFooterStore").textContent = storeName;

    const isDemo = Boolean(api.database?.store?.is_demo || api.worker?.browser_demo_enabled);
    document.getElementById("systemCheckDemoBadge").hidden = !isDemo;
    document.getElementById("prepareDemoButton").hidden = !isDemo;

    const overallOk = Boolean(report.ok);
    document.getElementById("systemCheckOverall").classList.toggle("is-success", overallOk);
    document.getElementById("systemCheckOverall").classList.toggle("is-failure", !overallOk);
    document.getElementById("systemCheckOverallIcon").textContent = overallOk ? "✓" : "!";
    document.getElementById("systemCheckOverallTitle").textContent =
      overallOk ? "営業確認に必要な検査は正常です" : "確認が必要な項目があります";
    document.getElementById("systemCheckOverallMessage").textContent =
      overallOk
        ? "Worker、Supabase、各API、GitHub Pagesの表示を確認できました。"
        : "赤色の項目を確認してから営業・公開確認を行ってください。";

    document.getElementById("systemCheckWorkerVersion").textContent = api.version || "未取得";
    document.getElementById("systemCheckCheckedAt").textContent = D.formatDateTime(report.checked_at);
    document.getElementById("systemCheckPageCount").textContent = `${pages.passed}/${pages.total}`;

    renderApiGroups(api);
    renderPageResults(pages.results || []);
    renderSecurity(api);
    renderProductionNotice(api, pages);
  }

  function renderApiGroups(api) {
    const container = document.getElementById("systemCheckApiGroups");

    container.innerHTML = apiGroupDefinitions.map((group) => {
      const source = api[group.source] || {};
      const checks = group.checks.map(([label, key]) => {
        const value = source[key];
        return checkRow(label, value === true, value);
      }).join("");

      const groupOk = group.checks.every(([, key]) => source[key] === true);

      return `
        <article class="card system-check-group ${groupOk ? "is-success" : "is-failure"}">
          <div class="system-check-group-heading">
            <div class="system-check-group-icon">${group.icon}</div>
            <div>
              <h3>${D.escapeHtml(group.title)}</h3>
              <p>${groupOk ? "正常" : "要確認"}</p>
            </div>
            <span class="system-check-state">${groupOk ? "✓" : "!"}</span>
          </div>
          <div class="system-check-list">${checks}</div>
        </article>
      `;
    }).join("");
  }

  function checkRow(label, ok, rawValue) {
    const detail = typeof rawValue === "number" || typeof rawValue === "string"
      ? `<small>${D.escapeHtml(rawValue)}</small>`
      : "";

    return `
      <div class="system-check-row ${ok ? "is-success" : "is-failure"}">
        <span class="system-check-row-icon">${ok ? "✓" : "×"}</span>
        <span>${D.escapeHtml(label)}</span>
        ${detail}
      </div>
    `;
  }

  function renderPageResults(results) {
    const container = document.getElementById("systemCheckPageResults");
    container.innerHTML = results.map((item) => `
      <article class="system-check-page-card ${item.ok ? "is-success" : "is-failure"}">
        <div class="system-check-page-icon">${item.ok ? "✓" : "×"}</div>
        <div>
          <strong>${D.escapeHtml(item.label)}</strong>
          <span>${item.ok ? "表示OK" : `エラー ${item.status || ""}`}</span>
          <small>${D.escapeHtml(item.path)}｜${item.elapsed_ms}ms</small>
        </div>
        <a href="${D.escapeHtml(item.url)}" target="_blank" rel="noopener">開く</a>
      </article>
    `).join("");
  }

  function renderSecurity(api) {
    const worker = api.worker || {};
    const engagement = api.engagement_api || {};
    const database = api.database || {};
    const store = database.store || {};

    const items = [
      {
        label: "Supabase秘密鍵",
        state: worker.key_type === "supabase_secret_key" ? "pass" : "warning",
        message: worker.key_type === "supabase_secret_key"
          ? "新しいSupabase secret keyを使用しています。"
          : "旧service_role keyです。本番更新時はsecret keyを推奨します。",
      },
      {
        label: "production_guard",
        state: store.production_guard === true ? "pass" : "fail",
        message: store.production_guard === true
          ? "本番・デモの誤操作防止が有効です。"
          : "production_guardを有効にしてください。",
      },
      {
        label: "LINE IDトークン検証",
        state: worker.line_login_channel_id_configured ? "pass" : "warning",
        message: worker.line_login_channel_id_configured
          ? "LINE Login Channel IDが設定されています。"
          : "デモでは未設定で正常です。本番LINE公開前に設定してください。",
      },
      {
        label: "ブラウザデモ",
        state: worker.browser_demo_enabled ? "warning" : "pass",
        message: worker.browser_demo_enabled
          ? "デモ確認用です。本番導入時は無効化してください。"
          : "ブラウザデモは無効です。",
      },
      {
        label: "キャンペーン自動一斉送信",
        state: engagement.automatic_bulk_send === false ? "safe" : "warning",
        message: engagement.automatic_bulk_send === false
          ? "誤配信防止のため自動送信しない安全仕様です。"
          : "自動送信設定を確認してください。",
      },
      {
        label: "販促同意ガード",
        state: engagement.campaign_target_consent_guard === true ? "pass" : "fail",
        message: engagement.campaign_target_consent_guard === true
          ? "同意済み・LINE連携済み顧客だけを対象にします。"
          : "販促同意ガードを確認してください。",
      },
      {
        label: "デモデータ準備",
        state: worker.demo_prepare_enabled ? "safe" : "pass",
        message: worker.demo_prepare_enabled
          ? "デモ店舗だけで実行可能です。本番店舗コードでは拒否されます。"
          : "デモ準備機能は無効です。",
      },
    ];

    document.getElementById("systemCheckSecurityResults").innerHTML = items.map((item) => `
      <article class="system-check-security-card state-${item.state}">
        <div class="system-check-security-icon">${stateIcon(item.state)}</div>
        <div>
          <strong>${D.escapeHtml(item.label)}</strong>
          <p>${D.escapeHtml(item.message)}</p>
        </div>
      </article>
    `).join("");
  }

  function renderProductionNotice(api, pages) {
    const worker = api.worker || {};
    const database = api.database || {};
    const store = database.store || {};
    const warnings = [];

    if (store.is_demo) warnings.push("現在はデモ店舗コードです。");
    if (worker.browser_demo_enabled) warnings.push("本番ではブラウザデモを無効化します。");
    if (!worker.line_login_channel_id_configured) warnings.push("本番LINE公開前にLINE Login Channel IDを設定します。");
    if (pages.passed !== pages.total) warnings.push("表示できないGitHub Pagesがあります。");

    const node = document.getElementById("systemCheckProductionNotice");
    if (!warnings.length) {
      node.hidden = true;
      node.textContent = "";
      return;
    }

    node.hidden = false;
    node.innerHTML = `<strong>本番導入前の変更事項</strong><br>${warnings.map(D.escapeHtml).join("<br>")}`;
  }

  function renderScreenLinks() {
    const container = document.getElementById("systemCheckScreenLinks");
    container.innerHTML = pageDefinitions
      .filter(([, path]) => path !== "system-check.html")
      .map(([label, path]) => {
        const url = new URL(path, location.href);
        if (D.demoScenario) url.searchParams.set("demo", D.demoScenario === "returning" ? "1" : "new");
        return `<a class="system-check-screen-link" href="${D.escapeHtml(url.toString())}" target="_blank" rel="noopener">${D.escapeHtml(label)}<span>↗</span></a>`;
      }).join("");
  }

  function openDemoPrepare() {
    document.getElementById("demoPrepareDialog").showModal();
  }

  async function executeDemoPrepare() {
    const button = document.getElementById("demoPrepareExecuteButton");
    button.disabled = true;
    button.textContent = "準備しています…";

    try {
      const response = await adminRequest("/admin/demo/prepare", {
        method: "POST",
        body: {},
      });
      document.getElementById("demoPrepareDialog").close();
      D.showToast(response.demo_prepare?.message || "デモデータを準備しました。");
      await runAllChecks();
    } catch (error) {
      document.getElementById("demoPrepareDialog").close();
      globalError(withRequest(error));
    } finally {
      button.disabled = false;
      button.textContent = "準備を実行";
    }
  }

  async function copyReport() {
    if (!lastReport) return;
    const text = JSON.stringify(lastReport, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      D.showToast("検査JSONをコピーしました。");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      D.showToast("検査JSONをコピーしました。");
    }
  }

  function downloadReport() {
    if (!lastReport) return;
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dpro-cosmetics-system-check-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    D.showToast("検査結果を保存しました。");
  }

  function renderFailure(error) {
    document.getElementById("systemCheckOverall").classList.remove("is-success");
    document.getElementById("systemCheckOverall").classList.add("is-failure");
    document.getElementById("systemCheckOverallIcon").textContent = "!";
    document.getElementById("systemCheckOverallTitle").textContent = "一括検査を完了できませんでした";
    document.getElementById("systemCheckOverallMessage").textContent = withRequest(error);
  }

  function stateIcon(state) {
    if (state === "pass") return "✓";
    if (state === "safe") return "盾";
    if (state === "warning") return "!";
    return "×";
  }

  function setRunButton(running) {
    const button = document.getElementById("runSystemCheckButton");
    button.disabled = running;
    button.textContent = running ? "検査しています…" : "一括検査を実行";
  }

  function enableReportButtons(enabled) {
    document.getElementById("copySystemCheckButton").disabled = !enabled;
    document.getElementById("downloadSystemCheckButton").disabled = !enabled;
  }

  function loading(show) {
    document.getElementById("systemCheckLoading").hidden = !show;
  }

  function globalError(message) {
    const node = document.getElementById("systemCheckGlobalError");
    node.textContent = message;
    node.hidden = !message;
  }

  function loginError(message) {
    const node = document.getElementById("systemCheckLoginError");
    node.textContent = message;
    node.hidden = !message;
  }

  function withRequest(error) {
    return error?.requestId
      ? `${error.message}（確認番号：${error.requestId}）`
      : error?.message || "エラーが発生しました。";
  }
})();
