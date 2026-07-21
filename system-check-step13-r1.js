(() => {
  "use strict";

  const VERSION = "COSMETICS-13-R1-UI-SYSTEM-CHECK-15-20260721";
  const BASE_PAGES = [
    ["LINEトップ", "index.html"],
    ["会員マイページ", "member.html"],
    ["美容相談予約", "consultation.html"],
    ["商品取り置き・再購入", "pickup.html"],
    ["商品問合せ", "inquiry.html"],
    ["新商品・キャンペーン", "campaigns.html"],
    ["オーナーPC管理", "owner.html"],
    ["スタッフiPad", "owner-ipad.html"],
    ["店舗運営設定", "owner-settings.html"],
    ["問合せ・販促管理", "owner-engagement.html"],
    ["system-check", "system-check.html"],
  ];

  const EXTRA_PAGES = [
    ["商品カタログ", "catalog.html"],
    ["商品詳細", "product.html"],
    ["マイコスメ", "my-cosmetics.html"],
    ["個別おすすめ", "recommendation.html"],
  ];

  const ALL_PAGES = [...BASE_PAGES, ...EXTRA_PAGES];

  let running = false;
  let lastSignature = "";
  let latestExtraResults = [];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    appendScreenLinks();
    bindFullReportActions();

    const results = document.getElementById("systemCheckPageResults");
    if (!results) return;

    const observer = new MutationObserver(() => {
      const baseCards = results.querySelectorAll(
        ".system-check-page-card:not([data-step13-r1])",
      );
      if (baseCards.length < 11 || running) return;

      const signature = Array.from(baseCards)
        .map((card) => card.textContent.trim())
        .join("|");
      if (signature === lastSignature && results.dataset.step13R1 === "done") return;

      lastSignature = signature;
      runExtraChecks(baseCards.length);
    });

    observer.observe(results, { childList: true, subtree: true });

    if (results.children.length >= 11) runExtraChecks(11);
  }

  async function runExtraChecks(baseTotal) {
    running = true;
    const container = document.getElementById("systemCheckPageResults");
    container.querySelectorAll("[data-step13-r1]").forEach((node) => node.remove());
    container.dataset.step13R1 = "checking";

    try {
      const extraResults = await Promise.all(
        EXTRA_PAGES.map(async ([label, path]) => {
          const url = new URL(path, location.href);
          const demo = new URLSearchParams(location.search).get("demo");
          if (demo) url.searchParams.set("demo", demo);

          const started = performance.now();
          try {
            const response = await fetch(url.toString(), {
              method: "GET",
              cache: "no-store",
              credentials: "same-origin",
            });
            const text = await response.text();
            const htmlOk = /<!doctype html>|<html[\s>]/i.test(text);
            return {
              label,
              path,
              url: url.toString(),
              ok: response.ok && htmlOk,
              status: response.status,
              elapsed_ms: Math.round(performance.now() - started),
            };
          } catch (error) {
            return {
              label,
              path,
              url: url.toString(),
              ok: false,
              status: 0,
              error: error.message,
              elapsed_ms: Math.round(performance.now() - started),
            };
          }
        }),
      );

      latestExtraResults = extraResults;

      container.insertAdjacentHTML(
        "beforeend",
        extraResults.map(renderCard).join(""),
      );

      const basePassed = container.querySelectorAll(
        ".system-check-page-card:not([data-step13-r1]).is-success",
      ).length;
      const extraPassed = extraResults.filter((item) => item.ok).length;
      const total = baseTotal + EXTRA_PAGES.length;
      const passed = basePassed + extraPassed;

      const count = document.getElementById("systemCheckPageCount");
      if (count) {
        count.textContent = `${passed}/${total}`;
        count.title = `STEP COSMETICS-13-R1｜${VERSION}`;
      }

      const overall = document.getElementById("systemCheckOverall");
      if (extraPassed !== EXTRA_PAGES.length && overall) {
        overall.classList.remove("is-success");
        overall.classList.add("is-failure");
        document.getElementById("systemCheckOverallIcon").textContent = "!";
        document.getElementById("systemCheckOverallTitle").textContent =
          "追加画面に確認が必要です";
        document.getElementById("systemCheckOverallMessage").textContent =
          "商品カタログ・商品詳細・マイコスメ・個別おすすめ画面を確認してください。";
      }

      container.dataset.step13R1 = "done";
      window.DPRO_COSMETICS_STEP13_R1_PAGE_REPORT = Object.freeze({
        ok: extraPassed === EXTRA_PAGES.length,
        version: VERSION,
        passed,
        total,
        extra_results: extraResults,
      });
    } finally {
      running = false;
    }
  }

  function renderCard(item) {
    const escape = window.DPRO?.escapeHtml || ((value) => String(value));
    return `
      <article
        class="system-check-page-card ${item.ok ? "is-success" : "is-failure"}"
        data-step13-r1="true"
      >
        <div class="system-check-page-icon">${item.ok ? "✓" : "×"}</div>
        <div>
          <strong>${escape(item.label)}</strong>
          <span>${item.ok ? "表示OK" : `エラー ${item.status || ""}`}</span>
          <small>${escape(item.path)}｜${item.elapsed_ms}ms｜R1追加</small>
        </div>
        <a href="${escape(item.url)}" target="_blank" rel="noopener">開く</a>
      </article>
    `;
  }

  function bindFullReportActions() {
    const copyButton = document.getElementById("copySystemCheckButton");
    const downloadButton = document.getElementById("downloadSystemCheckButton");

    copyButton?.addEventListener("click", async (event) => {
      if (copyButton.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      copyButton.disabled = true;
      const original = copyButton.textContent;
      copyButton.textContent = "15画面を集計中…";
      try {
        const report = await buildFullReport();
        await copyText(JSON.stringify(report, null, 2));
        window.DPRO?.showToast("15画面を含む検査JSONをコピーしました。");
      } catch (error) {
        window.DPRO?.showToast(error.message || "検査JSONを作成できませんでした。");
      } finally {
        copyButton.disabled = false;
        copyButton.textContent = original;
      }
    }, true);

    downloadButton?.addEventListener("click", async (event) => {
      if (downloadButton.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      downloadButton.disabled = true;
      const original = downloadButton.textContent;
      downloadButton.textContent = "15画面を集計中…";
      try {
        const report = await buildFullReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `dpro-cosmetics-system-check-15-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        window.DPRO?.showToast("15画面を含む検査結果を保存しました。");
      } catch (error) {
        window.DPRO?.showToast(error.message || "検査結果を保存できませんでした。");
      } finally {
        downloadButton.disabled = false;
        downloadButton.textContent = original;
      }
    }, true);
  }

  async function buildFullReport() {
    const token = sessionStorage.getItem("dpro_cosmetics_owner_token");
    if (!token) {
      throw new Error("管理者認証の有効期限が切れています。もう一度開いてください。");
    }

    const [api, pages] = await Promise.all([
      window.DPRO.request("/admin/system-check", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }),
      checkPageSet(ALL_PAGES),
    ]);

    return {
      ok: Boolean(api.overall_ok && pages.ok),
      checked_at: new Date().toISOString(),
      version: VERSION,
      api,
      pages,
      step13_r1: {
        ok: latestExtraResults.every((item) => item.ok),
        version: VERSION,
        extra_results: latestExtraResults,
      },
      browser: {
        user_agent: navigator.userAgent,
        location: location.href,
      },
    };
  }

  async function checkPageSet(definitions) {
    const results = await Promise.all(
      definitions.map(async ([label, path]) => {
        const url = new URL(path, location.href);
        const demo = new URLSearchParams(location.search).get("demo");
        if (demo) url.searchParams.set("demo", demo);

        const started = performance.now();
        try {
          const response = await fetch(url.toString(), {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
          });
          const text = await response.text();
          const htmlOk = /<!doctype html>|<html[\s>]/i.test(text);
          return {
            label,
            path,
            url: url.toString(),
            ok: response.ok && htmlOk,
            status: response.status,
            html_ok: htmlOk,
            elapsed_ms: Math.round(performance.now() - started),
          };
        } catch (error) {
          return {
            label,
            path,
            url: url.toString(),
            ok: false,
            status: 0,
            html_ok: false,
            error: error.message,
            elapsed_ms: Math.round(performance.now() - started),
          };
        }
      }),
    );

    return {
      ok: results.every((item) => item.ok),
      passed: results.filter((item) => item.ok).length,
      total: results.length,
      results,
    };
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  function appendScreenLinks() {
    const container = document.getElementById("systemCheckScreenLinks");
    if (!container || container.querySelector("[data-step13-r1-link]")) return;

    const demo = new URLSearchParams(location.search).get("demo");
    EXTRA_PAGES.forEach(([label, path]) => {
      const url = new URL(path, location.href);
      if (demo) url.searchParams.set("demo", demo);

      const link = document.createElement("a");
      link.className = "system-check-screen-link";
      link.dataset.step13R1Link = "true";
      link.href = url.toString();
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = label;

      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      link.append(arrow);
      container.append(link);
    });
  }
})();
