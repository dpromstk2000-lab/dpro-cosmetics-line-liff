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
        const message = data?.error?.message || `通信に失敗しました（${response.status}）。`;
        const error = new Error(message);
        error.code = data?.error?.code || "API_ERROR";
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

  window.DPRO = Object.freeze({
    config,
    demoScenario,
    request,
    getIdentityPayload,
    loadLocalProfile,
    querySuffix,
    setDemoBadge,
    escapeHtml,
    formatDateTime,
    formatYen,
    maskPhoneForSummary,
    showToast,
  });
})();
