(() => {
  "use strict";

  const VERSION = "COSMETICS-14-OWNER-CRM-IPAD-CARE-20260721";
  let checking = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const groups = document.getElementById("systemCheckApiGroups");
    if (!groups) return;

    const observer = new MutationObserver(() => {
      const baseGroups = groups.querySelectorAll(".system-check-group:not([data-step14-api])");
      if (baseGroups.length >= 8 && !checking && !groups.querySelector("[data-step14-api]")) {
        runCrmApiCheck();
      }
    });
    observer.observe(groups, { childList: true, subtree: false });

    if (groups.querySelectorAll(".system-check-group:not([data-step14-api])").length >= 8) {
      runCrmApiCheck();
    }
  }

  async function runCrmApiCheck() {
    checking = true;
    const groups = document.getElementById("systemCheckApiGroups");
    const token = sessionStorage.getItem("dpro_cosmetics_owner_token");

    if (!token) {
      checking = false;
      return;
    }

    try {
      const [health, catalog, care, repurchase] = await Promise.all([
        window.DPRO.request("/health"),
        adminRequest("/admin/catalog/bootstrap", { limit: 1 }),
        adminRequest("/admin/care/bootstrap", { limit: 5 }),
        adminRequest("/admin/repurchase/list", { limit: 5 }),
      ]);

      const checks = [
        ["商品カタログAPI", catalog.ok === true],
        ["継続接客API", care.ok === true],
        ["再購入優先API", repurchase.ok === true],
        ["使用中商品管理", health.features?.active_product_management === true],
        ["個別おすすめ", health.features?.personal_recommendation_share === true],
        ["定期購入希望", health.features?.recurring_purchase_preferences === true],
        ["サンプル追跡", health.features?.sample_conversion_tracking === true],
        ["商品画像登録", health.features?.product_image_upload === true],
      ];
      const ok = checks.every(([, value]) => value);

      groups.insertAdjacentHTML("beforeend", groupHtml(ok, checks));
      if (!ok) markOverallFailure("商品・再購入CRM APIに確認が必要です。");

      window.DPRO_COSMETICS_STEP14_API_REPORT = Object.freeze({
        ok,
        version: VERSION,
        checks: Object.fromEntries(checks),
      });
    } catch (error) {
      const checks = [[error.message || "CRM API検査を実行できませんでした", false]];
      groups.insertAdjacentHTML("beforeend", groupHtml(false, checks));
      markOverallFailure("商品・再購入CRM APIを確認してください。");
    } finally {
      checking = false;
    }
  }

  async function adminRequest(path, body) {
    const token = sessionStorage.getItem("dpro_cosmetics_owner_token");
    return window.DPRO.request(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  }

  function groupHtml(ok, checks) {
    const escape = window.DPRO.escapeHtml;
    return `
      <article class="card system-check-group ${ok ? "is-success" : "is-failure"}" data-step14-api="true">
        <div class="system-check-group-heading">
          <div class="system-check-group-icon">✨</div>
          <div><h3>商品・再購入CRM</h3><p>${ok ? "正常" : "要確認"}</p></div>
          <span class="system-check-state">${ok ? "✓" : "!"}</span>
        </div>
        <div class="system-check-list">
          ${checks.map(([label, value]) => `
            <div class="system-check-row ${value ? "is-success" : "is-failure"}">
              <span class="system-check-row-icon">${value ? "✓" : "×"}</span>
              <span>${escape(label)}</span>
            </div>`).join("")}
        </div>
      </article>`;
  }

  function markOverallFailure(message) {
    const overall = document.getElementById("systemCheckOverall");
    if (!overall) return;
    overall.classList.remove("is-success");
    overall.classList.add("is-failure");
    document.getElementById("systemCheckOverallIcon").textContent = "!";
    document.getElementById("systemCheckOverallTitle").textContent = "追加機能に確認が必要です";
    document.getElementById("systemCheckOverallMessage").textContent = message;
  }
})();
