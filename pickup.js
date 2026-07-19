(() => {
  "use strict";

  const D = window.DPRO;
  const categoryLabels = {
    cleansing: "クレンジング", face_wash: "洗顔", lotion: "化粧水", serum: "美容液",
    emulsion: "乳液", cream: "クリーム", uv: "UV", base_makeup: "化粧下地",
    foundation: "ファンデーション", point_makeup: "ポイントメイク", body: "ボディ",
    hair: "ヘア", fragrance: "香り", tool: "美容用品", gift: "ギフト", other: "その他",
  };
  const inventoryLabels = {
    in_stock: "在庫あり", low_stock: "残りわずか", check_required: "在庫確認",
    backorder: "入荷待ち", discontinued: "取扱終了",
  };
  const holdStatusLabels = {
    requested: "受付済み", checking: "在庫確認中", secured: "確保済み",
    backorder: "入荷待ち", ready: "受取可能",
  };

  let identityPayload = null;
  let pickupData = null;
  let currentView = "catalog";
  let cart = new Map();
  let pendingDuplicatePayload = null;
  let cancelTarget = null;
  let submitKey = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    D.setDemoBadge(document.getElementById("demoBadge"));
    document.getElementById("backLink").href = `index.html${D.querySuffix()}`;
    document.getElementById("notReadyBack").href = `index.html${D.querySuffix()}`;
    bindEvents();
    try {
      identityPayload = await D.getIdentityPayload();
      await loadPickupData();
    } catch (error) {
      showError(error);
    }
  }

  function bindEvents() {
    document.querySelectorAll(".pickup-tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    document.getElementById("productSearch").addEventListener("input", renderProducts);
    document.getElementById("categoryFilter").addEventListener("change", renderProducts);
    document.getElementById("pickupDate").addEventListener("change", updateSubmitState);
    document.getElementById("customerNote").addEventListener("input", (event) => {
      document.getElementById("noteCount").textContent = String(event.target.value.length);
    });
    document.getElementById("submitPickupButton").addEventListener("click", () => submitPickup(null));
    document.getElementById("mergeDuplicateButton").addEventListener("click", () => submitPickup("merge"));
    document.getElementById("separateDuplicateButton").addEventListener("click", () => submitPickup("separate"));
    document.getElementById("closeDuplicateDialog").addEventListener("click", closeDuplicateDialog);
    document.getElementById("cancelDuplicateButton").addEventListener("click", closeDuplicateDialog);
    document.getElementById("closeCancelHoldDialog").addEventListener("click", closeCancelHoldDialog);
    document.getElementById("backCancelHoldButton").addEventListener("click", closeCancelHoldDialog);
    document.getElementById("confirmCancelHoldButton").addEventListener("click", confirmHoldCancel);
    document.getElementById("retryButton").addEventListener("click", () => window.location.reload());
  }

  async function loadPickupData() {
    const result = await D.request("/pickup/bootstrap", { method: "POST", body: identityPayload });
    pickupData = result.pickup || {};
    if (pickupData.member_status !== "approved") {
      document.getElementById("notReadyMessage").textContent = pickupData.message || "会員登録が完了していません。";
      showView("notReadyView");
      return;
    }
    renderStore();
    setDateLimits();
    fillCategories();
    renderActiveHolds();
    const requestedView = new URLSearchParams(window.location.search).get("view");
    currentView = ["catalog", "history", "favorites"].includes(requestedView) ? requestedView : "catalog";
    switchView(currentView);
    renderCart();
    showView("pickupContent");
  }

  function renderStore() {
    const name = "DPROコスメティックサロン";
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = name; });
    document.getElementById("memberName").textContent = pickupData.customer?.full_name || "お客様";
    document.title = `${name}｜商品取り置き・再購入`;
  }

  function setDateLimits() {
    const input = document.getElementById("pickupDate");
    input.min = pickupData.settings?.pickup_min_date || "";
    input.max = pickupData.settings?.pickup_max_date || "";
    input.value = pickupData.settings?.pickup_min_date || "";
    document.getElementById("pickupDateHint").textContent = input.min && input.max
      ? `選択可能期間：${input.min.replaceAll("-", "/")}〜${input.max.replaceAll("-", "/")}`
      : "本日から30日以内で選択してください。";
  }

  function fillCategories() {
    const select = document.getElementById("categoryFilter");
    const categories = [...new Set((pickupData.products || []).map((product) => product.category))].sort();
    select.innerHTML = '<option value="">すべてのカテゴリ</option>' + categories.map((category) =>
      `<option value="${D.escapeHtml(category)}">${D.escapeHtml(categoryLabels[category] || category)}</option>`).join("");
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".pickup-tab").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.getElementById("productSearch").value = "";
    document.getElementById("categoryFilter").value = "";
    renderProducts();
  }

  function renderProducts() {
    const query = document.getElementById("productSearch").value.trim().toLowerCase();
    const category = document.getElementById("categoryFilter").value;
    let cards = [];

    if (currentView === "history") {
      cards = (pickupData.recent_purchase_items || []).map((item, index) => ({ type: "history", key: `${item.purchase_no}-${item.variant_id}-${index}`, item }));
    } else {
      for (const product of pickupData.products || []) {
        for (const variant of product.variants || []) {
          if (currentView === "favorites" && !variant.is_favorite) continue;
          cards.push({ type: "catalog", key: variant.variant_id, product, variant });
        }
      }
    }

    cards = cards.filter((card) => {
      const product = card.product || card.item;
      const variant = card.variant || card.item;
      const haystack = [product.product_name, product.brand_name, variant.variant_name, variant.color_name, variant.size_label, variant.capacity_ml].filter(Boolean).join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!category || product.category === category);
    });

    const list = document.getElementById("productList");
    if (!cards.length) {
      list.innerHTML = `<div class="empty-state product-empty">${currentView === "favorites" ? "お気に入りの商品はまだありません。" : "条件に合う商品がありません。"}</div>`;
    } else {
      list.innerHTML = cards.map(renderProductCard).join("");
      list.querySelectorAll("[data-add-variant]").forEach((button) => button.addEventListener("click", () => addToCart(button.dataset.addVariant)));
      list.querySelectorAll("[data-favorite-variant]").forEach((button) => button.addEventListener("click", () => toggleFavorite(button.dataset.favoriteVariant)));
    }
    document.getElementById("catalogStatus").textContent = currentView === "history"
      ? `購入履歴の商品 ${cards.length}件を表示しています。`
      : currentView === "favorites" ? `お気に入り ${cards.length}件を表示しています。` : `商品バリエーション ${cards.length}件を表示しています。`;
  }

  function renderProductCard(card) {
    const item = card.item || {};
    const product = card.product || item;
    const variant = card.variant || item;
    const history = card.type === "history";
    const variantId = variant.variant_id;
    const inventory = variant.inventory_status || "check_required";
    const favorite = Boolean(variant.is_favorite);
    const detailParts = [variant.variant_name, variant.color_name, variant.size_label, variant.capacity_ml ? `${variant.capacity_ml}mL` : null].filter(Boolean);
    const detail = [...new Set(detailParts)].join("／");
    return `
      <article class="product-card">
        <div class="product-card-top">
          <div class="product-symbol" aria-hidden="true">${product.category === "point_makeup" ? "💄" : product.category === "foundation" ? "🪞" : "🧴"}</div>
          <button class="favorite-button ${favorite ? "is-favorite" : ""}" data-favorite-variant="${D.escapeHtml(variantId)}" type="button" aria-label="お気に入り${favorite ? "から外す" : "に追加"}">${favorite ? "★" : "☆"}</button>
        </div>
        <p class="product-brand">${D.escapeHtml(product.brand_name || "ブランド未設定")}</p>
        <h3>${D.escapeHtml(product.product_name || "商品")}</h3>
        <p class="variant-detail">${D.escapeHtml(detail || "標準")}</p>
        ${history ? `<p class="purchase-date">前回購入：${D.escapeHtml(D.formatDateTime(item.purchased_at, { dateOnly: true }))}</p>` : `<p class="product-description">${D.escapeHtml(product.description || "店頭で商品をご確認いただけます。")}</p>`}
        <div class="product-meta-row">
          <span class="inventory-pill status-${D.escapeHtml(inventory)}">${D.escapeHtml(inventoryLabels[inventory] || inventory)}</span>
          <strong>${D.escapeHtml(D.formatYen(variant.price_yen ?? variant.unit_price_yen))}</strong>
        </div>
        <button class="btn ${history ? "primary" : "secondary"} full" data-add-variant="${D.escapeHtml(variantId)}" type="button">${history ? "もう一度依頼する" : "カートに追加"}</button>
      </article>`;
  }

  function findVariant(variantId) {
    for (const product of pickupData.products || []) {
      const variant = (product.variants || []).find((candidate) => candidate.variant_id === variantId);
      if (variant) return { product, variant };
    }
    const history = (pickupData.recent_purchase_items || []).find((item) => item.variant_id === variantId);
    return history ? { product: history, variant: history } : null;
  }

  function addToCart(variantId) {
    const found = findVariant(variantId);
    if (!found) return;
    const existing = cart.get(variantId);
    const quantity = Math.min(20, (existing?.quantity || 0) + 1);
    cart.set(variantId, { ...found, quantity });
    submitKey = null;
    renderCart();
    D.showToast(`${found.product.product_name}を追加しました。`);
  }

  function changeQuantity(variantId, delta) {
    const item = cart.get(variantId);
    if (!item) return;
    const quantity = item.quantity + delta;
    if (quantity < 1) cart.delete(variantId);
    else item.quantity = Math.min(20, quantity);
    submitKey = null;
    renderCart();
  }

  function removeCartItem(variantId) {
    cart.delete(variantId);
    submitKey = null;
    renderCart();
  }

  function renderCart() {
    const items = [...cart.entries()];
    document.getElementById("cartEmpty").hidden = items.length > 0;
    const box = document.getElementById("cartItems");
    box.innerHTML = items.map(([variantId, item]) => {
      const name = item.product.product_name || "商品";
      const variantName = [item.variant.variant_name, item.variant.color_name, item.variant.size_label].filter(Boolean).join("／");
      const unit = Number(item.variant.price_yen ?? item.variant.unit_price_yen ?? 0);
      return `<div class="cart-item">
        <div class="cart-item-copy"><strong>${D.escapeHtml(name)}</strong><span>${D.escapeHtml(variantName || "標準")}</span><span>${D.escapeHtml(D.formatYen(unit))}</span></div>
        <div class="quantity-control" aria-label="${D.escapeHtml(name)}の数量">
          <button type="button" data-qty-minus="${D.escapeHtml(variantId)}" aria-label="数量を減らす">−</button>
          <strong>${item.quantity}</strong>
          <button type="button" data-qty-plus="${D.escapeHtml(variantId)}" aria-label="数量を増やす">＋</button>
        </div>
        <button class="remove-item-button" type="button" data-remove-variant="${D.escapeHtml(variantId)}">削除</button>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-qty-minus]").forEach((button) => button.addEventListener("click", () => changeQuantity(button.dataset.qtyMinus, -1)));
    box.querySelectorAll("[data-qty-plus]").forEach((button) => button.addEventListener("click", () => changeQuantity(button.dataset.qtyPlus, 1)));
    box.querySelectorAll("[data-remove-variant]").forEach((button) => button.addEventListener("click", () => removeCartItem(button.dataset.removeVariant)));

    const quantity = items.reduce((sum, [, item]) => sum + item.quantity, 0);
    const total = items.reduce((sum, [, item]) => sum + Number(item.variant.price_yen ?? item.variant.unit_price_yen ?? 0) * item.quantity, 0);
    document.getElementById("cartQuantity").textContent = `${quantity}点`;
    document.getElementById("cartTotal").textContent = D.formatYen(total);
    updateSubmitState();
  }

  async function toggleFavorite(variantId) {
    const found = findVariant(variantId);
    if (!found) return;
    const next = !Boolean(found.variant.is_favorite);
    try {
      const result = await D.request("/pickup/favorite", { method: "POST", body: { ...identityPayload, variant_id: variantId, is_favorite: next } });
      if (!result.favorite?.ok) throw new Error(result.favorite?.message || "お気に入りを更新できませんでした。");
      for (const product of pickupData.products || []) {
        const variant = (product.variants || []).find((candidate) => candidate.variant_id === variantId);
        if (variant) variant.is_favorite = next;
      }
      for (const item of pickupData.recent_purchase_items || []) if (item.variant_id === variantId) item.is_favorite = next;
      renderProducts();
      D.showToast(result.favorite.message);
    } catch (error) {
      showPickupError(withRequestId(error));
    }
  }

  async function submitPickup(duplicateAction) {
    if (!cart.size) return;
    const pickupDate = document.getElementById("pickupDate").value;
    if (!pickupDate) {
      showPickupError("受取希望日を選択してください。");
      return;
    }
    clearPickupError();
    const button = document.getElementById("submitPickupButton");
    button.disabled = true;
    button.textContent = "送信しています…";
    if (!submitKey) submitKey = createIdempotencyKey();
    const payload = {
      ...identityPayload,
      pickup_date: pickupDate,
      customer_note: document.getElementById("customerNote").value.trim() || null,
      items: [...cart.entries()].map(([variantId, item]) => ({ variant_id: variantId, quantity: item.quantity })),
      duplicate_action: duplicateAction,
      idempotency_key: submitKey,
    };
    try {
      const result = await D.request("/pickup/create", { method: "POST", body: payload });
      const pickup = result.pickup || {};
      if (pickup.requires_duplicate_action) {
        pendingDuplicatePayload = payload;
        renderDuplicateDialog(pickup.duplicates || []);
        return;
      }
      if (!pickup.ok) throw new Error(pickup.message || "取り置き依頼を登録できませんでした。");
      closeDuplicateDialog();
      D.showToast(pickup.message || "取り置き依頼を受け付けました。");
      cart.clear();
      submitKey = null;
      document.getElementById("customerNote").value = "";
      document.getElementById("noteCount").textContent = "0";
      renderCart();
      await loadPickupData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      showPickupError(withRequestId(error));
    } finally {
      button.disabled = false;
      button.textContent = "この内容で依頼する";
      updateSubmitState();
    }
  }

  function renderDuplicateDialog(duplicates) {
    const list = document.getElementById("duplicateList");
    list.innerHTML = duplicates.map((item) => `<div class="duplicate-card"><strong>${D.escapeHtml(item.product_name)}</strong><span>${D.escapeHtml(item.variant_name || "標準")}</span><span>取り置き番号：${D.escapeHtml(item.hold_no)}</span><span>現在 ${item.existing_quantity}点／今回 ${item.requested_quantity}点</span></div>`).join("");
    document.getElementById("duplicateDialog").showModal();
  }

  function closeDuplicateDialog() {
    pendingDuplicatePayload = null;
    const dialog = document.getElementById("duplicateDialog");
    if (dialog.open) dialog.close();
  }

  function renderActiveHolds() {
    const holds = pickupData.active_holds || [];
    const box = document.getElementById("activeHoldList");
    if (!holds.length) {
      box.innerHTML = '<div class="empty-state">現在、受取待ちの商品はありません。</div>';
      return;
    }
    box.innerHTML = holds.map((hold) => `<article class="hold-card">
      <div class="hold-card-heading"><div><span class="status-pill">${D.escapeHtml(holdStatusLabels[hold.status] || hold.status)}</span><h3>${D.escapeHtml(hold.hold_no)}</h3><p>受取希望日：${D.escapeHtml(hold.pickup_date || "未設定")}</p></div>${hold.can_cancel ? `<button class="btn soft" type="button" data-cancel-hold="${D.escapeHtml(hold.hold_no)}">キャンセル</button>` : ""}</div>
      <div class="hold-item-list">${(hold.items || []).map((item) => `<div><strong>${D.escapeHtml(item.product_name)}</strong><span>${D.escapeHtml(item.variant_name || "標準")}／${item.quantity}点</span></div>`).join("")}</div>
    </article>`).join("");
    box.querySelectorAll("[data-cancel-hold]").forEach((button) => button.addEventListener("click", () => openCancelHold(button.dataset.cancelHold)));
  }

  function openCancelHold(holdNo) {
    cancelTarget = holdNo;
    document.getElementById("cancelHoldText").textContent = `${holdNo} をキャンセルします。`;
    document.getElementById("cancelHoldReason").value = "";
    document.getElementById("cancelHoldError").hidden = true;
    document.getElementById("cancelHoldDialog").showModal();
  }

  function closeCancelHoldDialog() {
    cancelTarget = null;
    const dialog = document.getElementById("cancelHoldDialog");
    if (dialog.open) dialog.close();
  }

  async function confirmHoldCancel() {
    if (!cancelTarget) return;
    const button = document.getElementById("confirmCancelHoldButton");
    button.disabled = true;
    try {
      const result = await D.request("/pickup/cancel", { method: "POST", body: { ...identityPayload, hold_no: cancelTarget, reason: document.getElementById("cancelHoldReason").value.trim() || null } });
      if (!result.pickup?.ok) throw new Error(result.pickup?.message || "キャンセルできませんでした。");
      D.showToast(result.pickup.message);
      closeCancelHoldDialog();
      await loadPickupData();
    } catch (error) {
      const box = document.getElementById("cancelHoldError");
      box.textContent = withRequestId(error);
      box.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  function createIdempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const random = Math.random().toString(36).slice(2);
    return `pickup-${Date.now()}-${random}`;
  }

  function updateSubmitState() {
    document.getElementById("submitPickupButton").disabled = cart.size === 0 || !document.getElementById("pickupDate").value;
  }

  function showView(id) {
    ["loadingView", "notReadyView", "pickupContent", "errorView"].forEach((viewId) => {
      const el = document.getElementById(viewId);
      if (el) el.hidden = viewId !== id;
    });
  }

  function showPickupError(message) {
    const box = document.getElementById("pickupError");
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearPickupError() {
    const box = document.getElementById("pickupError");
    box.hidden = true;
    box.textContent = "";
  }

  function showError(error) {
    document.getElementById("errorMessage").textContent = withRequestId(error);
    showView("errorView");
  }

  function withRequestId(error) {
    return error?.requestId ? `${error.message}（確認番号：${error.requestId}）` : (error?.message || "エラーが発生しました。");
  }
})();
