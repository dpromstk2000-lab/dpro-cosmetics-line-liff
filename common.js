(() => {
  "use strict";

  const config = window.DPRO_COSMETICS_CONFIG;
  if (!config) throw new Error("config.jsが読み込まれていません。");

  const params = new URLSearchParams(window.location.search);
  const rawDemo = params.get("demo");
  const demoScenario = rawDemo === "new" ? "new"
    : rawDemo === "1" || rawDemo === "returning" ? "returning"
      : (!config.LIFF_ID && config.DEMO_WHEN_LIFF_ID_EMPTY ? "returning" : null);

  let identityPayloadPromise = null;
  let toastTimer = null;

  function apiUrl(path) {
    return `${String(config.API_BASE).replace(/\/+$/, "")}${path}`;
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS || 15000);
    try {
      const response = await fetch(apiUrl(path), {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        const message = data?.error?.message || data?.message || `通信に失敗しました（${response.status}）。`;
        const error = new Error(message);
        error.code = data?.error?.code || data?.code || "API_ERROR";
        error.status = response.status;
        error.requestId = data?.request_id || null;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("通信が混み合っています。時間をおいて再度お試しください。");
        timeoutError.code = "REQUEST_TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getIdentityPayload() {
    if (identityPayloadPromise) return identityPayloadPromise;
    identityPayloadPromise = (async () => {
      if (demoScenario) return { demo_scenario: demoScenario };

      if (!config.LIFF_ID) {
        throw new Error("LIFF IDが未設定です。デモURL（?demo=1）で確認するか、config.jsへLIFF IDを設定してください。");
      }
      if (!window.liff) throw new Error("LINE LIFF SDKを読み込めませんでした。通信環境を確認してください。");

      await window.liff.init({ liffId: config.LIFF_ID });
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return new Promise(() => {});
      }
      const idToken = window.liff.getIDToken();
      if (!idToken) throw new Error("LINEのログイン情報を取得できません。LINEから開き直してください。");
      return { id_token: idToken };
    })();
    return identityPayloadPromise;
  }

  async function loadLocalProfile() {
    if (demoScenario || !window.liff || !config.LIFF_ID) return null;
    try {
      await window.liff.ready;
      return await window.liff.getProfile();
    } catch {
      return null;
    }
  }

  function querySuffix() {
    return demoScenario ? `?demo=${demoScenario === "returning" ? "1" : "new"}` : "";
  }

  function appendQuery(url, paramsToAdd = {}) {
    const resolved = new URL(url, window.location.href);
    if (demoScenario) resolved.searchParams.set("demo", demoScenario === "returning" ? "1" : "new");
    Object.entries(paramsToAdd).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") resolved.searchParams.set(key, String(value));
    });
    return `${resolved.pathname.split("/").pop()}${resolved.search}`;
  }

  function setDemoBadge(element) {
    if (!element) return;
    if (demoScenario) {
      element.hidden = false;
      element.textContent = demoScenario === "new" ? "初回登録デモ" : "既存顧客デモ";
    } else {
      element.hidden = true;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDateTime(value, options = {}) {
    if (!value) return "―";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "―";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(options.dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
    }).format(date);
  }

  function formatDate(value) {
    if (!value) return "―";
    const raw = String(value).slice(0, 10);
    const parts = raw.split("-");
    return parts.length === 3 ? `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日` : raw;
  }

  function formatYen(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "―";
    return `${new Intl.NumberFormat("ja-JP").format(number)}円`;
  }

  function maskPhoneForSummary(value) {
    return value || "未登録";
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function injectStep13Links() {
    const file = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (file === "index.html" || file === "") {
      const grid = document.querySelector(".menu-grid");
      if (grid && !document.getElementById("catalogStep13Button")) {
        const catalogButton = document.createElement("button");
        catalogButton.id = "catalogStep13Button";
        catalogButton.className = "menu-button";
        catalogButton.type = "button";
        catalogButton.innerHTML = '<span class="coming-soon">写真付き</span><span class="menu-icon">🧴</span><span class="menu-title">商品カタログ</span><span class="menu-desc">写真・特徴・使い方・在庫を確認</span>';
        catalogButton.addEventListener("click", () => { window.location.href = appendQuery(config.CATALOG_PAGE); });

        const careButton = document.createElement("button");
        careButton.id = "myCosmeticsStep13Button";
        careButton.className = "menu-button";
        careButton.type = "button";
        careButton.innerHTML = '<span class="coming-soon">利用できます</span><span class="menu-icon">✨</span><span class="menu-title">マイコスメ</span><span class="menu-desc">使用中商品・再購入目安・おすすめ</span>';
        careButton.addEventListener("click", () => { window.location.href = appendQuery(config.MY_COSMETICS_PAGE); });
        grid.append(catalogButton, careButton);
      }
    }

    if (file === "member.html" && !document.getElementById("step13MemberLinks")) {
      const main = document.querySelector("main") || document.querySelector(".main");
      if (main) {
        const section = document.createElement("section");
        section.id = "step13MemberLinks";
        section.className = "card step13-member-links";
        section.innerHTML = `
          <div class="card-header"><div><p class="eyebrow">MY BEAUTY CARE</p><h2>マイコスメ・商品カタログ</h2><p class="member-meta">現在使用している商品、再購入目安、店舗からのおすすめを確認できます。</p></div><div class="status-icon" aria-hidden="true">✨</div></div>
          <div class="form-actions">
            <a class="btn primary" href="${escapeHtml(appendQuery(config.MY_COSMETICS_PAGE))}">マイコスメを開く</a>
            <a class="btn secondary" href="${escapeHtml(appendQuery(config.CATALOG_PAGE))}">写真付き商品カタログ</a>
          </div>`;
        main.append(section);
      }
    }
  }

  function injectStep14Links() {
    const file = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    const suffix = querySuffix();

    if (file === "owner.html") {
      const actions = document.querySelector(".owner-topbar-actions");
      if (actions && !document.getElementById("ownerCrmStep14Link")) {
        const link = document.createElement("a");
        link.id = "ownerCrmStep14Link";
        link.className = "btn ghost compact";
        link.href = `${config.OWNER_CRM_PAGE || "owner-crm.html"}${suffix}`;
        link.textContent = "商品・再購入CRM";
        const firstLink = actions.querySelector("a");
        actions.insertBefore(link, firstLink || actions.firstChild);
      }
    }

    if (file === "owner-ipad.html") {
      const actions = document.querySelector(".ipad-topbar-controls");
      if (actions && !document.getElementById("ipadCareStep14Link")) {
        const link = document.createElement("a");
        link.id = "ipadCareStep14Link";
        link.className = "btn ghost compact";
        link.href = `${config.OWNER_IPAD_CARE_PAGE || "owner-ipad-care.html"}${suffix}`;
        link.textContent = "継続接客";
        const refresh = document.getElementById("ipadRefreshButton");
        actions.insertBefore(link, refresh || actions.lastChild);
      }
    }
  }

  window.DPRO = Object.freeze({
    config,
    demoScenario,
    request,
    getIdentityPayload,
    loadLocalProfile,
    querySuffix,
    appendQuery,
    setDemoBadge,
    escapeHtml,
    formatDateTime,
    formatDate,
    formatYen,
    maskPhoneForSummary,
    showToast,
  });

  function injectAllDproLinks() {
    injectStep13Links();
    injectStep14Links();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectAllDproLinks);
  else injectAllDproLinks();
})();
