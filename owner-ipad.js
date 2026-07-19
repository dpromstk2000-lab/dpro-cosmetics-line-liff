(() => {
  "use strict";

  const D = window.DPRO;
  const TOKEN_KEY = "dpro_cosmetics_owner_token";
  const STAFF_KEY = "dpro_cosmetics_ipad_staff_id";
  const viewNames = ["appointments", "customers", "followups"];

  const reservationLabels = {
    requested: "予約依頼",
    confirmed: "予約確定",
    checked_in: "来店済み",
    in_service: "対応中",
    completed: "完了",
    cancelled: "キャンセル",
    no_show: "無断キャンセル",
  };
  const followupLabels = {
    open: "未対応",
    scheduled: "予定",
    contacted: "連絡済み",
    waiting: "返信待ち",
    completed: "完了",
    cancelled: "キャンセル",
    not_needed: "対応不要",
  };
  const priorityLabels = { low: "低", normal: "通常", high: "高", urgent: "至急" };
  const recommendationLabels = {
    suggested: "提案",
    purchased: "購入",
    sampled: "サンプル",
    declined: "見送り",
  };

  let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
  let selectedStaffId = sessionStorage.getItem(STAFF_KEY) || "";
  let bootstrap = null;
  let currentDetail = null;
  let currentView = "appointments";
  let pendingConfirm = null;
  let pendingSample = null;
  let recommendations = [];
  let purchaseItems = [];
  let sampleItems = [];
  let sessionSaving = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindEvents();
    setDefaultDateTimes();
    if (D.demoScenario) document.getElementById("ipadManagementCode").value = "1234";

    if (adminToken) {
      openIpadApp().catch((error) => {
        clearAuth();
        showLoginView(withRequestId(error));
      });
    }
  }

  function bindEvents() {
    document.getElementById("ipadLoginForm").addEventListener("submit", login);
    document.getElementById("ipadToggleCode").addEventListener("click", toggleCode);
    document.getElementById("ipadClearCode").addEventListener("click", clearCode);
    document.getElementById("ipadLogoutButton").addEventListener("click", logout);
    document.getElementById("ipadRefreshButton").addEventListener("click", refreshCurrentView);
    document.getElementById("ipadStaffSelect").addEventListener("change", changeStaff);

    document.querySelectorAll("[data-ipad-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.ipadView));
    });
    document.querySelectorAll("[data-jump-ipad-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.jumpIpadView));
    });

    document.getElementById("ipadCustomerSearchForm").addEventListener("submit", (event) => {
      event.preventDefault();
      loadCustomers();
    });
    document.getElementById("ipadCustomerSearchClear").addEventListener("click", () => {
      document.getElementById("ipadCustomerSearchInput").value = "";
      loadCustomers();
    });

    document.getElementById("ipadSessionClose").addEventListener("click", closeSession);
    document.getElementById("ipadSessionForm").addEventListener("submit", saveSession);
    document.getElementById("ipadAddRecommendation").addEventListener("click", addRecommendation);
    document.getElementById("ipadAddPurchase").addEventListener("click", addPurchase);
    document.getElementById("ipadAddSample").addEventListener("click", openSampleConfirmation);
    document.getElementById("ipadFollowupEnabled").addEventListener("change", toggleFollowupFields);

    document.getElementById("ipadRepeatSampleCancel").addEventListener("click", () => addPendingSample(false));
    document.getElementById("ipadRepeatSampleConfirm").addEventListener("click", () => addPendingSample(true));

    document.getElementById("ipadConfirmCancel").addEventListener("click", closeConfirm);
    document.getElementById("ipadConfirmExecute").addEventListener("click", executeConfirm);
  }

  async function login(event) {
    event.preventDefault();
    hideLoginError();
    const code = document.getElementById("ipadManagementCode").value.trim();
    if (!code) return showLoginError("管理コードを入力してください。");

    const button = document.getElementById("ipadLoginButton");
    button.disabled = true;
    button.textContent = "確認しています…";
    try {
      const result = await D.request("/owner/auth", {
        method: "POST",
        body: { management_code: code },
      });
      adminToken = result.admin_token;
      sessionStorage.setItem(TOKEN_KEY, adminToken);
      document.getElementById("ipadManagementCode").value = "";
      await openIpadApp();
    } catch (error) {
      showLoginError(withRequestId(error));
    } finally {
      button.disabled = false;
      button.textContent = "iPad画面を開く";
    }
  }

  async function openIpadApp() {
    document.getElementById("ipadLoginView").hidden = true;
    document.getElementById("ipadAppView").hidden = false;
    await loadBootstrap();
  }

  function showLoginView(message = "") {
    document.getElementById("ipadAppView").hidden = true;
    document.getElementById("ipadLoginView").hidden = false;
    if (message) showLoginError(message);
  }

  function logout() {
    clearAuth();
    window.location.reload();
  }

  function clearAuth() {
    adminToken = "";
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function toggleCode() {
    const input = document.getElementById("ipadManagementCode");
    const button = document.getElementById("ipadToggleCode");
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "表示" : "隠す";
    button.setAttribute("aria-label", input.type === "password" ? "管理コードを表示" : "管理コードを隠す");
  }

  function clearCode() {
    const input = document.getElementById("ipadManagementCode");
    input.value = "";
    input.focus();
  }

  async function ipadRequest(path, body = {}) {
    try {
      return await D.request(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        body,
      });
    } catch (error) {
      if (error.status === 401) {
        clearAuth();
        showLoginView("管理者認証の有効期限が切れました。管理コードを入力し直してください。");
      }
      throw error;
    }
  }

  async function loadBootstrap() {
    setLoading(true);
    clearGlobalError();
    try {
      let response = await ipadRequest("/admin/ipad/bootstrap", {
        staff_id: selectedStaffId || null,
        days: 7,
      });
      bootstrap = response.bootstrap;

      const validStaffIds = new Set((bootstrap.staff || []).map((staff) => staff.id));
      if (!selectedStaffId || !validStaffIds.has(selectedStaffId)) {
        selectedStaffId = bootstrap.staff?.[0]?.id || "";
        if (selectedStaffId) {
          sessionStorage.setItem(STAFF_KEY, selectedStaffId);
          response = await ipadRequest("/admin/ipad/bootstrap", { staff_id: selectedStaffId, days: 7 });
          bootstrap = response.bootstrap;
        }
      }

      renderBootstrap();
    } catch (error) {
      showGlobalError(withRequestId(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }

  function renderBootstrap() {
    document.getElementById("ipadStoreName").textContent = bootstrap.store?.store_name || "DPROコスメティックサロン";
    renderStaffSelect();
    renderSummary();
    renderAppointments();
    renderRecentCustomers();
    renderFollowups();
    populateProductSelects();
    populateSampleSelect();
  }

  function renderStaffSelect() {
    const select = document.getElementById("ipadStaffSelect");
    select.innerHTML = (bootstrap.staff || []).map((staff) =>
      `<option value="${staff.id}" ${staff.id === selectedStaffId ? "selected" : ""}>${D.escapeHtml(staff.display_name)}（${roleLabel(staff.role)}）</option>`
    ).join("");
  }

  function renderSummary() {
    const counts = bootstrap.counts || {};
    const selected = (bootstrap.staff || []).find((staff) => staff.id === selectedStaffId);
    document.getElementById("ipadSummaryCards").innerHTML = [
      ["担当", selected?.display_name || "未選択"],
      ["本日の相談", `${number(counts.today_reservations)}件`],
      ["近日の相談", `${number(counts.upcoming_reservations)}件`],
      ["フォロー", `${number(counts.due_followups)}件`],
    ].map(([label, value]) =>
      `<div class="ipad-summary-card"><small>${D.escapeHtml(label)}</small><strong>${D.escapeHtml(value)}</strong></div>`
    ).join("");
  }

  function renderAppointments() {
    const list = document.getElementById("ipadAppointmentList");
    const reservations = bootstrap.reservations || [];
    if (!reservations.length) {
      list.innerHTML = emptyCard("本日から7日以内の美容相談はありません。顧客検索から店頭接客を開始できます。");
      return;
    }

    list.innerHTML = reservations.map((reservation) => `
      <article class="card ipad-work-card">
        <div class="ipad-work-card-head">
          <div>
            <span class="status-pill status-${reservation.status}">${D.escapeHtml(reservationLabels[reservation.status] || reservation.status)}</span>
            <h2>${D.escapeHtml(reservation.full_name)}</h2>
            <p>${D.formatDateTime(reservation.start_at)}｜${D.escapeHtml(reservation.menu_name)}</p>
          </div>
          <div class="ipad-time-badge">${formatTime(reservation.start_at)}</div>
        </div>
        <div class="ipad-work-meta">
          <span>担当 <strong>${D.escapeHtml(reservation.staff_name || "未定")}</strong></span>
          <span>顧客番号 <strong>${D.escapeHtml(reservation.customer_no)}</strong></span>
          <span>電話 <strong>${D.escapeHtml(reservation.phone || "未登録")}</strong></span>
        </div>
        ${reservation.consultation_request ? `<div class="ipad-work-note">ご相談：${D.escapeHtml(reservation.consultation_request)}</div>` : ""}
        <button class="btn primary ipad-work-action" type="button"
          data-start-session-customer="${reservation.customer_id}"
          data-start-session-reservation="${reservation.id}">接客を開く</button>
      </article>
    `).join("");

    bindSessionButtons(list);
  }

  function renderRecentCustomers() {
    const container = document.getElementById("ipadRecentCustomers");
    const customers = bootstrap.recent_customers || [];
    if (!customers.length) {
      container.innerHTML = emptyInline("最近の顧客はありません。");
      return;
    }
    container.innerHTML = customers.map((customer) => `
      <button class="ipad-customer-chip" type="button" data-start-session-customer="${customer.id}">
        <strong>${D.escapeHtml(customer.full_name)}</strong>
        <span>${D.escapeHtml(customer.customer_no)}</span>
        <small>最終購入 ${D.formatDateTime(customer.last_purchase_at, { dateOnly: true })}</small>
      </button>
    `).join("");
    bindSessionButtons(container);
  }

  async function loadCustomers() {
    setLoading(true);
    clearGlobalError();
    try {
      const query = document.getElementById("ipadCustomerSearchInput").value.trim();
      const response = await ipadRequest("/admin/ipad/customers/search", { query, limit: 50 });
      renderCustomers(response.result?.customers || []);
    } catch (error) {
      showGlobalError(withRequestId(error));
    } finally {
      setLoading(false);
    }
  }

  function renderCustomers(customers) {
    const container = document.getElementById("ipadCustomerResults");
    if (!customers.length) {
      container.innerHTML = emptyCard("該当する顧客が見つかりません。");
      return;
    }
    container.innerHTML = customers.map((customer) => `
      <article class="card ipad-work-card">
        <div class="ipad-work-card-head">
          <div>
            <span class="status-pill status-active">会員</span>
            <h2>${D.escapeHtml(customer.full_name)}</h2>
            <p>${D.escapeHtml(customer.customer_no)}｜${D.escapeHtml(customer.phone || "電話未登録")}</p>
          </div>
          <div class="ipad-avatar">${D.escapeHtml(customer.full_name.slice(0, 1))}</div>
        </div>
        <div class="ipad-work-meta">
          <span>最終来店 <strong>${D.formatDateTime(customer.last_visit_at, { dateOnly: true })}</strong></span>
          <span>最終購入 <strong>${D.formatDateTime(customer.last_purchase_at, { dateOnly: true })}</strong></span>
          <span>購入 <strong>${number(customer.purchase_count)}件</strong></span>
          <span>相談 <strong>${number(customer.counseling_count)}件</strong></span>
        </div>
        <button class="btn primary ipad-work-action" type="button"
          data-start-session-customer="${customer.id}">このお客様の接客を開始</button>
      </article>
    `).join("");
    bindSessionButtons(container);
  }

  function renderFollowups() {
    const container = document.getElementById("ipadFollowupList");
    const followups = bootstrap.followups || [];
    if (!followups.length) {
      container.innerHTML = emptyCard("近日のフォロー予定はありません。");
      return;
    }

    container.innerHTML = followups.map((task) => `
      <article class="card ipad-work-card ${task.priority === "urgent" ? "urgent-card" : ""}">
        <div class="ipad-work-card-head">
          <div>
            <span class="status-pill status-${task.status}">${D.escapeHtml(followupLabels[task.status] || task.status)}</span>
            <span class="priority-pill priority-${task.priority}">優先度 ${D.escapeHtml(priorityLabels[task.priority] || task.priority)}</span>
            <h2>${D.escapeHtml(task.full_name)}</h2>
            <p>${D.formatDateTime(task.due_at)}｜${D.escapeHtml(task.subject)}</p>
          </div>
          <div class="ipad-time-badge">🔔</div>
        </div>
        ${task.note ? `<div class="ipad-work-note">${D.escapeHtml(task.note)}</div>` : ""}
        <div class="ipad-work-meta">
          <span>連絡方法 <strong>${contactLabel(task.contact_channel)}</strong></span>
          <span>担当 <strong>${D.escapeHtml(task.staff_name || "未設定")}</strong></span>
          <span>電話 <strong>${D.escapeHtml(task.phone || "未登録")}</strong></span>
        </div>
        <div class="ipad-action-grid">
          <button class="btn secondary" type="button"
            data-start-session-customer="${task.customer_id}">顧客履歴を開く</button>
          <button class="btn secondary" type="button"
            data-followup-id="${task.id}" data-followup-status="contacted"
            data-followup-name="${D.escapeHtml(task.full_name)}">連絡済みにする</button>
          <button class="btn primary" type="button"
            data-followup-id="${task.id}" data-followup-status="completed"
            data-followup-name="${D.escapeHtml(task.full_name)}">完了にする</button>
        </div>
      </article>
    `).join("");

    bindSessionButtons(container);
    container.querySelectorAll("[data-followup-status]").forEach((button) => {
      button.addEventListener("click", () => confirmFollowupUpdate(button));
    });
  }

  function bindSessionButtons(scope) {
    scope.querySelectorAll("[data-start-session-customer]").forEach((button) => {
      button.addEventListener("click", () => openSession(
        button.dataset.startSessionCustomer,
        button.dataset.startSessionReservation || null,
      ));
    });
  }

  async function openSession(customerId, reservationId = null) {
    if (!selectedStaffId) {
      return showGlobalError("操作スタッフを選択してください。");
    }
    setLoading(true);
    clearGlobalError();
    try {
      const response = await ipadRequest("/admin/ipad/customers/detail", {
        customer_id: customerId,
        staff_id: selectedStaffId,
      });
      currentDetail = response.detail;
      resetSessionState();
      renderSessionDetail(currentDetail, reservationId);
      document.getElementById("ipadSessionDialog").showModal();
    } catch (error) {
      showGlobalError(withRequestId(error));
    } finally {
      setLoading(false);
    }
  }

  function renderSessionDetail(detail, reservationId) {
    const customer = detail.customer || {};
    const preferences = detail.preferences || {};

    document.getElementById("ipadSessionCustomerId").value = customer.id || "";
    document.getElementById("ipadSessionReservationId").value = reservationId || "";
    document.getElementById("ipadSessionCustomerName").textContent = `${customer.full_name || "お客様"} 様`;
    document.getElementById("ipadSessionCustomerMeta").textContent =
      `${customer.customer_no || "―"}｜${customer.phone || "電話未登録"}｜担当 ${customer.assigned_staff_name || "未設定"}`;

    document.getElementById("ipadCustomerDefinition").innerHTML = [
      ["顧客番号", customer.customer_no],
      ["電話番号", customer.phone],
      ["最終来店", D.formatDateTime(customer.last_visit_at, { dateOnly: true })],
      ["最終購入", D.formatDateTime(customer.last_purchase_at, { dateOnly: true })],
      ["担当者", customer.assigned_staff_name || "未設定"],
    ].map(([label, value]) =>
      `<dt>${D.escapeHtml(label)}</dt><dd>${D.escapeHtml(value || "―")}</dd>`
    ).join("");

    document.getElementById("ipadPreferenceSummary").innerHTML = [
      ["肌の悩み", (preferences.skin_concerns || []).join("、")],
      ["敏感さ", preferences.sensitivity_self_report],
      ["使用中商品", preferences.current_products],
      ["使用感", preferences.texture_preferences],
      ["香り", preferences.fragrance_preferences],
      ["色味", preferences.color_preferences],
      ["合わなかった商品", preferences.previously_unsuitable_products],
    ].map(([label, value]) =>
      `<div class="ipad-history-row"><strong>${D.escapeHtml(label)}</strong><span>${D.escapeHtml(value || "未登録")}</span></div>`
    ).join("");

    const notes = detail.notes || [];
    document.getElementById("ipadInternalNotes").innerHTML = notes.length
      ? notes.map((note) => `
          <div class="ipad-note ${note.sensitivity === "restricted" ? "restricted" : ""}">
            <strong>${D.escapeHtml(note.note_type)}</strong>
            <p>${D.escapeHtml(note.note_text)}</p>
            <small>${D.formatDateTime(note.created_at)}｜${D.escapeHtml(note.created_by_name || "")}</small>
          </div>`).join("")
      : emptyInline(detail.can_view_sensitive_notes ? "内部メモはありません。" : "閲覧できる内部メモはありません。");

    const purchases = detail.purchases || [];
    document.getElementById("ipadPurchaseHistory").innerHTML = purchases.length
      ? purchases.map((purchase) => `
          <div class="ipad-history-row">
            <strong>${D.formatDateTime(purchase.purchased_at, { dateOnly: true })}｜${D.formatYen(purchase.total_yen)}</strong>
            <span>${D.escapeHtml((purchase.items || []).map((item) => `${item.product_name} ${item.variant_name || ""}×${item.quantity}`).join("、"))}</span>
          </div>`).join("")
      : emptyInline("購入履歴はありません。");

    const counseling = detail.counseling || [];
    const samples = detail.samples || [];
    document.getElementById("ipadServiceHistory").innerHTML = [
      ...counseling.slice(0, 3).map((record) => `
        <div class="ipad-history-row">
          <strong>${D.formatDateTime(record.counseled_at)}｜相談</strong>
          <span>${D.escapeHtml(record.public_summary || record.customer_request || "記録あり")}</span>
        </div>`),
      ...samples.slice(0, 3).map((sample) => `
        <div class="ipad-history-row">
          <strong>${D.formatDateTime(sample.distributed_at, { dateOnly: true })}｜サンプル</strong>
          <span>${D.escapeHtml(sample.sample_name)}×${number(sample.quantity)}</span>
        </div>`),
    ].join("") || emptyInline("相談・サンプル履歴はありません。");

    document.getElementById("ipadCurrentProducts").value = preferences.current_products || "";
    document.getElementById("ipadPreferredTexture").value = preferences.texture_preferences || "";
    document.getElementById("ipadPreferredFragrance").value = preferences.fragrance_preferences || "";
    document.getElementById("ipadColorPreference").value = preferences.color_preferences || "";
    document.getElementById("ipadUnsuitableProducts").value = preferences.previously_unsuitable_products || "";
    document.getElementById("ipadCompleteReservation").checked = Boolean(reservationId);
  }

  function resetSessionState() {
    recommendations = [];
    purchaseItems = [];
    sampleItems = [];
    pendingSample = null;
    document.getElementById("ipadSessionForm").reset();
    document.getElementById("ipadCompleteReservation").checked = true;
    document.getElementById("ipadFollowupEnabled").checked = false;
    document.getElementById("ipadFollowupFields").hidden = true;
    document.getElementById("ipadSessionError").hidden = true;
    document.getElementById("ipadSessionError").textContent = "";
    setDefaultDateTimes();
    renderRecommendationList();
    renderPurchaseList();
    renderSampleList();
  }

  function closeSession() {
    if (sessionSaving) return;
    document.getElementById("ipadSessionDialog").close();
    currentDetail = null;
  }

  function populateProductSelects() {
    const options = (bootstrap.products || []).map((product) =>
      `<option value="${product.product_variant_id}">${D.escapeHtml(product.brand_name || "")} ${D.escapeHtml(product.product_name)} ${D.escapeHtml(product.variant_name || "")}｜${D.formatYen(product.price_yen)}</option>`
    ).join("");
    document.getElementById("ipadRecommendationProduct").innerHTML = `<option value="">商品を選択</option>${options}`;
    document.getElementById("ipadPurchaseProduct").innerHTML = `<option value="">商品を選択</option>${options}`;
  }

  function populateSampleSelect() {
    const options = (bootstrap.samples || []).map((sample) =>
      `<option value="${sample.sample_id}">${D.escapeHtml(sample.sample_name)}</option>`
    ).join("");
    document.getElementById("ipadSampleSelect").innerHTML = `<option value="">サンプルを選択</option>${options}`;
  }

  function addRecommendation() {
    const productVariantId = document.getElementById("ipadRecommendationProduct").value;
    if (!productVariantId) return D.showToast("提案商品を選択してください。");
    if (recommendations.some((item) => item.product_variant_id === productVariantId)) {
      return D.showToast("同じ商品はすでに提案へ追加されています。");
    }
    recommendations.push({
      product_variant_id: productVariantId,
      recommendation_type: document.getElementById("ipadRecommendationType").value,
      reason: document.getElementById("ipadRecommendationReason").value.trim(),
    });
    document.getElementById("ipadRecommendationReason").value = "";
    renderRecommendationList();
  }

  function renderRecommendationList() {
    const container = document.getElementById("ipadRecommendationList");
    if (!recommendations.length) {
      container.innerHTML = emptyInline("提案商品はまだありません。");
      return;
    }
    container.innerHTML = recommendations.map((item, index) => {
      const product = productById(item.product_variant_id);
      return `
        <div class="ipad-selected-item">
          <div><strong>${D.escapeHtml(productLabel(product))}</strong><span>${D.escapeHtml(recommendationLabels[item.recommendation_type])}${item.reason ? `｜${D.escapeHtml(item.reason)}` : ""}</span></div>
          <button class="icon-button small-icon" type="button" data-remove-recommendation="${index}" aria-label="提案商品を削除">×</button>
        </div>`;
    }).join("");
    container.querySelectorAll("[data-remove-recommendation]").forEach((button) => {
      button.addEventListener("click", () => {
        recommendations.splice(Number(button.dataset.removeRecommendation), 1);
        renderRecommendationList();
      });
    });
  }

  function addPurchase() {
    const productVariantId = document.getElementById("ipadPurchaseProduct").value;
    if (!productVariantId) return D.showToast("購入商品を選択してください。");
    if (purchaseItems.some((item) => item.product_variant_id === productVariantId)) {
      return D.showToast("同じ商品は購入一覧に追加済みです。");
    }
    const product = productById(productVariantId);
    purchaseItems.push({
      product_variant_id: productVariantId,
      quantity: clampClientInteger(document.getElementById("ipadPurchaseQuantity").value, 1, 99),
      unit_price_yen: Number(product?.price_yen || 0),
      discount_yen: clampClientInteger(document.getElementById("ipadPurchaseDiscount").value, 0, 100000000),
    });
    document.getElementById("ipadPurchaseQuantity").value = "1";
    document.getElementById("ipadPurchaseDiscount").value = "0";
    renderPurchaseList();
  }

  function renderPurchaseList() {
    const container = document.getElementById("ipadPurchaseList");
    if (!purchaseItems.length) {
      container.innerHTML = emptyInline("購入商品はまだありません。");
      document.getElementById("ipadPurchaseTotal").textContent = "0円";
      return;
    }
    let total = 0;
    container.innerHTML = purchaseItems.map((item, index) => {
      const product = productById(item.product_variant_id);
      const lineTotal = Math.max(0, item.unit_price_yen * item.quantity - item.discount_yen);
      total += lineTotal;
      return `
        <div class="ipad-selected-item">
          <div><strong>${D.escapeHtml(productLabel(product))}</strong><span>${item.quantity}点｜${D.formatYen(lineTotal)}${item.discount_yen ? `（値引 ${D.formatYen(item.discount_yen)}）` : ""}</span></div>
          <button class="icon-button small-icon" type="button" data-remove-purchase="${index}" aria-label="購入商品を削除">×</button>
        </div>`;
    }).join("");
    document.getElementById("ipadPurchaseTotal").textContent = D.formatYen(total);
    container.querySelectorAll("[data-remove-purchase]").forEach((button) => {
      button.addEventListener("click", () => {
        purchaseItems.splice(Number(button.dataset.removePurchase), 1);
        renderPurchaseList();
      });
    });
  }

  function openSampleConfirmation() {
    const sampleId = document.getElementById("ipadSampleSelect").value;
    if (!sampleId) return D.showToast("サンプルを選択してください。");
    if (sampleItems.some((item) => item.sample_id === sampleId)) {
      return D.showToast("同じサンプルは追加済みです。");
    }
    pendingSample = {
      sample_id: sampleId,
      quantity: clampClientInteger(document.getElementById("ipadSampleQuantity").value, 1, 20),
      purpose: document.getElementById("ipadSamplePurpose").value.trim(),
      followup_due_at: toIsoOrNull(document.getElementById("ipadSampleFollowup").value),
      allow_repeat: false,
      repeat_reason: null,
    };

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentlyProvided = (currentDetail?.samples || []).some((sample) =>
      sample.sample_id === sampleId &&
      new Date(sample.distributed_at).getTime() >= thirtyDaysAgo
    );

    if (!recentlyProvided) {
      addPendingSample(false);
      return;
    }

    document.getElementById("ipadRepeatSampleReason").value = "";
    document.getElementById("ipadRepeatSampleDialog").showModal();
  }

  function addPendingSample(asRepeat) {
    if (!pendingSample) return;
    if (asRepeat) {
      const reason = document.getElementById("ipadRepeatSampleReason").value.trim();
      if (!reason) return D.showToast("再提供理由を入力してください。");
      pendingSample.allow_repeat = true;
      pendingSample.repeat_reason = reason;
    }
    sampleItems.push(pendingSample);
    pendingSample = null;
    const repeatDialog = document.getElementById("ipadRepeatSampleDialog");
    if (repeatDialog.open) repeatDialog.close();
    document.getElementById("ipadSampleQuantity").value = "1";
    document.getElementById("ipadSamplePurpose").value = "";
    resetSampleFollowupDate();
    renderSampleList();
  }

  function renderSampleList() {
    const container = document.getElementById("ipadSampleList");
    if (!sampleItems.length) {
      container.innerHTML = emptyInline("提供するサンプルはまだありません。");
      return;
    }
    container.innerHTML = sampleItems.map((item, index) => {
      const sample = sampleById(item.sample_id);
      return `
        <div class="ipad-selected-item">
          <div><strong>${D.escapeHtml(sample?.sample_name || "サンプル")}</strong><span>${item.quantity}個｜確認 ${D.formatDateTime(item.followup_due_at)}${item.allow_repeat ? "｜再提供" : ""}</span></div>
          <button class="icon-button small-icon" type="button" data-remove-sample="${index}" aria-label="サンプルを削除">×</button>
        </div>`;
    }).join("");
    container.querySelectorAll("[data-remove-sample]").forEach((button) => {
      button.addEventListener("click", () => {
        sampleItems.splice(Number(button.dataset.removeSample), 1);
        renderSampleList();
      });
    });
  }

  function toggleFollowupFields() {
    document.getElementById("ipadFollowupFields").hidden =
      !document.getElementById("ipadFollowupEnabled").checked;
  }

  async function saveSession(event) {
    event.preventDefault();
    if (sessionSaving) return;
    clearSessionError();

    const customerId = document.getElementById("ipadSessionCustomerId").value;
    if (!customerId || !selectedStaffId) return showSessionError("顧客またはスタッフを確認できません。");

    const followupEnabled = document.getElementById("ipadFollowupEnabled").checked;
    const followupDue = document.getElementById("ipadFollowupDue").value;
    if (followupEnabled && !followupDue) {
      return showSessionError("フォロー日時を入力してください。");
    }

    const body = {
      staff_id: selectedStaffId,
      customer_id: customerId,
      reservation_id: document.getElementById("ipadSessionReservationId").value || null,
      counseling: {
        customer_request: value("ipadCustomerRequest"),
        self_reported_skin_condition: value("ipadSkinCondition"),
        current_products: value("ipadCurrentProducts"),
        preferred_texture: value("ipadPreferredTexture"),
        preferred_fragrance: value("ipadPreferredFragrance"),
        preferred_price_range: value("ipadPreferredPrice"),
        color_preference: value("ipadColorPreference"),
        previously_unsuitable_products: value("ipadUnsuitableProducts"),
        public_summary: value("ipadPublicSummary"),
        internal_note: value("ipadInternalNote"),
      },
      recommendations,
      purchase: purchaseItems.length ? { channel: "store", items: purchaseItems } : null,
      samples: sampleItems,
      followup: followupEnabled ? {
        due_at: toIsoOrNull(followupDue),
        priority: document.getElementById("ipadFollowupPriority").value,
        subject: value("ipadFollowupSubject") || "美容相談後フォロー",
        note: value("ipadFollowupNote"),
        contact_channel: "line",
      } : null,
      complete_reservation: document.getElementById("ipadCompleteReservation").checked,
      idempotency_key: crypto.randomUUID(),
    };

    const button = document.getElementById("ipadSaveSession");
    sessionSaving = true;
    button.disabled = true;
    button.textContent = "保存しています…";
    try {
      const response = await ipadRequest("/admin/ipad/session/save", body);
      const total = response.saved?.purchase_total_yen || 0;
      D.showToast(total > 0
        ? `接客内容と購入 ${D.formatYen(total)}を保存しました。`
        : "接客内容を保存しました。");
      document.getElementById("ipadSessionDialog").close();
      currentDetail = null;
      await loadBootstrap();
    } catch (error) {
      showSessionError(withRequestId(error));
    } finally {
      sessionSaving = false;
      button.disabled = false;
      button.textContent = "接客内容を保存する";
    }
  }

  function confirmFollowupUpdate(button) {
    const status = button.dataset.followupStatus;
    openConfirm(
      `${button.dataset.followupName} 様のフォローを「${followupLabels[status]}」へ変更しますか？`,
      "変更内容はフォロー履歴へ記録されます。",
      async () => {
        await ipadRequest("/admin/ipad/followups/update", {
          staff_id: selectedStaffId,
          followup_id: button.dataset.followupId,
          status,
          result: status === "completed" ? "iPad画面から対応完了" : "iPad画面から連絡済み",
        });
        D.showToast(`フォローを「${followupLabels[status]}」へ変更しました。`);
        await loadBootstrap();
      },
    );
  }

  function openConfirm(title, message, callback) {
    pendingConfirm = callback;
    document.getElementById("ipadConfirmTitle").textContent = title;
    document.getElementById("ipadConfirmMessage").textContent = message;
    document.getElementById("ipadConfirmDialog").showModal();
  }

  function closeConfirm() {
    pendingConfirm = null;
    document.getElementById("ipadConfirmDialog").close();
  }

  async function executeConfirm() {
    if (!pendingConfirm) return;
    const callback = pendingConfirm;
    const button = document.getElementById("ipadConfirmExecute");
    button.disabled = true;
    button.textContent = "更新しています…";
    try {
      await callback();
      closeConfirm();
    } catch (error) {
      showGlobalError(withRequestId(error));
      closeConfirm();
    } finally {
      button.disabled = false;
      button.textContent = "変更する";
    }
  }

  async function changeStaff() {
    selectedStaffId = document.getElementById("ipadStaffSelect").value;
    sessionStorage.setItem(STAFF_KEY, selectedStaffId);
    await loadBootstrap();
    D.showToast("操作スタッフを切り替えました。");
  }

  async function switchView(name) {
    if (!viewNames.includes(name)) return;
    currentView = name;
    document.querySelectorAll("[data-ipad-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.ipadView === name);
    });
    viewNames.forEach((view) => {
      document.getElementById(`ipadView${capitalize(view)}`).hidden = view !== name;
    });
    if (name === "customers" && !document.getElementById("ipadCustomerResults").children.length) {
      await loadCustomers();
    }
  }

  async function refreshCurrentView() {
    await loadBootstrap();
    if (currentView === "customers") await loadCustomers();
    D.showToast("最新情報へ更新しました。");
  }

  function productById(id) {
    return (bootstrap.products || []).find((product) => product.product_variant_id === id);
  }

  function sampleById(id) {
    return (bootstrap.samples || []).find((sample) => sample.sample_id === id);
  }

  function productLabel(product) {
    if (!product) return "商品";
    return `${product.brand_name || ""} ${product.product_name} ${product.variant_name || ""}`.trim();
  }

  function setDefaultDateTimes() {
    resetSampleFollowupDate();
    const followupDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const followupInput = document.getElementById("ipadFollowupDue");
    if (followupInput) followupInput.value = toLocalInputValue(followupDate);
  }

  function resetSampleFollowupDate() {
    const sampleDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const sampleInput = document.getElementById("ipadSampleFollowup");
    if (sampleInput) sampleInput.value = toLocalInputValue(sampleDate);
  }

  function toLocalInputValue(date) {
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function toIsoOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function value(id) {
    return document.getElementById(id).value.trim() || null;
  }

  function clampClientInteger(value, min, max) {
    const numberValue = Number(value);
    if (!Number.isInteger(numberValue)) return min;
    return Math.max(min, Math.min(max, numberValue));
  }

  function roleLabel(role) {
    return ({ owner: "オーナー", manager: "店長", staff: "スタッフ" })[role] || role;
  }

  function contactLabel(channel) {
    return ({ line: "LINE", phone: "電話", email: "メール", in_person: "店頭", none: "連絡なし" })[channel] || channel;
  }

  function formatTime(value) {
    if (!value) return "―";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "―";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function number(value) {
    return new Intl.NumberFormat("ja-JP").format(Number(value || 0));
  }

  function capitalize(valueText) {
    return valueText.charAt(0).toUpperCase() + valueText.slice(1);
  }

  function emptyCard(message) {
    return `<div class="card empty-state ipad-empty-card"><p>${D.escapeHtml(message)}</p></div>`;
  }

  function emptyInline(message) {
    return `<div class="empty-state compact-empty"><p>${D.escapeHtml(message)}</p></div>`;
  }

  function setLoading(show) {
    document.getElementById("ipadLoading").hidden = !show;
  }

  function showGlobalError(message) {
    const element = document.getElementById("ipadGlobalError");
    element.textContent = message;
    element.hidden = false;
  }

  function clearGlobalError() {
    const element = document.getElementById("ipadGlobalError");
    element.textContent = "";
    element.hidden = true;
  }

  function showLoginError(message) {
    const element = document.getElementById("ipadLoginError");
    element.textContent = message;
    element.hidden = false;
  }

  function hideLoginError() {
    const element = document.getElementById("ipadLoginError");
    element.textContent = "";
    element.hidden = true;
  }

  function showSessionError(message) {
    const element = document.getElementById("ipadSessionError");
    element.textContent = message;
    element.hidden = false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearSessionError() {
    const element = document.getElementById("ipadSessionError");
    element.textContent = "";
    element.hidden = true;
  }

  function withRequestId(error) {
    return error?.requestId
      ? `${error.message}（確認番号：${error.requestId}）`
      : (error?.message || "エラーが発生しました。");
  }
})();