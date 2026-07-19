(() => {
  "use strict";

  const D = window.DPRO;
  const views = ["loadingView", "memberView", "registerView", "pendingView", "errorView"];
  let bootstrap = null;
  let identityPayload = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    D.setDemoBadge(document.getElementById("demoBadge"));
    bindEvents();
    try {
      bootstrap = await D.request("/public/bootstrap");
      renderStore(bootstrap.store);
      identityPayload = await D.getIdentityPayload();
      const result = await D.request("/member/resolve", { method: "POST", body: identityPayload });
      renderMemberState(result);
    } catch (error) {
      showError(error);
    }
  }

  function bindEvents() {
    document.getElementById("registerForm")?.addEventListener("submit", submitRegistration);
    document.querySelectorAll("[data-coming-soon]").forEach((button) => {
      button.addEventListener("click", () => D.showToast(button.dataset.comingSoon));
    });
    document.getElementById("consultationButton")?.addEventListener("click", () => {
      window.location.href = `${D.config.CONSULTATION_PAGE}${D.querySuffix()}`;
    });
    document.getElementById("memberPageButton")?.addEventListener("click", () => {
      window.location.href = `${D.config.MEMBER_PAGE}${D.querySuffix()}`;
    });
    document.getElementById("retryButton")?.addEventListener("click", () => window.location.reload());
  }

  function renderStore(store) {
    const name = store?.store_name || "DPROコスメティックサロン";
    const subtitle = store?.subtitle || "美容相談・商品取り置き・購入履歴・再購入フォロー";
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = name; });
    document.querySelectorAll("[data-store-subtitle]").forEach((el) => { el.textContent = subtitle; });
    document.title = `${name}｜LINE会員ページ`;
  }

  function renderMemberState(result) {
    const member = result?.member || {};
    if (member.member_status === "approved") {
      renderApproved(result.identity, member);
      return;
    }
    if (member.member_status === "pending") {
      document.getElementById("pendingMessage").textContent = member.message || "店舗で連携を確認しています。";
      showView("pendingView");
      return;
    }
    if (member.member_status === "unavailable") {
      throw new Error(member.message || "会員情報を利用できません。店舗へお問い合わせください。");
    }
    renderRegistration(result.identity, member);
  }

  function renderApproved(identity, member) {
    const customer = member.customer || {};
    const displayName = customer.full_name || identity?.display_name || "お客様";
    document.getElementById("memberName").textContent = `${displayName} 様`;
    document.getElementById("customerNo").textContent = customer.customer_no || "―";
    document.getElementById("lastPurchase").textContent = D.formatDateTime(customer.last_purchase_at, { dateOnly: true });
    document.getElementById("activeHoldCount").textContent = `${(member.active_holds || []).length}件`;

    const avatar = document.getElementById("memberAvatar");
    if (identity?.picture_url) {
      avatar.innerHTML = `<img src="${D.escapeHtml(identity.picture_url)}" alt="">`;
    } else {
      avatar.textContent = displayName.slice(0, 1);
    }

    const next = member.upcoming_reservation;
    const nextBox = document.getElementById("nextReservationBox");
    if (next) {
      nextBox.hidden = false;
      document.getElementById("nextReservationText").textContent = `${D.formatDateTime(next.start_at)}｜${next.menu_name || "美容相談"}`;
    } else {
      nextBox.hidden = true;
    }
    showView("memberView");
  }

  function renderRegistration(identity, member) {
    const intro = document.getElementById("registerIntro");
    intro.textContent = member?.message || "初回のみ、氏名と電話番号を登録してください。次回からLINEで自動表示します。";
    if (identity?.display_name && identity.source === "line_id_token") {
      const nameInput = document.getElementById("fullName");
      if (!nameInput.value) nameInput.value = identity.display_name;
    }
    showView("registerView");
  }

  async function submitRegistration(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById("registerButton");
    clearFormError();

    const fullName = form.full_name.value.trim();
    const fullNameKana = form.full_name_kana.value.trim();
    const phone = form.phone.value.trim();
    const privacyConsent = form.privacy_consent.checked;
    const lineLinkConsent = form.line_link_consent.checked;
    const marketingConsent = form.marketing_consent.checked;

    if (!fullName || !phone || !privacyConsent || !lineLinkConsent) {
      showFormError("氏名・電話番号と、必須の同意項目を確認してください。");
      return;
    }

    button.disabled = true;
    button.textContent = "登録しています…";
    try {
      const result = await D.request("/member/register", {
        method: "POST",
        body: {
          ...identityPayload,
          full_name: fullName,
          full_name_kana: fullNameKana || null,
          phone,
          privacy_consent: privacyConsent,
          line_link_consent: lineLinkConsent,
          marketing_consent: marketingConsent,
        },
      });

      if (result.registration?.member_status === "pending") {
        document.getElementById("pendingMessage").textContent = result.registration.message;
        showView("pendingView");
        return;
      }
      if (result.registration?.registration_status === "manual_review_required") {
        document.getElementById("pendingMessage").textContent = result.registration.message;
        showView("pendingView");
        return;
      }
      if (result.member?.member_status === "approved") {
        D.showToast(result.registration?.message || "会員登録が完了しました。");
        renderApproved(result.identity, result.member);
        return;
      }
      throw new Error(result.registration?.message || "登録結果を確認できませんでした。");
    } catch (error) {
      showFormError(withRequestId(error));
    } finally {
      button.disabled = false;
      button.textContent = "同意して会員登録する";
    }
  }

  function showView(id) {
    views.forEach((viewId) => {
      const el = document.getElementById(viewId);
      if (el) el.hidden = viewId !== id;
    });
  }

  function showFormError(message) {
    const box = document.getElementById("formError");
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearFormError() {
    const box = document.getElementById("formError");
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
