(() => {
  "use strict";

  const D = window.DPRO;
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "dpro_cosmetics_owner_token";
  const STAFF_KEY = "dpro_cosmetics_ipad_staff_id";

  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let selectedStaff = sessionStorage.getItem(STAFF_KEY) || "";
  let bootstrap = { staff: [], products: [], samples: [], recent_customers: [] };
  let customer = null;
  let care = null;
  let searchResults = [];
  let toastTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bind();
    document.querySelectorAll("[data-query-link]").forEach((link) => {
      link.href = D.appendQuery(link.getAttribute("href"));
    });
    if (D.demoScenario) $("ipadCareCode").value = "1234";
    if (token) openApp().catch((error) => showLogin(errorMessage(error)));
  }

  function bind() {
    $("ipadCareLoginForm").addEventListener("submit", login);
    $("ipadCareToggle").addEventListener("click", () => {
      const input = $("ipadCareCode");
      input.type = input.type === "password" ? "text" : "password";
      $("ipadCareToggle").textContent = input.type === "password" ? "表示" : "隠す";
    });
    $("ipadCareClear").addEventListener("click", () => {
      $("ipadCareCode").value = "";
      $("ipadCareCode").focus();
    });
    $("ipadCareLogout").addEventListener("click", logout);
    $("ipadCareRefresh").addEventListener("click", refresh);
    $("ipadCareStaff").addEventListener("change", () => {
      selectedStaff = $("ipadCareStaff").value;
      sessionStorage.setItem(STAFF_KEY, selectedStaff);
      if (customer) renderCustomerHeader();
    });
    $("ipadCareSearchForm").addEventListener("submit", (event) => {
      event.preventDefault();
      searchCustomers();
    });
    document.querySelectorAll("[data-ipad-care-tab]").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.ipadCareTab));
    });
    document.querySelectorAll("[data-ipad-close]").forEach((button) => {
      button.addEventListener("click", () => $(button.dataset.ipadClose).close());
    });
    $("ipadCareAddActive").addEventListener("click", () => {
      if (!customer) return toast("お客様を選択してください。");
      $("ipadCareActiveForm").reset();
      $("ipadCareActiveStart").value = today();
      $("ipadCareActiveDays").value = 30;
      $("ipadCareActiveRemaining").value = "low";
      $("ipadCareActiveDialog").showModal();
    });
    $("ipadCareActiveForm").addEventListener("submit", saveActiveProduct);
    $("ipadCareRecommendForm").addEventListener("submit", saveRecommendation);
    $("ipadCareAddRecurring").addEventListener("click", () => {
      if (!customer) return toast("お客様を選択してください。");
      $("ipadCareRecurringForm").reset();
      $("ipadCareRecurringCycle").value = 30;
      $("ipadCareRecurringQty").value = 1;
      $("ipadCareRecurringDialog").showModal();
    });
    $("ipadCareRecurringForm").addEventListener("submit", saveRecurring);
    $("ipadCareSampleForm").addEventListener("submit", saveSampleEvaluation);
  }

  async function login(event) {
    event.preventDefault();
    loginError("");
    const code = $("ipadCareCode").value.trim();
    if (!code) return loginError("管理コードを入力してください。");

    const button = $("ipadCareLoginButton");
    button.disabled = true;
    button.textContent = "確認しています…";
    try {
      const response = await D.request("/owner/auth", {
        method: "POST",
        body: { management_code: code },
      });
      token = response.admin_token;
      sessionStorage.setItem(TOKEN_KEY, token);
      $("ipadCareCode").value = "";
      await openApp();
    } catch (error) {
      loginError(errorMessage(error));
    } finally {
      button.disabled = false;
      button.textContent = "継続接客を開く";
    }
  }

  async function adminRequest(path, body = {}) {
    try {
      return await D.request(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    } catch (error) {
      if (error.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        token = "";
        showLogin("管理者認証の有効期限が切れました。もう一度開いてください。");
      }
      throw error;
    }
  }

  async function openApp() {
    $("ipadCareLogin").hidden = true;
    $("ipadCareApp").hidden = false;
    await loadBase();
  }

  function showLogin(message = "") {
    $("ipadCareApp").hidden = true;
    $("ipadCareLogin").hidden = false;
    if (message) loginError(message);
  }

  function logout() {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  async function loadBase() {
    setLoading(true);
    clearError();
    try {
      let response = await adminRequest("/admin/ipad/bootstrap", {
        staff_id: selectedStaff || null,
        days: 7,
      });
      bootstrap = response.bootstrap || {};

      const validIds = new Set((bootstrap.staff || []).map((staff) => staff.id));
      if (!selectedStaff || !validIds.has(selectedStaff)) {
        selectedStaff = bootstrap.staff?.[0]?.id || "";
        if (selectedStaff) {
          sessionStorage.setItem(STAFF_KEY, selectedStaff);
          response = await adminRequest("/admin/ipad/bootstrap", {
            staff_id: selectedStaff,
            days: 7,
          });
          bootstrap = response.bootstrap || {};
        }
      }

      $("ipadCareStore").textContent = bootstrap.store?.store_name || "DPROコスメティックサロン";
      renderStaffSelect();
      populateProductSelects();
      renderRecentCustomers();
    } catch (error) {
      showError(errorMessage(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    await loadBase();
    if (customer) await selectCustomer(customer.id, false);
    toast("最新情報へ更新しました。");
  }

  function renderStaffSelect() {
    $("ipadCareStaff").innerHTML = (bootstrap.staff || []).map((staff) =>
      `<option value="${staff.id}" ${staff.id === selectedStaff ? "selected" : ""}>${escape(staff.display_name)}</option>`
    ).join("");
  }

  function populateProductSelects() {
    const options = '<option value="">商品を選択</option>' + (bootstrap.products || []).map((product) =>
      `<option value="${product.product_variant_id}">${escape(product.product_name)} ${escape(product.variant_name || "")}｜${D.formatYen(product.price_yen)}</option>`
    ).join("");
    ["ipadCareActiveVariant", "ipadCareRecVariant", "ipadCareRecurringVariant"].forEach((id) => {
      $(id).innerHTML = options;
    });
  }

  function renderRecentCustomers() {
    const items = bootstrap.recent_customers || [];
    $("ipadCareRecent").innerHTML = items.length ? items.map((item) => `
      <button class="crm-customer-button" data-ipad-select="${item.id}" type="button">
        <strong>${escape(item.full_name)}</strong>
        <span>${escape(item.customer_no)}</span>
        <small>最終購入 ${formatDate(item.last_purchase_at)}</small>
      </button>`).join("") : empty("最近のお客様はいません。");
    bindCustomerButtons($("ipadCareRecent"));
  }

  async function searchCustomers() {
    setLoading(true);
    clearError();
    try {
      const response = await adminRequest("/admin/ipad/customers/search", {
        query: $("ipadCareQuery").value.trim(),
        limit: 50,
      });
      searchResults = response.result?.customers || [];
      $("ipadCareSearchResults").innerHTML = searchResults.length ? searchResults.map((item) => `
        <button class="crm-customer-button" data-ipad-select="${item.id}" type="button">
          <strong>${escape(item.full_name)}</strong>
          <span>${escape(item.customer_no)}｜${escape(item.phone || "電話未登録")}</span>
          <small>購入 ${number(item.purchase_count)}件｜相談 ${number(item.counseling_count)}件</small>
        </button>`).join("") : empty("該当するお客様はいません。");
      bindCustomerButtons($("ipadCareSearchResults"));
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function bindCustomerButtons(scope) {
    scope.querySelectorAll("[data-ipad-select]").forEach((button) => {
      button.addEventListener("click", () => selectCustomer(button.dataset.ipadSelect));
    });
  }

  async function selectCustomer(customerId, showLoading = true) {
    if (showLoading) setLoading(true);
    clearError();
    try {
      let selected = searchResults.find((item) => item.id === customerId)
        || (bootstrap.recent_customers || []).find((item) => item.id === customerId);
      if (!selected) {
        const response = await adminRequest("/admin/ipad/customers/search", { query: "", limit: 100 });
        selected = (response.result?.customers || []).find((item) => item.id === customerId);
      }
      customer = selected || { id: customerId, full_name: "お客様", customer_no: "―" };
      care = await adminRequest("/admin/care/bootstrap", { customer_id: customerId, limit: 300 });
      $("ipadCareWorkbench").hidden = false;
      renderCustomerHeader();
      renderAll();
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function renderCustomerHeader() {
    $("ipadCareCustomerHead").innerHTML = `
      <h2>${escape(customer.full_name)} 様</h2>
      <p>${escape(customer.customer_no || "―")}｜${escape(customer.phone || "電話未登録")}｜操作 ${escape(staffName())}</p>`;
  }

  function renderAll() {
    renderActiveProducts();
    renderRepurchase();
    renderRecommendations();
    renderRecurring();
    renderSamples();
  }

  function switchTab(name) {
    document.querySelectorAll("[data-ipad-care-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.ipadCareTab === name);
    });
    const map = {
      active: "ipadCareActive",
      repurchase: "ipadCareRepurchase",
      recommend: "ipadCareRecommend",
      recurring: "ipadCareRecurring",
      samples: "ipadCareSamples",
    };
    Object.entries(map).forEach(([key, id]) => { $(id).hidden = key !== name; });
  }

  function renderActiveProducts() {
    const items = care?.active_products || [];
    $("ipadCareActiveList").innerHTML = items.length ? items.map((item) => {
      const variant = item.product_variant || {};
      const product = variant.product || {};
      const image = variant.media?.[0]?.public_url;
      return `<article class="crm-care-card">
        <div class="crm-care-product">
          <div class="crm-care-image">${image ? `<img src="${escape(image)}" alt="">` : '<div class="crm-placeholder">✦</div>'}</div>
          <div><span class="crm-chip success">${activeStatus(item.status)}</span><h3>${escape(product.product_name || "商品")}</h3><p>${escape(variant.variant_name || "")}</p></div>
        </div>
        <p>残量 ${remainingLabel(item.remaining_level)}｜使い切り ${formatDate(item.expected_finish_on)}</p>
        <div class="crm-record-actions">
          <button class="crm-btn secondary" data-active-action="low" data-active-id="${item.id}" type="button">残量少ない</button>
          <button class="crm-btn secondary" data-active-action="finished" data-active-id="${item.id}" type="button">使い切り</button>
        </div>
      </article>`;
    }).join("") : empty("使用中商品はありません。");

    $("ipadCareActiveList").querySelectorAll("[data-active-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const patch = button.dataset.activeAction === "low"
          ? { remaining_level: "low" }
          : { status: "finished", ended_on: today() };
        updateActiveProduct(button.dataset.activeId, patch);
      });
    });
  }

  async function saveActiveProduct(event) {
    event.preventDefault();
    if (!customer) return toast("お客様を選択してください。");
    const variantId = $("ipadCareActiveVariant").value;
    if (!variantId) return toast("商品を選択してください。");

    setLoading(true);
    try {
      await adminRequest("/admin/active-products/upsert", {
        customer_id: customer.id,
        product_variant_id: variantId,
        source: "staff_entry",
        opened_on: nullable($("ipadCareActiveStart").value),
        started_on: nullable($("ipadCareActiveStart").value),
        expected_days: Number($("ipadCareActiveDays").value || 30),
        remaining_level: $("ipadCareActiveRemaining").value,
        use_frequency: nullable($("ipadCareActiveFrequency").value),
        status: "using",
        started_by_staff_id: selectedStaff || null,
      });
      await selectCustomer(customer.id, false);
      $("ipadCareActiveDialog").close();
      toast("使用中商品を登録しました。");
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateActiveProduct(activeProductId, patch) {
    setLoading(true);
    try {
      await adminRequest("/admin/active-products/update", { active_product_id: activeProductId, ...patch });
      await selectCustomer(customer.id, false);
      toast("使用中商品を更新しました。");
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function renderRepurchase() {
    const items = care?.repurchase_priority || [];
    $("ipadCareRepurchaseList").innerHTML = items.length ? items.map((item) => `
      <article class="crm-care-card">
        <span class="crm-chip ${["overdue", "today"].includes(item.urgency_group) ? "warning" : "success"}">${urgencyLabel(item.urgency_group)}</span>
        <h3>${escape(item.product_name)}</h3>
        <p>連絡 ${formatDate(item.next_contact_on)}｜残量 ${remainingLabel(item.remaining_level)}</p>
        <div class="crm-record-actions">
          <button class="crm-btn secondary" data-plan-action="contacted" data-plan-id="${item.repurchase_plan_id}" type="button">連絡済み</button>
          <button class="crm-btn soft" data-plan-action="hold_requested" data-plan-id="${item.repurchase_plan_id}" type="button">取り置き</button>
          <button class="crm-btn primary" data-plan-action="repurchased" data-plan-id="${item.repurchase_plan_id}" type="button">再購入済み</button>
        </div>
      </article>`).join("") : empty("再購入目安はありません。");

    $("ipadCareRepurchaseList").querySelectorAll("[data-plan-action]").forEach((button) => {
      button.addEventListener("click", () => updateRepurchase(button.dataset.planId, button.dataset.planAction));
    });
  }

  async function updateRepurchase(planId, action) {
    setLoading(true);
    try {
      const body = { repurchase_plan_id: planId };
      if (action === "contacted") body.contact_status = "contacted";
      else body.status = action;
      await adminRequest("/admin/repurchase/update", body);
      await selectCustomer(customer.id, false);
      toast("再購入予定を更新しました。自動LINE送信はしていません。");
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function renderRecommendations() {
    const items = care?.recommendations || [];
    $("ipadCareRecommendationList").innerHTML = items.length ? items.map((item) => `
      <article class="crm-card crm-record">
        <div class="crm-record-head"><h3>${escape(item.title)}</h3><span class="crm-chip ${item.status === "published" ? "success" : ""}">${recommendationStatus(item.status)}</span></div>
        <p>${escape(item.customer_message || "")}</p>
      </article>`).join("") : empty("おすすめはまだありません。");
  }

  async function saveRecommendation(event) {
    event.preventDefault();
    if (!customer) return toast("お客様を選択してください。");
    const variantId = $("ipadCareRecVariant").value;
    if (!variantId) return toast("商品を選択してください。");

    setLoading(true);
    try {
      const response = await adminRequest("/admin/recommendations/create", {
        customer_id: customer.id,
        title: "本日のおすすめ",
        customer_message: nullable($("ipadCareRecMessage").value),
        created_by_staff_id: selectedStaff || null,
        status: "published",
        expires_days: 90,
        items: [{
          product_variant_id: variantId,
          recommendation_reason: nullable($("ipadCareRecReason").value),
          action_type: "hold_or_consult",
        }],
      });
      if (response.share_url) {
        await copyText(response.share_url);
        toast("共有URLをコピーしました。LINEへ貼り付けられます。");
      } else {
        toast("公開しました。PUBLIC_APP_URLを設定すると共有URLを発行できます。");
      }
      await selectCustomer(customer.id, false);
      $("ipadCareRecommendForm").reset();
      populateProductSelects();
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function renderRecurring() {
    const items = care?.recurring_preferences || [];
    $("ipadCareRecurringList").innerHTML = items.length ? items.map((item) => {
      const variant = item.product_variant || {};
      const product = variant.product || {};
      return `<article class="crm-care-card">
        <span class="crm-chip ${item.status === "active" ? "success" : ""}">${recurringStatus(item.status)}</span>
        <h3>${escape(product.product_name || "商品")}</h3>
        <p>${number(item.cycle_days)}日ごと｜${number(item.quantity)}点｜次回 ${formatDate(item.next_confirmation_on)}</p>
        <div class="crm-record-actions">
          <button class="crm-btn secondary" data-recurring-status="paused" data-recurring-id="${item.id}" type="button">停止</button>
          <button class="crm-btn primary" data-recurring-status="active" data-recurring-id="${item.id}" type="button">再開</button>
        </div>
      </article>`;
    }).join("") : empty("定期購入希望はありません。");

    $("ipadCareRecurringList").querySelectorAll("[data-recurring-status]").forEach((button) => {
      button.addEventListener("click", () => updateRecurring(button.dataset.recurringId, button.dataset.recurringStatus));
    });
  }

  async function saveRecurring(event) {
    event.preventDefault();
    if (!customer) return toast("お客様を選択してください。");
    const variantId = $("ipadCareRecurringVariant").value;
    if (!variantId) return toast("商品を選択してください。");

    setLoading(true);
    try {
      await adminRequest("/admin/recurring/upsert", {
        customer_id: customer.id,
        product_variant_id: variantId,
        cycle_days: Number($("ipadCareRecurringCycle").value || 30),
        quantity: Number($("ipadCareRecurringQty").value || 1),
        fulfillment_mode: $("ipadCareRecurringMode").value,
        assigned_staff_id: selectedStaff || null,
        explicit_customer_consent: false,
      });
      await selectCustomer(customer.id, false);
      $("ipadCareRecurringDialog").close();
      toast("定期購入希望を登録しました。");
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateRecurring(preferenceId, status) {
    setLoading(true);
    try {
      await adminRequest("/admin/recurring/update", { preference_id: preferenceId, status });
      await selectCustomer(customer.id, false);
      toast("定期購入希望を更新しました。");
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function renderSamples() {
    const sampleMap = new Map((bootstrap.samples || []).map((item) => [item.sample_id, item.sample_name]));
    const items = care?.sample_followups || [];
    $("ipadCareSampleList").innerHTML = items.length ? items.map((item) => `
      <article class="crm-care-card">
        <span class="crm-chip">${sampleEvaluation(item.customer_evaluation)}</span>
        <h3>${escape(sampleMap.get(item.sample_id) || "サンプル")}</h3>
        <p>配布 ${formatDate(item.distributed_at)}｜確認 ${formatDate(item.followup_due_at)}</p>
        <p>意向 ${sampleIntent(item.purchase_intent)}</p>
        <button class="crm-btn primary" data-sample-id="${item.id}" type="button">結果を記録</button>
      </article>`).join("") : empty("サンプル履歴はありません。");

    $("ipadCareSampleList").querySelectorAll("[data-sample-id]").forEach((button) => {
      button.addEventListener("click", () => openSampleDialog(button.dataset.sampleId));
    });
  }

  function openSampleDialog(distributionId) {
    const item = (care?.sample_followups || []).find((entry) => entry.id === distributionId);
    if (!item) return;
    $("ipadCareSampleId").value = distributionId;
    $("ipadCareSampleUsage").value = item.usage_status || "unknown";
    $("ipadCareSampleEval").value = item.customer_evaluation || "unknown";
    $("ipadCareSampleIntent").value = item.purchase_intent || "unknown";
    $("ipadCareSampleNote").value = item.feedback_note || "";
    $("ipadCareSampleDialog").showModal();
  }

  async function saveSampleEvaluation(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await adminRequest("/admin/samples/evaluate", {
        sample_distribution_id: $("ipadCareSampleId").value,
        usage_status: $("ipadCareSampleUsage").value,
        customer_evaluation: $("ipadCareSampleEval").value,
        purchase_intent: $("ipadCareSampleIntent").value,
        feedback_note: nullable($("ipadCareSampleNote").value),
      });
      await selectCustomer(customer.id, false);
      $("ipadCareSampleDialog").close();
      toast("サンプル結果を記録しました。");
    } catch (error) {
      showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function staffName() {
    return (bootstrap.staff || []).find((staff) => staff.id === selectedStaff)?.display_name || "未選択";
  }
  function escape(value) { return D.escapeHtml(value ?? ""); }
  function number(value) { return new Intl.NumberFormat("ja-JP").format(Number(value || 0)); }
  function formatDate(value) { return value ? (D.formatDate ? D.formatDate(value) : D.formatDateTime(value, { dateOnly: true })) : "―"; }
  function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  function nullable(value) { const text = String(value ?? "").trim(); return text || null; }
  function empty(message) { return `<div class="crm-empty">${escape(message)}</div>`; }
  function remainingLabel(value) { return ({ full: "満量", high: "多い", half: "半分", low: "少ない", empty: "なし", unknown: "不明" })[value] || value || "不明"; }
  function activeStatus(value) { return ({ not_started: "未使用", using: "使用中", paused: "一時停止", finished: "使い切り", repurchased: "再購入済み", stopped: "中止" })[value] || value; }
  function urgencyLabel(value) { return ({ overdue: "期限超過", today: "本日", within_7_days: "7日以内", future: "今後", date_unknown: "未定" })[value] || value; }
  function recommendationStatus(value) { return ({ draft: "下書き", published: "公開中", closed: "終了", expired: "期限切れ", cancelled: "取消" })[value] || value; }
  function recurringStatus(value) { return ({ active: "有効", paused: "停止", skipped: "スキップ", ended: "終了" })[value] || value; }
  function sampleEvaluation(value) { return ({ unknown: "未確認", positive: "好感触", neutral: "普通", negative: "合わなかった", unsuitable: "使用中止" })[value] || value; }
  function sampleIntent(value) { return ({ unknown: "未確認", considering: "検討中", want_to_buy: "購入希望", purchased: "購入済み", not_now: "保留", declined: "購入しない" })[value] || value; }
  function setLoading(show) { $("ipadCareLoading").hidden = !show; }
  function clearError() { showError(""); }
  function showError(message) { $("ipadCareError").textContent = message; $("ipadCareError").hidden = !message; }
  function loginError(message) { $("ipadCareLoginError").textContent = message; $("ipadCareLoginError").hidden = !message; }
  function errorMessage(error) { return error?.requestId ? `${error.message}（確認番号：${error.requestId}）` : error?.message || "エラーが発生しました。"; }
  function toast(message) {
    const node = $("crmToast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }
})();
