(() => {
  "use strict";

  const D = window.DPRO;
  const TOKEN_KEY = "dpro_cosmetics_owner_token";
  const viewNames = ["dashboard","customers","reservations","holds","settings"];
  const reservationLabels = {
    requested:"予約依頼", confirmed:"予約確定", checked_in:"来店済み",
    in_service:"対応中", completed:"完了", cancelled:"キャンセル", no_show:"無断キャンセル",
  };
  const holdLabels = {
    requested:"受付済み", checking:"在庫確認中", secured:"商品確保済み",
    backorder:"入荷待ち", ready:"受取可能", picked_up:"受取済み",
    cancelled:"キャンセル", expired:"期限切れ",
  };
  let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
  let dashboard = null;
  let pendingConfirm = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindEvents();
    setDefaultDates();
    if (D.demoScenario) document.getElementById("managementCode").value = "1234";
    if (adminToken) {
      openOwnerApp().catch((error) => {
        clearAuth();
        document.getElementById("ownerAppView").hidden = true;
        document.getElementById("ownerLoginView").hidden = false;
        showLoginError(withRequestId(error));
      });
    }
  }

  function bindEvents() {
    document.getElementById("ownerLoginForm").addEventListener("submit", login);
    document.getElementById("toggleManagementCode").addEventListener("click", toggleCode);
    document.getElementById("clearManagementCode").addEventListener("click", clearCode);
    document.getElementById("ownerLogoutButton").addEventListener("click", logout);
    document.getElementById("ownerRefreshButton").addEventListener("click", refreshCurrentView);
    document.querySelectorAll("[data-owner-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.ownerView));
    });
    document.querySelectorAll("[data-jump-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.jumpView));
    });
    document.getElementById("customerSearchForm").addEventListener("submit", (e) => { e.preventDefault(); loadCustomers(); });
    document.getElementById("customerSearchClear").addEventListener("click", () => {
      document.getElementById("customerSearchInput").value = "";
      loadCustomers();
    });
    document.getElementById("reservationFilterForm").addEventListener("submit", (e) => { e.preventDefault(); loadReservations(); });
    document.getElementById("holdFilterForm").addEventListener("submit", (e) => { e.preventDefault(); loadHolds(); });
    document.getElementById("closeCustomerDetail").addEventListener("click", () => document.getElementById("customerDetailDialog").close());
    document.getElementById("ownerConfirmCancel").addEventListener("click", closeConfirm);
    document.getElementById("ownerConfirmExecute").addEventListener("click", executeConfirm);
  }

  async function login(event) {
    event.preventDefault();
    const code = document.getElementById("managementCode").value.trim();
    if (!code) return showLoginError("管理コードを入力してください。");
    const button = document.getElementById("ownerLoginButton");
    button.disabled = true;
    button.textContent = "確認しています…";
    hideLoginError();
    try {
      const result = await D.request("/owner/auth", { method:"POST", body:{ management_code:code } });
      adminToken = result.admin_token;
      sessionStorage.setItem(TOKEN_KEY, adminToken);
      document.getElementById("managementCode").value = "";
      await openOwnerApp();
    } catch (error) {
      showLoginError(withRequestId(error));
    } finally {
      button.disabled = false;
      button.textContent = "管理画面を開く";
    }
  }

  async function openOwnerApp() {
    document.getElementById("ownerLoginView").hidden = true;
    document.getElementById("ownerAppView").hidden = false;
    await loadDashboard();
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
    const input = document.getElementById("managementCode");
    const button = document.getElementById("toggleManagementCode");
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "表示" : "隠す";
    button.setAttribute("aria-label", input.type === "password" ? "管理コードを表示" : "管理コードを隠す");
  }

  function clearCode() {
    const input = document.getElementById("managementCode");
    input.value = "";
    input.focus();
  }

  async function ownerRequest(path, body = {}) {
    try {
      return await D.request(path, {
        method:"POST",
        headers:{ Authorization:`Bearer ${adminToken}` },
        body,
      });
    } catch (error) {
      if (error.status === 401) {
        clearAuth();
        document.getElementById("ownerAppView").hidden = true;
        document.getElementById("ownerLoginView").hidden = false;
        showLoginError("管理者認証の有効期限が切れました。管理コードを入力し直してください。");
      }
      throw error;
    }
  }

  async function loadDashboard() {
    setLoading(true);
    clearGlobalError();
    try {
      const response = await ownerRequest("/admin/owner/dashboard");
      dashboard = response.dashboard;
      renderDashboard(dashboard);
      renderStoreInfo(dashboard.store);
    } catch (error) {
      showGlobalError(withRequestId(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }

  function renderDashboard(data) {
    document.getElementById("ownerStoreName").textContent = data.store?.store_name || "DPROコスメティックサロン";
    document.getElementById("ownerDemoBadge").hidden = !data.store?.is_demo;
    document.getElementById("dashboardDateText").textContent = `${formatDate(data.today)}の業務状況です。`;
    const stats = [
      ["👥","顧客数",`${number(data.counts?.customers)}名`],
      ["🗓️","本日の相談",`${number(data.counts?.today_reservations)}件`],
      ["🛍️","本日の受取",`${number(data.counts?.today_pickups)}件`],
      ["📦","未完了取り置き",`${number(data.counts?.open_holds)}件`],
      ["🔔","未完了フォロー",`${number(data.counts?.open_followups)}件`],
      ["💬","未対応問合せ",`${number(data.counts?.open_inquiries)}件`],
      ["💴","本日の売上",D.formatYen(data.counts?.today_sales_yen || 0)],
    ];
    document.getElementById("dashboardStats").innerHTML = stats.map(([icon,label,value]) =>
      `<article class="owner-stat-card"><span>${icon}</span><small>${D.escapeHtml(label)}</small><strong>${D.escapeHtml(value)}</strong></article>`
    ).join("");

    document.getElementById("dashboardReservations").innerHTML = (data.today_reservations || []).length
      ? data.today_reservations.map(reservationMini).join("")
      : empty("本日の美容相談はありません。");
    document.getElementById("dashboardHolds").innerHTML = (data.priority_holds || []).length
      ? data.priority_holds.map(holdMini).join("")
      : empty("対応が必要な取り置きはありません。");
    document.getElementById("dashboardCustomers").innerHTML = (data.recent_customers || []).length
      ? data.recent_customers.map((c) => `<button class="owner-customer-mini" type="button" data-customer-detail="${c.id}"><strong>${D.escapeHtml(c.full_name)}</strong><span>${D.escapeHtml(c.customer_no)}</span><small>最終購入 ${D.formatDateTime(c.last_purchase_at,{dateOnly:true})}</small></button>`).join("")
      : empty("顧客情報がありません。");
    bindCustomerDetailButtons(document.getElementById("dashboardCustomers"));
  }

  async function switchView(name) {
    if (!viewNames.includes(name)) return;
    document.querySelectorAll("[data-owner-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.ownerView === name));
    viewNames.forEach((view) => { document.getElementById(`ownerView${capitalize(view)}`).hidden = view !== name; });
    clearGlobalError();
    if (name === "dashboard") await loadDashboard();
    if (name === "customers") await loadCustomers();
    if (name === "reservations") await loadReservations();
    if (name === "holds") await loadHolds();
  }

  async function refreshCurrentView() {
    const active = document.querySelector("[data-owner-view].is-active")?.dataset.ownerView || "dashboard";
    await switchView(active);
    D.showToast("最新情報へ更新しました。");
  }

  async function loadCustomers() {
    setLoading(true);
    try {
      const query = document.getElementById("customerSearchInput").value.trim();
      const response = await ownerRequest("/admin/owner/customers/search", { query, limit:50 });
      renderCustomers(response.result?.customers || []);
    } catch (error) {
      showGlobalError(withRequestId(error));
    } finally { setLoading(false); }
  }

  function renderCustomers(customers) {
    const container = document.getElementById("customerSearchResults");
    if (!customers.length) { container.innerHTML = empty("該当する顧客が見つかりません。"); return; }
    container.innerHTML = customers.map((c) => `
      <article class="card owner-record-card">
        <div class="owner-record-main">
          <div class="owner-record-heading"><div><span class="status-pill status-active">会員</span><h2>${D.escapeHtml(c.full_name)}</h2></div><button class="btn secondary compact" type="button" data-customer-detail="${c.id}">詳細を見る</button></div>
          <div class="owner-record-meta">
            <span>顧客番号 <strong>${D.escapeHtml(c.customer_no)}</strong></span>
            <span>電話 <strong>${D.escapeHtml(c.phone || "未登録")}</strong></span>
            <span>LINE <strong>${D.escapeHtml(c.link_status || "未連携")}</strong></span>
            <span>最終購入 <strong>${D.formatDateTime(c.last_purchase_at,{dateOnly:true})}</strong></span>
          </div>
          <div class="owner-count-row"><span>購入 ${number(c.purchase_count)}件</span><span>相談 ${number(c.reservation_count)}件</span><span>受取待ち ${number(c.active_hold_count)}件</span><span>内部メモ ${number(c.note_count)}件</span></div>
        </div>
      </article>`).join("");
    bindCustomerDetailButtons(container);
  }

  function bindCustomerDetailButtons(scope) {
    scope.querySelectorAll("[data-customer-detail]").forEach((button) => button.addEventListener("click", () => openCustomerDetail(button.dataset.customerDetail)));
  }

  async function openCustomerDetail(customerId) {
    setLoading(true);
    try {
      const response = await ownerRequest("/admin/owner/customers/detail", { customer_id:customerId });
      renderCustomerDetail(response.detail);
      document.getElementById("customerDetailDialog").showModal();
    } catch (error) { showGlobalError(withRequestId(error)); }
    finally { setLoading(false); }
  }

  function renderCustomerDetail(detail) {
    const c = detail.customer || {};
    document.getElementById("customerDetailTitle").textContent = `${c.full_name || "顧客"} 様`;
    const preference = detail.preferences || {};
    const notes = detail.notes || [];
    const purchases = detail.purchases || [];
    const reservations = detail.reservations || [];
    const holds = detail.holds || [];
    document.getElementById("customerDetailBody").innerHTML = `
      <div class="owner-detail-summary">
        ${definition("顧客番号", c.customer_no)}
        ${definition("電話番号", c.phone)}
        ${definition("最終来店", D.formatDateTime(c.last_visit_at,{dateOnly:true}))}
        ${definition("最終購入", D.formatDateTime(c.last_purchase_at,{dateOnly:true}))}
        ${definition("LINE連携", detail.line_link?.link_status || "未連携")}
        ${definition("担当", c.assigned_staff_name || "未設定")}
      </div>
      <section class="owner-detail-section"><h3>美容相談の参考情報</h3>
        <p><strong>肌の悩み：</strong>${D.escapeHtml((preference.skin_concerns || []).join("、") || "未登録")}</p>
        <p><strong>使用中商品：</strong>${D.escapeHtml(preference.current_products || "未登録")}</p>
        <p><strong>好み：</strong>${D.escapeHtml([preference.texture_preferences, preference.fragrance_preferences, preference.color_preferences].filter(Boolean).join("／") || "未登録")}</p>
      </section>
      <section class="owner-detail-section"><h3>内部メモ</h3>${notes.length ? notes.map(n => `<div class="owner-note ${n.sensitivity === "restricted" ? "restricted" : ""}"><strong>${D.escapeHtml(n.note_type)}</strong><p>${D.escapeHtml(n.note_text)}</p><small>${D.formatDateTime(n.created_at)} ${D.escapeHtml(n.created_by_name || "")}</small></div>`).join("") : empty("内部メモはありません。")}</section>
      <section class="owner-detail-section"><h3>最近の購入</h3>${purchases.length ? purchases.map(p => `<div class="owner-history-row"><strong>${D.formatDateTime(p.purchased_at,{dateOnly:true})}｜${D.formatYen(p.total_yen)}</strong><span>${D.escapeHtml((p.items || []).map(i => `${i.product_name}×${i.quantity}`).join("、"))}</span></div>`).join("") : empty("購入履歴はありません。")}</section>
      <section class="owner-detail-section"><h3>美容相談履歴</h3>${reservations.length ? reservations.map(r => `<div class="owner-history-row"><strong>${D.formatDateTime(r.start_at)}｜${D.escapeHtml(reservationLabels[r.status] || r.status)}</strong><span>${D.escapeHtml(r.menu_name)}／${D.escapeHtml(r.staff_name || "担当未定")}</span></div>`).join("") : empty("美容相談履歴はありません。")}</section>
      <section class="owner-detail-section"><h3>取り置き履歴</h3>${holds.length ? holds.map(h => `<div class="owner-history-row"><strong>${D.escapeHtml(h.hold_no)}｜${D.escapeHtml(holdLabels[h.status] || h.status)}</strong><span>${D.escapeHtml((h.items || []).map(i => `${i.product_name}×${i.quantity}`).join("、"))}</span></div>`).join("") : empty("取り置き履歴はありません。")}</section>`;
  }

  async function loadReservations() {
    setLoading(true);
    try {
      const body = {
        from_date:document.getElementById("reservationFromDate").value,
        to_date:document.getElementById("reservationToDate").value,
        status:document.getElementById("reservationStatusFilter").value,
        query:document.getElementById("reservationQuery").value.trim(),
        limit:150,
      };
      const response = await ownerRequest("/admin/owner/reservations/list", body);
      renderReservations(response.result?.reservations || []);
    } catch (error) { showGlobalError(withRequestId(error)); }
    finally { setLoading(false); }
  }

  function renderReservations(items) {
    const container = document.getElementById("reservationResults");
    if (!items.length) { container.innerHTML = empty("指定した条件の美容相談はありません。"); return; }
    container.innerHTML = items.map((r) => `
      <article class="card owner-record-card">
        <div class="owner-record-heading">
          <div><span class="status-pill status-${r.status}">${D.escapeHtml(reservationLabels[r.status] || r.status)}</span><h2>${D.formatDateTime(r.start_at)}｜${D.escapeHtml(r.full_name)}</h2></div>
          <strong>${D.escapeHtml(r.reservation_no)}</strong>
        </div>
        <div class="owner-record-meta"><span>メニュー <strong>${D.escapeHtml(r.menu_name)}</strong></span><span>担当 <strong>${D.escapeHtml(r.staff_name || "未定")}</strong></span><span>電話 <strong>${D.escapeHtml(r.phone || "未登録")}</strong></span><span>受付 <strong>${D.escapeHtml(r.booking_source)}</strong></span></div>
        ${r.consultation_request ? `<div class="owner-record-note">相談内容：${D.escapeHtml(r.consultation_request)}</div>` : ""}
        <div class="owner-action-row">${reservationActions(r).map(a => `<button class="btn ${a.danger ? "danger" : "secondary"} compact" type="button" data-reservation-id="${r.id}" data-reservation-status="${a.status}" data-reservation-name="${D.escapeHtml(r.full_name)}">${D.escapeHtml(a.label)}</button>`).join("")}</div>
      </article>`).join("");
    container.querySelectorAll("[data-reservation-status]").forEach((button) => button.addEventListener("click", () => confirmReservationUpdate(button)));
  }

  function reservationActions(r) {
    if (r.status === "requested") return [{status:"confirmed",label:"予約確定"},{status:"checked_in",label:"来店受付"},{status:"cancelled",label:"キャンセル",danger:true}];
    if (r.status === "confirmed") return [{status:"checked_in",label:"来店受付"},{status:"no_show",label:"無断キャンセル",danger:true},{status:"cancelled",label:"キャンセル",danger:true}];
    if (r.status === "checked_in") return [{status:"in_service",label:"対応開始"},{status:"completed",label:"完了"}];
    if (r.status === "in_service") return [{status:"completed",label:"対応完了"}];
    return [];
  }

  function confirmReservationUpdate(button) {
    const status = button.dataset.reservationStatus;
    const destructive = ["cancelled","no_show"].includes(status);
    openConfirm(
      `${button.dataset.reservationName} 様の予約を「${reservationLabels[status]}」へ変更しますか？`,
      destructive ? "この操作は予約一覧へ直ちに反映されます。" : "状態変更後も履歴は保存されます。",
      async () => {
        await ownerRequest("/admin/owner/reservations/update", { reservation_id:button.dataset.reservationId, status });
        D.showToast(`予約を「${reservationLabels[status]}」へ変更しました。`);
        await Promise.all([loadReservations(), loadDashboard()]);
      },
      destructive
    );
  }

  async function loadHolds() {
    setLoading(true);
    try {
      const response = await ownerRequest("/admin/owner/holds/list", {
        status:document.getElementById("holdStatusFilter").value,
        query:document.getElementById("holdQuery").value.trim(),
        limit:150,
      });
      renderHolds(response.result?.holds || []);
    } catch (error) { showGlobalError(withRequestId(error)); }
    finally { setLoading(false); }
  }

  function renderHolds(items) {
    const container = document.getElementById("holdResults");
    if (!items.length) { container.innerHTML = empty("指定した条件の取り置きはありません。"); return; }
    container.innerHTML = items.map((h) => `
      <article class="card owner-record-card">
        <div class="owner-record-heading">
          <div><span class="status-pill status-${h.status}">${D.escapeHtml(holdLabels[h.status] || h.status)}</span><h2>${D.escapeHtml(h.full_name)}｜${D.escapeHtml(h.hold_no)}</h2></div>
          <strong>受取 ${formatDate(h.pickup_date)}</strong>
        </div>
        <div class="owner-record-meta"><span>依頼種別 <strong>${h.request_type === "repurchase" ? "再購入" : "取り置き"}</strong></span><span>電話 <strong>${D.escapeHtml(h.phone || "未登録")}</strong></span><span>担当 <strong>${D.escapeHtml(h.staff_name || "未設定")}</strong></span><span>受付 <strong>${D.formatDateTime(h.created_at)}</strong></span></div>
        <div class="owner-item-list">${(h.items || []).map(i => `<div><span><strong>${D.escapeHtml(i.product_name)}</strong> ${D.escapeHtml(i.variant_name || "")}</span><span>${number(i.quantity)}点｜${inventoryLabel(i.inventory_status)}</span></div>`).join("")}</div>
        ${h.customer_note ? `<div class="owner-record-note">お客様から：${D.escapeHtml(h.customer_note)}</div>` : ""}
        <div class="owner-action-row">${holdActions(h).map(a => `<button class="btn ${a.danger ? "danger" : "secondary"} compact" type="button" data-hold-id="${h.id}" data-hold-status="${a.status}" data-hold-name="${D.escapeHtml(h.full_name)}">${D.escapeHtml(a.label)}</button>`).join("")}</div>
      </article>`).join("");
    container.querySelectorAll("[data-hold-status]").forEach((button) => button.addEventListener("click", () => confirmHoldUpdate(button)));
  }

  function holdActions(h) {
    if (h.status === "requested") return [{status:"checking",label:"在庫確認開始"},{status:"secured",label:"商品確保"},{status:"backorder",label:"入荷待ち"},{status:"cancelled",label:"取消",danger:true}];
    if (h.status === "checking") return [{status:"secured",label:"商品確保"},{status:"backorder",label:"入荷待ち"},{status:"ready",label:"受取可能"},{status:"cancelled",label:"取消",danger:true}];
    if (h.status === "secured") return [{status:"ready",label:"受取可能"},{status:"backorder",label:"入荷待ち"},{status:"cancelled",label:"取消",danger:true}];
    if (h.status === "backorder") return [{status:"checking",label:"再確認"},{status:"secured",label:"商品確保"},{status:"ready",label:"受取可能"},{status:"cancelled",label:"取消",danger:true}];
    if (h.status === "ready") return [{status:"picked_up",label:"受取完了"},{status:"cancelled",label:"取消",danger:true}];
    return [];
  }

  function confirmHoldUpdate(button) {
    const status = button.dataset.holdStatus;
    const destructive = ["cancelled","picked_up"].includes(status);
    openConfirm(
      `${button.dataset.holdName} 様の取り置きを「${holdLabels[status]}」へ変更しますか？`,
      status === "picked_up" ? "受取完了にすると会員画面の受取待ちから除外されます。" : "商品ごとの状態も同時に更新されます。",
      async () => {
        await ownerRequest("/admin/owner/holds/update", { hold_id:button.dataset.holdId, status });
        D.showToast(`取り置きを「${holdLabels[status]}」へ変更しました。`);
        await Promise.all([loadHolds(), loadDashboard()]);
      },
      destructive
    );
  }

  function openConfirm(title, message, callback, danger=false) {
    pendingConfirm = callback;
    document.getElementById("ownerConfirmTitle").textContent = title;
    document.getElementById("ownerConfirmMessage").textContent = message;
    const execute = document.getElementById("ownerConfirmExecute");
    execute.className = `btn ${danger ? "danger" : "primary"}`;
    document.getElementById("ownerConfirmDialog").showModal();
  }

  function closeConfirm() {
    pendingConfirm = null;
    document.getElementById("ownerConfirmDialog").close();
  }

  async function executeConfirm() {
    if (!pendingConfirm) return;
    const callback = pendingConfirm;
    const button = document.getElementById("ownerConfirmExecute");
    button.disabled = true;
    button.textContent = "更新しています…";
    try { await callback(); closeConfirm(); }
    catch (error) { showGlobalError(withRequestId(error)); closeConfirm(); }
    finally { button.disabled = false; button.textContent = "変更する"; }
  }

  function renderStoreInfo(store) {
    if (!store) return;
    document.getElementById("ownerStoreDefinition").innerHTML = [
      ["店舗名",store.store_name],["店舗コード",store.store_code],["タイムゾーン",store.timezone],
      ["予約単位",`${store.default_slot_minutes}分`],["デモ環境",store.is_demo ? "はい" : "いいえ"],
      ["本番保護",store.production_guard ? "有効" : "無効"],
    ].map(([label,value]) => `<dt>${D.escapeHtml(label)}</dt><dd>${D.escapeHtml(value)}</dd>`).join("");
  }

  function reservationMini(r) {
    return `<div class="owner-mini-row"><span>${D.formatDateTime(r.start_at)}</span><strong>${D.escapeHtml(r.full_name)}</strong><small>${D.escapeHtml(r.menu_name)}／${D.escapeHtml(r.staff_name || "未定")}</small></div>`;
  }
  function holdMini(h) {
    return `<div class="owner-mini-row"><span>${formatDate(h.pickup_date)}</span><strong>${D.escapeHtml(h.full_name)}</strong><small>${D.escapeHtml(holdLabels[h.status] || h.status)}／${number(h.item_count)}点</small></div>`;
  }
  function definition(label,value) { return `<div><dt>${D.escapeHtml(label)}</dt><dd>${D.escapeHtml(value || "―")}</dd></div>`; }
  function empty(message) { return `<div class="empty-state compact-empty"><p>${D.escapeHtml(message)}</p></div>`; }
  function number(value) { return new Intl.NumberFormat("ja-JP").format(Number(value || 0)); }
  function formatDate(value) {
    if (!value) return "未定";
    const date = new Date(`${String(value).slice(0,10)}T00:00:00+09:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).format(date);
  }
  function inventoryLabel(status) {
    return ({in_stock:"在庫あり",low_stock:"残りわずか",check_required:"在庫確認",backorder:"入荷待ち",discontinued:"取扱終了"})[status] || "在庫確認";
  }
  function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
  function setDefaultDates() {
    const today = new Date();
    const later = new Date(today); later.setDate(today.getDate()+30);
    const local = (d) => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
    document.getElementById("reservationFromDate").value = local(today);
    document.getElementById("reservationToDate").value = local(later);
  }
  function setLoading(show) { document.getElementById("ownerLoading").hidden = !show; }
  function showGlobalError(message) { const el=document.getElementById("ownerGlobalError"); el.textContent=message; el.hidden=false; }
  function clearGlobalError() { const el=document.getElementById("ownerGlobalError"); el.hidden=true; el.textContent=""; }
  function showLoginError(message) { const el=document.getElementById("ownerLoginError"); el.textContent=message; el.hidden=false; }
  function hideLoginError() { const el=document.getElementById("ownerLoginError"); el.hidden=true; el.textContent=""; }
  function withRequestId(error) { return error?.requestId ? `${error.message}（確認番号：${error.requestId}）` : (error?.message || "エラーが発生しました。"); }
})();