(() => {
  "use strict";
  const D = window.DPRO;
  const TOKEN_KEY = "dpro_cosmetics_owner_token";
  const $ = (id) => document.getElementById(id);
  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let catalog = { products: [], variants: [], inventory: [], media: [], brands: [] };
  let ipad = { staff: [], products: [], samples: [] };
  let overview = { recommendations: [], recurring_preferences: [], sample_followups: [] };
  let repurchase = [];
  let customerResults = [];
  let selectedCustomer = null;
  let care = null;
  let recommendationItems = [];
  let toastTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bind();
    document.querySelectorAll("[data-query-link]").forEach((link) => {
      link.href = D.appendQuery(link.getAttribute("href"));
    });
    if (D.demoScenario) $("crmCode").value = "1234";
    if (token) openApp().catch((error) => showLogin(errorMessage(error)));
  }

  function bind() {
    $("crmLoginForm").addEventListener("submit", login);
    $("crmToggleCode").addEventListener("click", () => {
      const input = $("crmCode");
      input.type = input.type === "password" ? "text" : "password";
      $("crmToggleCode").textContent = input.type === "password" ? "表示" : "隠す";
    });
    $("crmClearCode").addEventListener("click", () => { $("crmCode").value = ""; $("crmCode").focus(); });
    $("crmLogout").addEventListener("click", logout);
    $("crmRefresh").addEventListener("click", refresh);
    document.querySelectorAll("[data-crm-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.crmView)));
    document.querySelectorAll("[data-jump-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jumpView)));
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(button.dataset.closeDialog).close()));
    document.querySelectorAll("[data-care-tab]").forEach((button) => button.addEventListener("click", () => switchCareTab(button.dataset.careTab)));
    $("crmCatalogFilter").addEventListener("submit", (event) => { event.preventDefault(); renderCatalog(); });
    $("crmRepurchaseFilter").addEventListener("submit", (event) => { event.preventDefault(); loadRepurchase(); });
    $("crmCustomerSearchForm").addEventListener("submit", (event) => { event.preventDefault(); loadCustomers(); });
    $("crmCustomerClear").addEventListener("click", () => { $("crmCustomerQuery").value = ""; loadCustomers(); });
    $("crmSyncRepurchase").addEventListener("click", syncRepurchase);
    $("crmRepurchaseSync2").addEventListener("click", syncRepurchase);
    $("crmProductForm").addEventListener("submit", saveProduct);
    $("crmActiveForm").addEventListener("submit", saveActiveProduct);
    $("crmRecommendationForm").addEventListener("submit", saveRecommendation);
    $("crmRecurringForm").addEventListener("submit", saveRecurring);
    $("crmSampleForm").addEventListener("submit", saveSampleEvaluation);
    $("crmOpenActiveDialog").addEventListener("click", openActiveDialog);
    $("crmOpenRecommendationDialog").addEventListener("click", openRecommendationDialog);
    $("crmOpenRecurringDialog").addEventListener("click", openRecurringDialog);
    $("crmAddRecItem").addEventListener("click", addRecommendationItem);
  }

  async function login(event) {
    event.preventDefault();
    const code = $("crmCode").value.trim();
    if (!code) return loginError("管理コードを入力してください。");
    const button = $("crmLoginButton");
    button.disabled = true;
    button.textContent = "確認しています…";
    loginError("");
    try {
      const response = await D.request("/owner/auth", { method: "POST", body: { management_code: code } });
      token = response.admin_token;
      sessionStorage.setItem(TOKEN_KEY, token);
      $("crmCode").value = "";
      await openApp();
    } catch (error) {
      loginError(errorMessage(error));
    } finally {
      button.disabled = false;
      button.textContent = "CRM管理を開く";
    }
  }

  async function openApp() {
    $("crmLogin").hidden = true;
    $("crmApp").hidden = false;
    await loadInitial();
  }

  function showLogin(message = "") {
    $("crmApp").hidden = true;
    $("crmLogin").hidden = false;
    if (message) loginError(message);
  }

  function logout() {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  async function admin(path, body = {}, options = {}) {
    try {
      if (options.formData) {
        const response = await fetch(`${D.config.API_BASE.replace(/\/+$/, "")}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: options.formData,
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          const error = new Error(data?.error?.message || `通信に失敗しました（${response.status}）。`);
          error.status = response.status;
          error.requestId = data?.request_id || null;
          throw error;
        }
        return data;
      }
      return await D.request(path, {
        method: options.method || "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    } catch (error) {
      if (error.status === 401) {
        token = "";
        sessionStorage.removeItem(TOKEN_KEY);
        showLogin("管理者認証の有効期限が切れました。もう一度開いてください。");
      }
      throw error;
    }
  }

  async function loadInitial() {
    loading(true);
    globalError("");
    try {
      const [catalogData, ipadData, overviewData, repurchaseData] = await Promise.all([
        admin("/admin/catalog/bootstrap", { limit: 500 }),
        admin("/admin/ipad/bootstrap", { days: 7 }),
        admin("/admin/care/bootstrap", { limit: 300 }),
        admin("/admin/repurchase/list", { status: "active", limit: 300 }),
      ]);
      catalog = catalogData;
      ipad = ipadData.bootstrap || {};
      overview = overviewData;
      repurchase = repurchaseData.repurchase_plans || [];
      $("crmStoreName").textContent = catalogData.store?.store_name || "DPROコスメティックサロン";
      $("crmDemoBadge").hidden = !catalogData.store?.is_demo;
      populateFilters();
      populateSelects();
      renderSummary();
      renderCatalog();
      renderRepurchase();
      if (!customerResults.length) await loadCustomers(false);
    } catch (error) {
      globalError(errorMessage(error));
      throw error;
    } finally {
      loading(false);
    }
  }

  async function refresh() {
    await loadInitial();
    if (selectedCustomer) await selectCustomer(selectedCustomer.id, false);
    toast("最新情報へ更新しました。");
  }

  function switchView(name) {
    document.querySelectorAll("[data-crm-view]").forEach((button) => button.classList.toggle("active", button.dataset.crmView === name));
    const mapping = { summary: "Summary", catalog: "Catalog", repurchase: "Repurchase", customers: "Customers" };
    Object.entries(mapping).forEach(([key, suffix]) => { $(`crmView${suffix}`).hidden = key !== name; });
    if (name === "repurchase") loadRepurchase();
  }

  function renderSummary() {
    const products = catalog.products || [];
    const media = catalog.media || [];
    const productWithImage = new Set(media.map((item) => item.product_id));
    const stats = [
      ["公開商品", products.filter((item) => item.catalog_status === "published").length],
      ["画像未登録", products.filter((item) => !productWithImage.has(item.id)).length],
      ["再購入対応", repurchase.filter((item) => item.status === "active").length],
      ["期限超過", repurchase.filter((item) => item.urgency_group === "overdue").length],
      ["おすすめ", (overview.recommendations || []).length],
      ["定期購入", (overview.recurring_preferences || []).filter((item) => item.status === "active").length],
    ];
    $("crmStats").innerHTML = stats.map(([label, value]) => `<article class="crm-stat"><small>${esc(label)}</small><strong>${num(value)}件</strong></article>`).join("");
    const priority = repurchase.filter((item) => ["overdue", "today", "within_7_days"].includes(item.urgency_group)).slice(0, 5);
    $("crmSummaryRepurchase").innerHTML = priority.length ? priority.map(repurchaseCard).join("") : empty("優先対応する再購入はありません。");
    bindRepurchaseActions($("crmSummaryRepurchase"));
  }

  function populateFilters() {
    const categories = [...new Set((catalog.products || []).map((item) => item.category).filter(Boolean))].sort();
    $("crmCatalogCategory").innerHTML = '<option value="all">すべて</option>' + categories.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
  }

  function populateSelects() {
    const productMap = new Map((catalog.products || []).map((item) => [item.id, item]));
    const options = '<option value="">商品を選択</option>' + (catalog.variants || []).filter((item) => item.is_active !== false).map((variant) => {
      const product = productMap.get(variant.product_id) || {};
      return `<option value="${variant.id}">${esc(product.product_name || "商品")} ${esc(variant.variant_name || variant.size_label || variant.sku || "")}｜${yen(variant.price_yen)}</option>`;
    }).join("");
    ["crmActiveVariant", "crmRecVariant", "crmRecurringVariant"].forEach((id) => { $(id).innerHTML = options; });
    const staffOptions = '<option value="">未設定</option>' + (ipad.staff || []).map((staff) => `<option value="${staff.id}">${esc(staff.display_name)}</option>`).join("");
    ["crmActiveStaff", "crmRecStaff", "crmRecurringStaff"].forEach((id) => { $(id).innerHTML = staffOptions; });
  }

  function renderCatalog() {
    const query = $("crmCatalogQuery").value.trim().toLowerCase();
    const status = $("crmCatalogStatus").value;
    const category = $("crmCatalogCategory").value;
    const imageFilter = $("crmCatalogImage").value;
    const mediaByProduct = groupBy(catalog.media || [], "product_id");
    const products = (catalog.products || []).filter((product) => {
      const text = [product.product_name, product.product_code, product.category, product.short_description].join(" ").toLowerCase();
      const hasImage = (mediaByProduct.get(product.id) || []).length > 0;
      return (!query || text.includes(query)) && (status === "all" || product.catalog_status === status) && (category === "all" || product.category === category) && (imageFilter === "all" || (imageFilter === "with" ? hasImage : !hasImage));
    });
    $("crmProductGrid").innerHTML = products.length ? products.map((product) => {
      const media = (mediaByProduct.get(product.id) || []).sort(mediaSort);
      const image = media[0]?.public_url;
      const variants = (catalog.variants || []).filter((item) => item.product_id === product.id);
      return `<article class="crm-product-card"><div class="crm-product-image">${image ? `<img src="${esc(image)}" alt="${esc(media[0]?.alt_text || product.product_name)}">` : '<div class="crm-placeholder">✦</div>'}</div><div class="crm-product-body"><div class="crm-chip-row"><span class="crm-chip ${product.catalog_status === "published" ? "success" : ""}">${catalogStatus(product.catalog_status)}</span><span class="crm-chip">${esc(product.category || "未分類")}</span></div><h3>${esc(product.product_name)}</h3><p>${esc(product.short_description || product.description || "説明未登録")}</p><div class="crm-product-meta"><strong>${variants.length}種類</strong><button class="crm-btn primary small" type="button" data-edit-product="${product.id}">編集・写真</button></div></div></article>`;
    }).join("") : empty("条件に合う商品はありません。");
    $("crmProductGrid").querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", () => openProductDialog(button.dataset.editProduct)));
  }

  function openProductDialog(productId) {
    const product = (catalog.products || []).find((item) => item.id === productId);
    if (!product) return;
    $("crmProductId").value = product.id;
    $("crmProductDialogTitle").textContent = product.product_name;
    $("crmProductShort").value = product.short_description || "";
    $("crmProductUsage").value = product.usage_method || "";
    $("crmProductFeatures").value = (product.feature_tags || []).join("、");
    $("crmProductConcerns").value = (product.target_skin_concerns || []).join("、");
    $("crmProductFragrance").value = product.fragrance_profile || "";
    $("crmProductTexture").value = product.texture_profile || "";
    $("crmProductFinish").value = product.finish_profile || "";
    $("crmProductSlug").value = product.catalog_slug || "";
    $("crmProductStatus").value = product.catalog_status || "draft";
    $("crmProductOrder").value = product.catalog_sort_order || 0;
    $("crmProductHold").value = String(product.hold_available !== false);
    $("crmProductImageFile").value = "";
    $("crmProductImageAlt").value = product.product_name;
    renderProductMedia(product.id);
    $("crmProductDialog").showModal();
  }

  function renderProductMedia(productId) {
    const media = (catalog.media || []).filter((item) => item.product_id === productId).sort(mediaSort);
    $("crmProductMedia").innerHTML = media.length ? media.map((item) => `<div class="crm-media-item"><img src="${esc(item.public_url)}" alt="${esc(item.alt_text || "商品画像")}"><button type="button" title="削除" data-delete-media="${item.id}">×</button></div>`).join("") : '<div class="crm-empty" style="grid-column:1/-1">商品写真はまだ登録されていません。</div>';
    $("crmProductMedia").querySelectorAll("[data-delete-media]").forEach((button) => button.addEventListener("click", () => deleteMedia(button.dataset.deleteMedia, productId)));
  }

  async function saveProduct(event) {
    event.preventDefault();
    loading(true);
    try {
      const productId = $("crmProductId").value;
      await admin("/admin/catalog/product/update", {
        product_id: productId,
        catalog: {
          short_description: nullable($("crmProductShort").value),
          usage_method: nullable($("crmProductUsage").value),
          feature_tags: splitList($("crmProductFeatures").value),
          target_skin_concerns: splitList($("crmProductConcerns").value),
          fragrance_profile: nullable($("crmProductFragrance").value),
          texture_profile: nullable($("crmProductTexture").value),
          finish_profile: nullable($("crmProductFinish").value),
          catalog_slug: nullable($("crmProductSlug").value),
          catalog_status: $("crmProductStatus").value,
          catalog_sort_order: Number($("crmProductOrder").value || 0),
          hold_available: $("crmProductHold").value === "true",
        },
      });
      const file = $("crmProductImageFile").files[0];
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("product_id", productId);
        form.append("alt_text", $("crmProductImageAlt").value.trim());
        form.append("is_primary", "true");
        form.append("is_public", "true");
        form.append("sort_order", "10");
        await admin("/admin/catalog/media/upload", {}, { formData: form });
      }
      await reloadCatalog();
      $("crmProductDialog").close();
      toast("商品カタログを更新しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function deleteMedia(mediaId, productId) {
    if (!confirm("この商品画像を削除しますか？")) return;
    loading(true);
    try {
      await admin("/admin/catalog/media/delete", { media_id: mediaId });
      await reloadCatalog();
      renderProductMedia(productId);
      toast("商品画像を削除しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function reloadCatalog() {
    catalog = await admin("/admin/catalog/bootstrap", { limit: 500 });
    populateFilters();
    populateSelects();
    renderCatalog();
    renderSummary();
  }

  async function syncRepurchase() {
    loading(true);
    try {
      await admin("/admin/repurchase/sync", {});
      await loadRepurchase(false);
      renderSummary();
      toast("再購入目安を同期しました。自動送信は行っていません。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function loadRepurchase(showLoading = true) {
    if (showLoading) loading(true);
    try {
      const response = await admin("/admin/repurchase/list", {
        status: $("crmRepurchaseStatus").value === "all" ? null : $("crmRepurchaseStatus").value,
        urgency_group: $("crmRepurchaseUrgency").value === "all" ? null : $("crmRepurchaseUrgency").value,
        marketing_consent_only: $("crmMarketingOnly").value === "true",
        limit: 500,
      });
      repurchase = response.repurchase_plans || [];
      renderRepurchase();
      renderSummary();
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      if (showLoading) loading(false);
    }
  }

  function renderRepurchase() {
    $("crmRepurchaseList").innerHTML = repurchase.length ? repurchase.map(repurchaseCard).join("") : empty("指定した条件の再購入予定はありません。");
    bindRepurchaseActions($("crmRepurchaseList"));
  }

  function repurchaseCard(plan) {
    const urgent = ["overdue", "today"].includes(plan.urgency_group);
    return `<article class="crm-card crm-record ${urgent ? "crm-priority-urgent" : ""}"><div class="crm-record-head"><div><div class="crm-chip-row"><span class="crm-chip ${urgent ? "warning" : "success"}">${urgencyLabel(plan.urgency_group)}</span><span class="crm-chip">${priorityLabel(plan.priority)}</span>${plan.marketing_consent_granted ? '<span class="crm-chip success">販促同意済み</span>' : '<span class="crm-chip warning">個別確認のみ</span>'}</div><h3>${esc(plan.full_name)}｜${esc(plan.product_name)}</h3></div>${plan.primary_image_url ? `<img src="${esc(plan.primary_image_url)}" alt="" style="width:68px;height:68px;object-fit:cover;border-radius:14px">` : ""}</div><div class="crm-record-meta"><span>使い切り ${date(plan.expected_finish_on)}</span><span>次回連絡 ${date(plan.next_contact_on)}</span><span>残量 ${remainingLabel(plan.remaining_level)}</span><span>連絡 ${contactLabel(plan.contact_status)}</span></div>${plan.next_action_note ? `<div class="crm-record-note">${esc(plan.next_action_note)}</div>` : ""}<div class="crm-record-actions"><button class="crm-btn secondary small" data-plan-action="contacted" data-plan-id="${plan.repurchase_plan_id}">連絡済み</button><button class="crm-btn secondary small" data-plan-action="waiting_reply" data-plan-id="${plan.repurchase_plan_id}">返信待ち</button><button class="crm-btn soft small" data-plan-action="hold_requested" data-plan-id="${plan.repurchase_plan_id}">取り置き受付</button><button class="crm-btn primary small" data-plan-action="repurchased" data-plan-id="${plan.repurchase_plan_id}">再購入済み</button><button class="crm-btn secondary small" data-plan-action="not_needed" data-plan-id="${plan.repurchase_plan_id}">今回は不要</button></div></article>`;
  }

  function bindRepurchaseActions(scope) {
    scope.querySelectorAll("[data-plan-action]").forEach((button) => button.addEventListener("click", () => updateRepurchase(button.dataset.planId, button.dataset.planAction)));
  }

  async function updateRepurchase(id, action) {
    loading(true);
    try {
      const body = { repurchase_plan_id: id };
      if (["contacted", "waiting_reply"].includes(action)) body.contact_status = action;
      else body.status = action;
      await admin("/admin/repurchase/update", body);
      await loadRepurchase(false);
      if (selectedCustomer) await selectCustomer(selectedCustomer.id, false);
      toast("再購入予定を更新しました。自動LINE送信はしていません。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function loadCustomers(showLoading = true) {
    if (showLoading) loading(true);
    try {
      const response = await admin("/admin/owner/customers/search", { query: $("crmCustomerQuery").value.trim(), limit: 100 });
      customerResults = response.result?.customers || [];
      renderCustomers();
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      if (showLoading) loading(false);
    }
  }

  function renderCustomers() {
    $("crmCustomerList").innerHTML = customerResults.length ? customerResults.map((customer) => `<button class="crm-customer-button ${selectedCustomer?.id === customer.id ? "active" : ""}" data-select-customer="${customer.id}" type="button"><strong>${esc(customer.full_name)}</strong><span>${esc(customer.customer_no)}｜${esc(customer.phone || "電話未登録")}</span><small>最終購入 ${date(customer.last_purchase_at)}</small></button>`).join("") : empty("顧客が見つかりません。");
    $("crmCustomerList").querySelectorAll("[data-select-customer]").forEach((button) => button.addEventListener("click", () => selectCustomer(button.dataset.selectCustomer)));
  }

  async function selectCustomer(id, showLoading = true) {
    const customer = customerResults.find((item) => item.id === id) || selectedCustomer;
    if (!customer) return;
    if (showLoading) loading(true);
    try {
      selectedCustomer = customer;
      care = await admin("/admin/care/bootstrap", { customer_id: id, limit: 300 });
      $("crmNoCustomer").hidden = true;
      $("crmCustomerWorkbench").hidden = false;
      $("crmCustomerHead").innerHTML = `<h2>${esc(customer.full_name)} 様</h2><p>${esc(customer.customer_no)}｜${esc(customer.phone || "電話未登録")}｜購入 ${num(customer.purchase_count)}件</p>`;
      renderCustomers();
      renderCare();
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      if (showLoading) loading(false);
    }
  }

  function renderCare() {
    renderActive();
    renderRecommendations();
    renderRecurring();
    renderSamples();
  }

  function switchCareTab(name) {
    document.querySelectorAll("[data-care-tab]").forEach((button) => button.classList.toggle("active", button.dataset.careTab === name));
    const mapping = { active: "Active", recommendations: "Recommendations", recurring: "Recurring", samples: "Samples" };
    Object.entries(mapping).forEach(([key, suffix]) => { $(`crmCare${suffix}`).hidden = key !== name; });
  }

  function renderActive() {
    const items = care?.active_products || [];
    $("crmActiveList").innerHTML = items.length ? items.map((item) => {
      const variant = item.product_variant || {};
      const product = variant.product || {};
      const image = variant.media?.[0]?.public_url;
      return `<article class="crm-care-card"><div class="crm-care-product"><div class="crm-care-image">${image ? `<img src="${esc(image)}" alt="">` : '<div class="crm-placeholder">✦</div>'}</div><div><div class="crm-chip-row"><span class="crm-chip success">${activeStatus(item.status)}</span></div><h3>${esc(product.product_name || "商品")}</h3><p>${esc(variant.variant_name || variant.size_label || "")}</p></div></div><div class="crm-progress"><span style="width:${remainingPercent(item.remaining_level)}%"></span></div><p>残量 ${remainingLabel(item.remaining_level)}｜使い切り ${date(item.expected_finish_on)}</p><div class="crm-inline"><select data-active-remaining="${item.id}"><option value="full" ${selected(item.remaining_level, "full")}>満量</option><option value="high" ${selected(item.remaining_level, "high")}>多い</option><option value="half" ${selected(item.remaining_level, "half")}>半分</option><option value="low" ${selected(item.remaining_level, "low")}>少ない</option><option value="empty" ${selected(item.remaining_level, "empty")}>なし</option><option value="unknown" ${selected(item.remaining_level, "unknown")}>不明</option></select><button class="crm-btn secondary small" data-update-active="${item.id}" type="button">更新</button></div><div class="crm-record-actions"><button class="crm-btn secondary small" data-active-status="paused" data-active-id="${item.id}">一時停止</button><button class="crm-btn secondary small" data-active-status="finished" data-active-id="${item.id}">使い切った</button></div></article>`;
    }).join("") : empty("使用中商品は登録されていません。");
    $("crmActiveList").querySelectorAll("[data-update-active]").forEach((button) => button.addEventListener("click", () => {
      const select = document.querySelector(`[data-active-remaining='${button.dataset.updateActive}']`);
      updateActive(button.dataset.updateActive, { remaining_level: select.value });
    }));
    $("crmActiveList").querySelectorAll("[data-active-status]").forEach((button) => button.addEventListener("click", () => updateActive(button.dataset.activeId, { status: button.dataset.activeStatus, ended_on: button.dataset.activeStatus === "finished" ? today() : null })));
  }

  function openActiveDialog() {
    if (!selectedCustomer) return toast("お客様を選択してください。");
    $("crmActiveOpened").value = today();
    $("crmActiveStarted").value = today();
    $("crmActiveDialog").showModal();
  }

  async function saveActiveProduct(event) {
    event.preventDefault();
    loading(true);
    try {
      await admin("/admin/active-products/upsert", {
        customer_id: selectedCustomer.id,
        product_variant_id: $("crmActiveVariant").value,
        source: "staff_entry",
        opened_on: nullable($("crmActiveOpened").value),
        started_on: nullable($("crmActiveStarted").value),
        expected_days: Number($("crmActiveDays").value || 30),
        use_frequency: nullable($("crmActiveFrequency").value),
        remaining_level: $("crmActiveRemaining").value,
        status: "using",
        staff_note: nullable($("crmActiveNote").value),
        started_by_staff_id: nullable($("crmActiveStaff").value),
      });
      await selectCustomer(selectedCustomer.id, false);
      $("crmActiveDialog").close();
      toast("使用中商品を登録しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function updateActive(id, patch) {
    loading(true);
    try {
      await admin("/admin/active-products/update", { active_product_id: id, ...patch });
      await selectCustomer(selectedCustomer.id, false);
      toast("使用中商品を更新しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  function renderRecommendations() {
    const sets = care?.recommendations || [];
    $("crmRecommendationList").innerHTML = sets.length ? sets.map((set) => `<article class="crm-card crm-record"><div class="crm-record-head"><div><div class="crm-chip-row"><span class="crm-chip ${set.status === "published" ? "success" : ""}">${recommendationStatus(set.status)}</span></div><h3>${esc(set.title)}</h3></div><strong>${esc(set.recommendation_no)}</strong></div><div class="crm-record-meta"><span>商品 ${(set.items || []).length}件</span><span>公開 ${date(set.published_at)}</span><span>期限 ${date(set.expires_at)}</span></div>${set.customer_message ? `<div class="crm-record-note">${esc(set.customer_message)}</div>` : ""}<div class="crm-record-actions">${set.status === "draft" ? `<button class="crm-btn primary small" data-publish-rec="${set.id}">公開URLを発行</button>` : ""}${set.status === "published" ? `<button class="crm-btn secondary small" data-publish-rec="${set.id}">共有URLを再発行</button>` : ""}${!["closed", "cancelled", "expired"].includes(set.status) ? `<button class="crm-btn secondary small" data-close-rec="${set.id}">終了</button>` : ""}</div></article>`).join("") : empty("個別おすすめはまだありません。");
    $("crmRecommendationList").querySelectorAll("[data-publish-rec]").forEach((button) => button.addEventListener("click", () => publishRecommendation(button.dataset.publishRec)));
    $("crmRecommendationList").querySelectorAll("[data-close-rec]").forEach((button) => button.addEventListener("click", () => closeRecommendation(button.dataset.closeRec)));
  }

  function openRecommendationDialog() {
    if (!selectedCustomer) return toast("お客様を選択してください。");
    recommendationItems = [];
    $("crmRecommendationForm").reset();
    $("crmRecTitle").value = "あなたへのおすすめ";
    $("crmRecStatus").value = "published";
    $("crmRecExpires").value = "90";
    $("crmShareResult").hidden = true;
    populateSelects();
    renderRecommendationBuilder();
    $("crmRecommendationDialog").showModal();
  }

  function addRecommendationItem() {
    const productVariantId = $("crmRecVariant").value;
    if (!productVariantId) return toast("おすすめ商品を選択してください。");
    if (recommendationItems.some((item) => item.product_variant_id === productVariantId)) return toast("同じ商品は追加済みです。");
    recommendationItems.push({
      product_variant_id: productVariantId,
      recommendation_reason: nullable($("crmRecReason").value),
      usage_tip: nullable($("crmRecUsage").value),
      staff_comment: null,
      action_type: $("crmRecAction").value,
    });
    $("crmRecReason").value = "";
    $("crmRecUsage").value = "";
    renderRecommendationBuilder();
  }

  function renderRecommendationBuilder() {
    const map = variantMap();
    $("crmRecBuilder").innerHTML = recommendationItems.length ? recommendationItems.map((item, index) => {
      const variant = map.get(item.product_variant_id) || {};
      return `<div class="crm-builder-item"><div><strong>${esc(variant.label || "商品")}</strong><small style="display:block;color:var(--crm-muted)">${esc(item.recommendation_reason || "理由未入力")}</small></div><button class="crm-btn secondary small" data-remove-rec-item="${index}" type="button">削除</button></div>`;
    }).join("") : empty("おすすめ商品を追加してください。");
    $("crmRecBuilder").querySelectorAll("[data-remove-rec-item]").forEach((button) => button.addEventListener("click", () => {
      recommendationItems.splice(Number(button.dataset.removeRecItem), 1);
      renderRecommendationBuilder();
    }));
  }

  async function saveRecommendation(event) {
    event.preventDefault();
    if (!recommendationItems.length) return toast("おすすめ商品を1件以上追加してください。");
    loading(true);
    try {
      const response = await admin("/admin/recommendations/create", {
        customer_id: selectedCustomer.id,
        title: $("crmRecTitle").value.trim(),
        customer_message: nullable($("crmRecMessage").value),
        staff_internal_note: nullable($("crmRecInternal").value),
        created_by_staff_id: nullable($("crmRecStaff").value),
        status: $("crmRecStatus").value,
        expires_days: Number($("crmRecExpires").value || 90),
        items: recommendationItems,
      });
      showShare(response.share_url, response.share_token);
      await selectCustomer(selectedCustomer.id, false);
      toast(response.share_url ? "おすすめを公開し、共有URLを発行しました。" : "おすすめを保存しました。共有URLがない場合はPUBLIC_APP_URLを確認してください。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function publishRecommendation(id) {
    loading(true);
    try {
      const response = await admin("/admin/recommendations/publish", { recommendation_set_id: id, expires_days: 90 });
      if (response.share_url) {
        await copy(response.share_url);
        toast("新しい共有URLをコピーしました。");
      } else {
        toast("公開しました。CloudflareのPUBLIC_APP_URLを確認してください。");
      }
      await selectCustomer(selectedCustomer.id, false);
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function closeRecommendation(id) {
    if (!confirm("このおすすめ提案を終了しますか？")) return;
    loading(true);
    try {
      await admin("/admin/recommendations/close", { recommendation_set_id: id, status: "closed" });
      await selectCustomer(selectedCustomer.id, false);
      toast("おすすめ提案を終了しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  function showShare(url, tokenValue) {
    const node = $("crmShareResult");
    if (url) {
      node.hidden = false;
      node.innerHTML = `共有URL：<button id="crmCopyShare" class="crm-btn secondary small" type="button">コピー</button><br><small>${esc(url)}</small>`;
      $("crmCopyShare").addEventListener("click", () => copy(url).then(() => toast("共有URLをコピーしました。")));
    } else if (tokenValue) {
      node.hidden = false;
      node.textContent = "公開しましたが共有URLを生成できません。CloudflareのPUBLIC_APP_URLを設定してください。";
    } else {
      node.hidden = true;
    }
  }

  function renderRecurring() {
    const items = care?.recurring_preferences || [];
    $("crmRecurringList").innerHTML = items.length ? items.map((item) => {
      const variant = item.product_variant || {};
      const product = variant.product || {};
      return `<article class="crm-care-card"><div class="crm-chip-row"><span class="crm-chip ${item.status === "active" ? "success" : ""}">${recurringStatus(item.status)}</span></div><h3>${esc(product.product_name || "商品")}</h3><p>${esc(variant.variant_name || "")}｜${num(item.quantity)}点｜${num(item.cycle_days)}日ごと</p><p>次回確認 ${date(item.next_confirmation_on)}｜${modeLabel(item.fulfillment_mode)}</p><div class="crm-record-actions"><button class="crm-btn secondary small" data-recurring-status="paused" data-recurring-id="${item.id}">一時停止</button><button class="crm-btn secondary small" data-recurring-status="active" data-recurring-id="${item.id}">再開</button><button class="crm-btn secondary small" data-recurring-status="ended" data-recurring-id="${item.id}">終了</button></div></article>`;
    }).join("") : empty("定期購入希望はありません。");
    $("crmRecurringList").querySelectorAll("[data-recurring-status]").forEach((button) => button.addEventListener("click", () => updateRecurring(button.dataset.recurringId, button.dataset.recurringStatus)));
  }

  function openRecurringDialog() {
    if (!selectedCustomer) return toast("お客様を選択してください。");
    $("crmRecurringForm").reset();
    populateSelects();
    $("crmRecurringCycle").value = 30;
    $("crmRecurringQty").value = 1;
    $("crmRecurringNext").value = addDays(today(), 30);
    $("crmRecurringDialog").showModal();
  }

  async function saveRecurring(event) {
    event.preventDefault();
    loading(true);
    try {
      await admin("/admin/recurring/upsert", {
        customer_id: selectedCustomer.id,
        product_variant_id: $("crmRecurringVariant").value,
        cycle_days: Number($("crmRecurringCycle").value),
        quantity: Number($("crmRecurringQty").value),
        fulfillment_mode: $("crmRecurringMode").value,
        next_confirmation_on: nullable($("crmRecurringNext").value),
        customer_note: nullable($("crmRecurringCustomerNote").value),
        staff_note: nullable($("crmRecurringStaffNote").value),
        assigned_staff_id: nullable($("crmRecurringStaff").value),
        explicit_customer_consent: $("crmRecurringConsent").checked,
      });
      await selectCustomer(selectedCustomer.id, false);
      $("crmRecurringDialog").close();
      toast("定期購入希望を登録しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  async function updateRecurring(id, status) {
    loading(true);
    try {
      await admin("/admin/recurring/update", { preference_id: id, status });
      await selectCustomer(selectedCustomer.id, false);
      toast("定期購入希望を更新しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  function renderSamples() {
    const sampleMap = new Map((ipad.samples || []).map((sample) => [sample.sample_id, sample.sample_name]));
    const items = care?.sample_followups || [];
    $("crmSampleList").innerHTML = items.length ? items.map((item) => `<article class="crm-care-card"><div class="crm-chip-row"><span class="crm-chip ${item.customer_evaluation === "positive" ? "success" : ""}">${sampleEval(item.customer_evaluation)}</span></div><h3>${esc(sampleMap.get(item.sample_id) || "サンプル")}</h3><p>配布 ${date(item.distributed_at)}｜確認 ${date(item.followup_due_at)}</p><p>使用 ${sampleUsage(item.usage_status)}｜意向 ${sampleIntent(item.purchase_intent)}</p>${item.feedback_note ? `<div class="crm-record-note">${esc(item.feedback_note)}</div>` : ""}<button class="crm-btn primary small" data-evaluate-sample="${item.id}" type="button">結果を記録</button></article>`).join("") : empty("サンプル配布履歴はありません。");
    $("crmSampleList").querySelectorAll("[data-evaluate-sample]").forEach((button) => button.addEventListener("click", () => openSampleDialog(button.dataset.evaluateSample)));
  }

  function openSampleDialog(id) {
    const item = (care?.sample_followups || []).find((sample) => sample.id === id);
    if (!item) return;
    $("crmSampleDistributionId").value = item.id;
    $("crmSampleUsage").value = item.usage_status || "unknown";
    $("crmSampleEvaluation").value = item.customer_evaluation || "unknown";
    $("crmSampleIntent").value = item.purchase_intent || "unknown";
    $("crmSampleFeedback").value = item.feedback_note || "";
    $("crmSampleDialog").showModal();
  }

  async function saveSampleEvaluation(event) {
    event.preventDefault();
    loading(true);
    try {
      await admin("/admin/samples/evaluate", {
        sample_distribution_id: $("crmSampleDistributionId").value,
        usage_status: $("crmSampleUsage").value,
        customer_evaluation: $("crmSampleEvaluation").value,
        purchase_intent: $("crmSampleIntent").value,
        feedback_note: nullable($("crmSampleFeedback").value),
      });
      await selectCustomer(selectedCustomer.id, false);
      $("crmSampleDialog").close();
      toast("サンプル結果を記録しました。");
    } catch (error) {
      globalError(errorMessage(error));
    } finally {
      loading(false);
    }
  }

  function variantMap() {
    const productMap = new Map((catalog.products || []).map((product) => [product.id, product]));
    return new Map((catalog.variants || []).map((variant) => [variant.id, { ...variant, label: `${productMap.get(variant.product_id)?.product_name || "商品"} ${variant.variant_name || variant.size_label || variant.sku || ""}` }]));
  }
  function groupBy(items, key) { const map = new Map(); for (const item of items) { const list = map.get(item[key]) || []; list.push(item); map.set(item[key], list); } return map; }
  function mediaSort(a, b) { return Number(b.is_primary) - Number(a.is_primary) || (a.sort_order || 0) - (b.sort_order || 0); }
  function splitList(value) { return [...new Set(String(value || "").split(/[、,\n]/).map((item) => item.trim()).filter(Boolean))]; }
  function nullable(value) { const text = String(value ?? "").trim(); return text || null; }
  function selected(a, b) { return a === b ? "selected" : ""; }
  function esc(value) { return D.escapeHtml(value ?? ""); }
  function num(value) { return new Intl.NumberFormat("ja-JP").format(Number(value || 0)); }
  function yen(value) { return D.formatYen(value); }
  function date(value) { return value ? (D.formatDate ? D.formatDate(value) : D.formatDateTime(value, { dateOnly: true })) : "―"; }
  function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  function addDays(iso, days) { const dateValue = new Date(`${iso}T00:00:00+09:00`); dateValue.setUTCDate(dateValue.getUTCDate() + Number(days)); return dateValue.toISOString().slice(0, 10); }
  function empty(message) { return `<div class="crm-empty">${esc(message)}</div>`; }
  function catalogStatus(value) { return ({ published: "公開中", draft: "下書き", hidden: "非表示", archived: "終了" })[value] || value || "未設定"; }
  function urgencyLabel(value) { return ({ overdue: "期限超過", today: "本日", within_7_days: "7日以内", future: "今後", date_unknown: "日付未定", closed: "完了" })[value] || value || "未定"; }
  function priorityLabel(value) { return ({ low: "低", normal: "通常", high: "高", urgent: "至急" })[value] || value; }
  function contactLabel(value) { return ({ not_contacted: "未連絡", contacted: "連絡済み", waiting_reply: "返信待ち", customer_replied: "返信あり", no_response: "応答なし", declined: "辞退" })[value] || value || "未確認"; }
  function remainingLabel(value) { return ({ full: "満量", high: "多い", half: "半分", low: "少ない", empty: "なし", unknown: "不明" })[value] || value; }
  function remainingPercent(value) { return ({ full: 100, high: 80, half: 50, low: 25, empty: 0, unknown: 40 })[value] ?? 40; }
  function activeStatus(value) { return ({ not_started: "未使用", using: "使用中", paused: "一時停止", finished: "使い切り", repurchased: "再購入済み", stopped: "中止" })[value] || value; }
  function recommendationStatus(value) { return ({ draft: "下書き", published: "公開中", expired: "期限切れ", closed: "終了", cancelled: "取消" })[value] || value; }
  function recurringStatus(value) { return ({ active: "有効", paused: "一時停止", skipped: "次回スキップ", ended: "終了" })[value] || value; }
  function modeLabel(value) { return ({ confirm_then_hold: "確認後に取り置き", automatic_hold: "自動取り置き", reminder_only: "案内のみ" })[value] || value; }
  function sampleUsage(value) { return ({ unknown: "未確認", not_used: "未使用", using: "使用中", used: "使用済み" })[value] || value; }
  function sampleEval(value) { return ({ unknown: "未確認", positive: "好感触", neutral: "普通", negative: "合わない", unsuitable: "使用中止" })[value] || value; }
  function sampleIntent(value) { return ({ unknown: "未確認", considering: "検討中", want_to_buy: "購入希望", purchased: "購入済み", not_now: "保留", declined: "購入しない" })[value] || value; }
  function loading(value) { $("crmLoading").hidden = !value; }
  function globalError(message) { $("crmGlobalError").textContent = message; $("crmGlobalError").hidden = !message; if (message) window.scrollTo({ top: 0, behavior: "smooth" }); }
  function loginError(message) { $("crmLoginError").textContent = message; $("crmLoginError").hidden = !message; }
  function errorMessage(error) { return error?.requestId ? `${error.message}（確認番号：${error.requestId}）` : error?.message || "エラーが発生しました。"; }
  function toast(message) { const node = $("crmToast"); node.textContent = message; node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 3200); }
  async function copy(text) { try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); } }
})();
