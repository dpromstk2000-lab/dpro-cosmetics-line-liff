(() => {
  "use strict";
  const D = window.DPRO;
  let identity = null;
  let bootstrap = null;

  const statusLabels = {
    new:"受付済み",in_progress:"確認中",waiting_customer:"お客様確認待ち",
    waiting_manufacturer:"メーカー確認中",resolved:"回答済み",closed:"終了"
  };
  const typeLabels = {
    product_question:"商品について",usage:"使い方",hold:"取り置き",
    return_exchange:"返品・交換",post_use_concern:"使用後の相談",other:"その他"
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    D.setDemoBadge(document.getElementById("demoBadge"));
    document.querySelector("[data-top-link]").href = `index.html${D.querySuffix()}`;
    bind();
    await load();
  }

  function bind() {
    document.getElementById("inquiryForm").addEventListener("submit", submit);
    document.getElementById("inquiryRefreshButton").addEventListener("click", load);
    document.getElementById("inquiryMessage").addEventListener("input", updateCount);
    document.querySelectorAll('input[name="inquiryType"]').forEach((radio) => {
      radio.addEventListener("change", updateTypeNotice);
    });
  }

  async function load() {
    setLoading(true); showError("");
    try {
      identity = await D.getIdentityPayload();
      const response = await D.request("/inquiry/bootstrap", {method:"POST",body:identity});
      bootstrap = response.inquiry;
      render();
    } catch (error) {
      showError(withRequest(error));
    } finally {
      setLoading(false);
    }
  }

  function render() {
    if (bootstrap.member_status !== "approved") {
      showError(bootstrap.message || "会員登録と店舗承認が必要です。");
      document.getElementById("inquiryContent").hidden = true;
      return;
    }
    const customer = bootstrap.customer || {};
    document.querySelectorAll("[data-store-name]").forEach((node) => node.textContent = bootstrap.store?.store_name || "DPROコスメティックサロン");
    document.getElementById("inquiryMemberName").textContent = `${customer.full_name || "お客様"} 様`;
    document.getElementById("inquiryMemberMeta").textContent = `${customer.customer_no || "―"}｜${customer.phone || "電話未登録"}`;
    renderPurchases();
    renderHistory();
    document.getElementById("inquiryContent").hidden = false;
  }

  function renderPurchases() {
    const select = document.getElementById("inquiryPurchase");
    const seen = new Set();
    const rows = (bootstrap.recent_purchases || []).filter((row) => {
      const key = `${row.purchase_id}:${row.product_variant_id}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    select.innerHTML = `<option value="">購入履歴を指定しない</option>` + rows.map((row) => {
      const payload = JSON.stringify({purchase_id:row.purchase_id,product_variant_id:row.product_variant_id});
      return `<option value="${D.escapeHtml(payload)}">${D.formatDateTime(row.purchased_at,{dateOnly:true})}｜${D.escapeHtml(row.product_name)} ${D.escapeHtml(row.variant_name||"")}</option>`;
    }).join("");
  }

  function renderHistory() {
    const container = document.getElementById("inquiryHistory");
    const inquiries = bootstrap.inquiries || [];
    if (!inquiries.length) {
      container.innerHTML = `<div class="card empty-state"><p>これまでの問合せはありません。</p></div>`;
      return;
    }
    container.innerHTML = inquiries.map((item) => `
      <article class="card inquiry-history-card">
        <div class="inquiry-history-head">
          <div>
            <span class="status-pill status-${item.status}">${D.escapeHtml(statusLabels[item.status]||item.status)}</span>
            <span class="inquiry-type-label">${D.escapeHtml(typeLabels[item.inquiry_type]||item.inquiry_type)}</span>
            <h3>${D.escapeHtml(item.subject)}</h3>
            <p>${D.formatDateTime(item.created_at)}｜${D.escapeHtml(item.inquiry_no)}</p>
          </div>
          <span class="inquiry-priority priority-${item.priority}">${item.priority==="urgent"?"至急":item.priority==="high"?"優先":"通常"}</span>
        </div>
        ${(item.product_name||item.purchase_no)?`<div class="inquiry-related">関連：${D.escapeHtml(item.product_name||"購入")} ${D.escapeHtml(item.variant_name||"")} ${item.purchase_no?`｜${D.escapeHtml(item.purchase_no)}`:""}</div>`:""}
        <div class="inquiry-message"><strong>お客様の内容</strong><p>${D.escapeHtml(item.message)}</p></div>
        ${item.response_message?`<div class="inquiry-response"><strong>店舗からの回答</strong><p>${D.escapeHtml(item.response_message)}</p><small>${D.formatDateTime(item.responded_at)}</small></div>`:`<div class="inquiry-waiting">店舗で確認しています。回答までお待ちください。</div>`}
      </article>
    `).join("");
  }

  async function submit(event) {
    event.preventDefault();
    formError("");
    const subject = document.getElementById("inquirySubject").value.trim();
    const message = document.getElementById("inquiryMessage").value.trim();
    if (!subject || !message) return formError("件名と問合せ内容を入力してください。");

    let related = {};
    const selected = document.getElementById("inquiryPurchase").value;
    if (selected) {
      try { related = JSON.parse(selected); } catch { related = {}; }
    }

    const button = document.getElementById("inquirySubmitButton");
    button.disabled = true; button.textContent = "送信しています…";
    try {
      const response = await D.request("/inquiry/create", {
        method:"POST",
        body:{
          ...identity,
          inquiry_type:document.querySelector('input[name="inquiryType"]:checked').value,
          subject,
          message,
          product_variant_id:related.product_variant_id||null,
          purchase_id:related.purchase_id||null
        }
      });
      D.showToast(response.created?.message || "問合せを送信しました。");
      document.getElementById("inquiryForm").reset();
      updateCount(); updateTypeNotice();
      await load();
      document.getElementById("inquiryHistory").scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) {
      formError(withRequest(error));
    } finally {
      button.disabled = false; button.textContent = "この内容で送信する";
    }
  }

  function updateTypeNotice() {
    document.getElementById("postUseNotice").hidden =
      document.querySelector('input[name="inquiryType"]:checked')?.value !== "post_use_concern";
  }
  function updateCount() {
    document.getElementById("inquiryMessageCount").textContent =
      `${document.getElementById("inquiryMessage").value.length}/3000文字`;
  }
  function setLoading(value) {
    document.getElementById("inquiryLoading").hidden = !value;
  }
  function showError(message) {
    const node = document.getElementById("inquiryError"); node.textContent = message; node.hidden = !message;
  }
  function formError(message) {
    const node = document.getElementById("inquiryFormError"); node.textContent = message; node.hidden = !message;
  }
  function withRequest(error) {
    return error?.requestId ? `${error.message}（確認番号：${error.requestId}）` : error?.message || "エラーが発生しました。";
  }
})();