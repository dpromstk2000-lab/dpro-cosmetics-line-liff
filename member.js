(() => {
  "use strict";

  const D = window.DPRO;
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    D.setDemoBadge(document.getElementById("demoBadge"));
    document.getElementById("backLink").href = `index.html${D.querySuffix()}`;
    document.getElementById("notReadyBack").href = `index.html${D.querySuffix()}`;
    try {
      const [bootstrap, identityPayload] = await Promise.all([
        D.request("/public/bootstrap"),
        D.getIdentityPayload(),
      ]);
      renderStore(bootstrap.store);
      const result = await D.request("/member/summary", { method: "POST", body: identityPayload });
      render(result);
    } catch (error) {
      showError(error);
    }
  }

  function renderStore(store) {
    const name = store?.store_name || "DPROコスメティックサロン";
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = name; });
    document.title = `${name}｜マイページ`;
  }

  function render(result) {
    const member = result?.member || {};
    if (member.member_status !== "approved") {
      const message = member.message || "会員登録が完了していません。";
      document.getElementById("notReadyMessage").textContent = message;
      document.getElementById("notReadyView").hidden = false;
      document.getElementById("loadingView").hidden = true;
      return;
    }

    const customer = member.customer || {};
    document.getElementById("pageName").textContent = `${customer.full_name || "お客様"} 様`;
    document.getElementById("customerNo").textContent = customer.customer_no || "―";
    document.getElementById("fullName").textContent = customer.full_name || "―";
    document.getElementById("fullNameKana").textContent = customer.full_name_kana || "―";
    document.getElementById("phone").textContent = D.maskPhoneForSummary(customer.phone);
    document.getElementById("lastVisit").textContent = D.formatDateTime(customer.last_visit_at, { dateOnly: true });
    document.getElementById("lastPurchase").textContent = D.formatDateTime(customer.last_purchase_at, { dateOnly: true });
    document.getElementById("marketingConsent").textContent = member.consents?.marketing ? "受け取る" : "受け取らない";
    document.getElementById("favoriteCount").textContent = `${member.favorite_count || 0}件`;

    renderReservation(member.upcoming_reservation);
    renderHolds(member.active_holds || []);
    renderPurchases(member.recent_purchases || []);

    document.getElementById("loadingView").hidden = true;
    document.getElementById("memberContent").hidden = false;
  }

  function renderReservation(reservation) {
    const box = document.getElementById("reservationContent");
    if (!reservation) {
      box.innerHTML = '<p class="member-meta">現在、予定されている美容相談はありません。</p>';
      return;
    }
    box.innerHTML = `
      <div class="timeline-card">
        <span class="timeline-label">次回予約</span>
        <p class="timeline-value">${D.escapeHtml(D.formatDateTime(reservation.start_at))}</p>
        <p class="member-meta">${D.escapeHtml(reservation.menu_name || "美容相談")}／${D.escapeHtml(reservation.staff_name || "担当者おまかせ")}</p>
      </div>`;
  }

  function renderHolds(holds) {
    const box = document.getElementById("holdContent");
    if (!holds.length) {
      box.innerHTML = '<p class="member-meta">現在、受取待ちの商品はありません。</p>';
      return;
    }
    box.innerHTML = holds.map((hold) => `
      <div class="timeline-card">
        <span class="status-pill">${D.escapeHtml(statusLabel(hold.status))}</span>
        <p class="timeline-value">${D.escapeHtml(hold.hold_no || "取り置き")}</p>
        <p class="member-meta">受取希望日：${D.escapeHtml(hold.pickup_date || "未設定")}</p>
      </div>`).join("");
  }

  function renderPurchases(purchases) {
    const box = document.getElementById("purchaseContent");
    if (!purchases.length) {
      box.innerHTML = '<p class="member-meta">購入履歴はまだありません。</p>';
      return;
    }
    box.innerHTML = purchases.map((purchase) => `
      <div class="timeline-card">
        <span class="timeline-label">${D.escapeHtml(D.formatDateTime(purchase.purchased_at, { dateOnly: true }))}</span>
        <p class="timeline-value">${D.escapeHtml(D.formatYen(purchase.total_yen))}</p>
        <p class="member-meta">購入番号：${D.escapeHtml(purchase.purchase_no || "―")}</p>
      </div>`).join("");
  }

  function statusLabel(status) {
    const labels = {
      requested: "受付済み", checking: "在庫確認中", secured: "確保済み",
      backorder: "入荷待ち", ready: "受取可能",
    };
    return labels[status] || status || "受付中";
  }

  function showError(error) {
    document.getElementById("loadingView").hidden = true;
    document.getElementById("notReadyView").hidden = false;
    document.getElementById("notReadyMessage").textContent = error?.requestId
      ? `${error.message}（確認番号：${error.requestId}）`
      : (error?.message || "会員情報を読み込めませんでした。");
  }
})();
