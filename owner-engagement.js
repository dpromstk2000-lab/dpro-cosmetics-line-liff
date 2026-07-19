(() => {
  "use strict";

  const D = window.DPRO;
  const TOKEN_KEY = "dpro_cosmetics_owner_token";
  const views = ["inquiries", "followups", "repurchase", "campaigns"];

  const inquiryStatusLabels = {
    new:"受付済み",in_progress:"確認中",waiting_customer:"お客様確認待ち",
    waiting_manufacturer:"メーカー確認中",resolved:"回答済み",closed:"終了"
  };
  const inquiryTypeLabels = {
    product_question:"商品について",usage:"使い方",hold:"取り置き",
    return_exchange:"返品・交換",post_use_concern:"使用後の相談",other:"その他"
  };
  const followupStatusLabels = {
    open:"未対応",scheduled:"予定",contacted:"連絡済み",waiting:"返信待ち",
    completed:"完了",cancelled:"キャンセル",not_needed:"対応不要"
  };
  const followupTypeLabels = {
    repurchase:"再購入",sample:"サンプル",birthday:"誕生日",consultation:"美容相談",
    inquiry:"問合せ",incident:"重要対応",manual:"手動"
  };
  const campaignStatusLabels = {
    draft:"下書き",approved:"承認済み",active:"公開中",paused:"一時停止",
    completed:"終了",cancelled:"中止"
  };
  const campaignTypeLabels = {
    general:"一般",new_product:"新商品",brand:"ブランド",birthday:"誕生日",
    repurchase:"再購入",coupon:"クーポン"
  };
  const targetStatusLabels = {
    pending:"未送信",excluded:"対象外",sent:"送信済み",failed:"失敗",
    responded:"反応あり",converted:"購入・成約"
  };

  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let data = null;
  let currentView = "inquiries";
  let selectedCampaignId = null;
  let selectedFollowupCustomer = null;
  let pendingConfirm = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bind();
    if (D.demoScenario) document.getElementById("engagementManagementCode").value = "1234";
    if (token) openApp().catch((error) => showLogin(withRequest(error)));
  }

  function bind() {
    document.getElementById("engagementLoginForm").addEventListener("submit", login);
    document.getElementById("engagementToggleCode").addEventListener("click", toggleCode);
    document.getElementById("engagementClearCode").addEventListener("click", clearCode);
    document.getElementById("engagementLogoutButton").addEventListener("click", logout);
    document.getElementById("engagementRefreshButton").addEventListener("click", refresh);
    document.querySelectorAll("[data-engagement-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.engagementView));
    });

    ["inquiryStatusFilter","inquiryPriorityFilter","inquirySearch"].forEach((id) => {
      document.getElementById(id).addEventListener(id === "inquirySearch" ? "input" : "change", renderInquiries);
    });
    ["followupStatusFilter","followupTypeFilter","followupSearch"].forEach((id) => {
      document.getElementById(id).addEventListener(id === "followupSearch" ? "input" : "change", renderFollowups);
    });

    document.getElementById("inquiryEditForm").addEventListener("submit", saveInquiry);
    document.getElementById("inquiryEditCancel").addEventListener("click", () => document.getElementById("inquiryEditDialog").close());

    document.getElementById("addFollowupButton").addEventListener("click", () => openFollowup());
    document.getElementById("followupEditForm").addEventListener("submit", saveFollowup);
    document.getElementById("followupEditCancel").addEventListener("click", () => document.getElementById("followupEditDialog").close());
    document.getElementById("followupCustomerSearchButton").addEventListener("click", searchFollowupCustomer);
    document.getElementById("followupCustomerQuery").addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); searchFollowupCustomer(); }
    });

    document.getElementById("addCampaignButton").addEventListener("click", () => openCampaign());
    document.getElementById("campaignEditForm").addEventListener("submit", saveCampaign);
    document.getElementById("campaignEditCancel").addEventListener("click", () => document.getElementById("campaignEditDialog").close());
    document.getElementById("generateTargetsButton").addEventListener("click", generateTargets);
    document.getElementById("copyCampaignContentButton").addEventListener("click", copyCampaignContent);

    document.getElementById("engagementConfirmCancel").addEventListener("click", closeConfirm);
    document.getElementById("engagementConfirmExecute").addEventListener("click", executeConfirm);
  }

  async function login(event) {
    event.preventDefault();
    loginError("");
    const code = document.getElementById("engagementManagementCode").value.trim();
    if (!code) return loginError("管理コードを入力してください。");
    try {
      const response = await D.request("/owner/auth", { method:"POST", body:{management_code:code} });
      token = response.admin_token;
      sessionStorage.setItem(TOKEN_KEY, token);
      document.getElementById("engagementManagementCode").value = "";
      await openApp();
    } catch (error) {
      loginError(withRequest(error));
    }
  }

  async function openApp() {
    document.getElementById("engagementLoginView").hidden = true;
    document.getElementById("engagementAppView").hidden = false;
    await load();
  }

  function showLogin(message) {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    document.getElementById("engagementAppView").hidden = true;
    document.getElementById("engagementLoginView").hidden = false;
    if (message) loginError(message);
  }

  function logout() {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  function toggleCode() {
    const input = document.getElementById("engagementManagementCode");
    input.type = input.type === "password" ? "text" : "password";
    document.getElementById("engagementToggleCode").textContent = input.type === "password" ? "表示" : "隠す";
  }

  function clearCode() {
    const input = document.getElementById("engagementManagementCode");
    input.value = "";
    input.focus();
  }

  async function adminRequest(path, body = {}) {
    try {
      return await D.request(path, {
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body
      });
    } catch (error) {
      if (error.status === 401) showLogin("管理者認証の有効期限が切れました。");
      throw error;
    }
  }

  async function load() {
    loading(true); globalError("");
    try {
      const response = await adminRequest("/admin/engagement/bootstrap", {limit:200});
      data = response.engagement;
      if (selectedCampaignId && !(data.campaigns || []).some((campaign) => campaign.id === selectedCampaignId)) {
        selectedCampaignId = null;
      }
      renderAll();
    } catch (error) {
      globalError(withRequest(error));
      throw error;
    } finally {
      loading(false);
    }
  }

  async function refresh() {
    await load();
    D.showToast("最新情報へ更新しました。");
  }

  function renderAll() {
    document.getElementById("engagementStoreName").textContent = data.store?.store_name || "DPROコスメティックサロン";
    document.getElementById("engagementDemoBadge").hidden = !data.store?.is_demo;
    renderSummary();
    populateStaffSelects();
    renderInquiries();
    renderFollowups();
    renderRepurchase();
    renderCampaigns();
    renderCampaignTargets();
  }

  function renderSummary() {
    const counts = data.counts || {};
    const items = [
      ["💬","未完了問合せ",counts.open_inquiries],
      ["⚠️","優先問合せ",counts.urgent_inquiries],
      ["🔔","未完了フォロー",counts.open_followups],
      ["⏰","期限超過",counts.overdue_followups],
      ["🔁","再購入候補",counts.repurchase_candidates],
      ["✨","公開中キャンペーン",counts.active_campaigns]
    ];
    document.getElementById("engagementSummary").innerHTML = items.map(([icon,label,value]) =>
      `<div class="engagement-summary-card"><span>${icon}</span><small>${label}</small><strong>${number(value)}件</strong></div>`
    ).join("");
  }

  function populateStaffSelects() {
    const options = `<option value="">担当未設定</option>` + (data.staff || []).map((staff) =>
      `<option value="${staff.id}">${D.escapeHtml(staff.display_name)}</option>`
    ).join("");
    document.getElementById("editInquiryStaff").innerHTML = options;
    document.getElementById("editFollowupStaff").innerHTML = options;
  }

  function renderInquiries() {
    const status = document.getElementById("inquiryStatusFilter").value;
    const priority = document.getElementById("inquiryPriorityFilter").value;
    const query = document.getElementById("inquirySearch").value.trim().toLowerCase();
    const rows = (data?.inquiries || []).filter((item) => {
      const statusOk = status === "all" || item.status === status;
      const priorityOk = priority === "all" || item.priority === priority;
      const haystack = [item.inquiry_no,item.full_name,item.customer_no,item.subject,item.message,item.product_name].join(" ").toLowerCase();
      return statusOk && priorityOk && (!query || haystack.includes(query));
    });

    const list = document.getElementById("inquiryAdminList");
    list.classList.toggle("single-item", rows.length === 1);
    if (!rows.length) {
      list.innerHTML = empty("条件に一致する問合せはありません。");
      return;
    }

    list.innerHTML = rows.map((item) => `
      <article class="card engagement-record ${item.priority === "urgent" ? "urgent-card" : item.priority === "high" ? "high-card" : ""}">
        <div class="engagement-record-head">
          <div>
            <span class="status-pill status-${item.status}">${inquiryStatusLabels[item.status] || item.status}</span>
            <span class="engagement-type-badge">${inquiryTypeLabels[item.inquiry_type] || item.inquiry_type}</span>
            <h2>${D.escapeHtml(item.subject)}</h2>
            <p>${D.escapeHtml(item.full_name || "顧客未紐付け")}｜${D.escapeHtml(item.inquiry_no)}｜${D.formatDateTime(item.created_at)}</p>
          </div>
          <div class="priority-display priority-${item.priority}">${priorityLabel(item.priority)}</div>
        </div>
        <div class="engagement-message">${D.escapeHtml(item.message)}</div>
        ${(item.product_name || item.purchase_no) ? `<div class="engagement-related">関連：${D.escapeHtml(item.product_name || "購入履歴")} ${D.escapeHtml(item.variant_name || "")} ${item.purchase_no ? `｜${D.escapeHtml(item.purchase_no)}` : ""}</div>` : ""}
        <div class="owner-record-meta">
          <span>担当 <strong>${D.escapeHtml(item.assigned_staff_name || "未設定")}</strong></span>
          <span>電話 <strong>${D.escapeHtml(item.phone || "未登録")}</strong></span>
          <span>メーカー確認 <strong>${item.manufacturer_confirmation_required ? "必要" : "不要"}</strong></span>
        </div>
        ${item.response_message ? `<div class="engagement-response-preview"><strong>回答</strong><p>${D.escapeHtml(item.response_message)}</p></div>` : ""}
        <button class="btn primary full-width" type="button" data-edit-inquiry="${item.id}">対応内容を開く</button>
      </article>
    `).join("");

    list.querySelectorAll("[data-edit-inquiry]").forEach((button) => {
      button.addEventListener("click", () => openInquiry(data.inquiries.find((item) => item.id === button.dataset.editInquiry)));
    });
  }

  function openInquiry(item) {
    setValue("editInquiryId", item.id);
    setValue("editInquiryStatus", item.status);
    setValue("editInquiryPriority", item.priority);
    setValue("editInquiryStaff", item.assigned_staff_id);
    setValue("editInquiryResponse", item.response_message);
    document.getElementById("editInquiryVisible").checked = item.response_visible_to_customer !== false;
    document.getElementById("editInquiryManufacturer").checked = !!item.manufacturer_confirmation_required;
    document.getElementById("editInquiryTitle").textContent = `${item.full_name || "お客様"} 様の問合せ`;
    document.getElementById("editInquiryOriginal").innerHTML = `
      <strong>${D.escapeHtml(item.subject)}</strong>
      <p>${D.escapeHtml(item.message)}</p>
      <small>${D.escapeHtml(item.inquiry_no)}｜${D.formatDateTime(item.created_at)}</small>`;
    formError("inquiryEditError","");
    document.getElementById("inquiryEditDialog").showModal();
  }

  async function saveInquiry(event) {
    event.preventDefault();
    formError("inquiryEditError","");
    try {
      await adminRequest("/admin/engagement/inquiries/update", {
        inquiry_id:value("editInquiryId"),
        status:value("editInquiryStatus"),
        priority:value("editInquiryPriority"),
        assigned_staff_id:value("editInquiryStaff"),
        response_message:value("editInquiryResponse"),
        response_visible:checked("editInquiryVisible"),
        manufacturer_required:checked("editInquiryManufacturer")
      });
      document.getElementById("inquiryEditDialog").close();
      D.showToast("問合せ対応を保存しました。");
      await load();
    } catch (error) {
      formError("inquiryEditError",withRequest(error));
    }
  }

  function renderFollowups() {
    const status = document.getElementById("followupStatusFilter").value;
    const type = document.getElementById("followupTypeFilter").value;
    const query = document.getElementById("followupSearch").value.trim().toLowerCase();
    const openStatuses = new Set(["open","scheduled","contacted","waiting"]);
    const rows = (data?.followups || []).filter((item) => {
      const statusOk = status === "all" || (status === "open_group" ? openStatuses.has(item.status) : item.status === status);
      const typeOk = type === "all" || item.task_type === type;
      const haystack = [item.full_name,item.customer_no,item.subject,item.note].join(" ").toLowerCase();
      return statusOk && typeOk && (!query || haystack.includes(query));
    });

    const list = document.getElementById("followupAdminList");
    list.classList.toggle("single-item", rows.length === 1);
    if (!rows.length) {
      list.innerHTML = empty("条件に一致するフォロー予定はありません。");
      return;
    }

    list.innerHTML = rows.map((item) => {
      const overdue = openStatuses.has(item.status) && new Date(item.due_at).getTime() < Date.now();
      return `<article class="card engagement-record ${overdue ? "overdue-card" : ""}">
        <div class="engagement-record-head">
          <div>
            <span class="status-pill status-${item.status}">${followupStatusLabels[item.status] || item.status}</span>
            <span class="engagement-type-badge">${followupTypeLabels[item.task_type] || item.task_type}</span>
            <h2>${D.escapeHtml(item.subject)}</h2>
            <p>${D.escapeHtml(item.full_name)}｜${D.formatDateTime(item.due_at)}${overdue ? "｜期限超過" : ""}</p>
          </div>
          <div class="priority-display priority-${item.priority}">${priorityLabel(item.priority)}</div>
        </div>
        ${item.note ? `<div class="engagement-message">${D.escapeHtml(item.note)}</div>` : ""}
        <div class="owner-record-meta">
          <span>担当 <strong>${D.escapeHtml(item.assigned_staff_name || "未設定")}</strong></span>
          <span>方法 <strong>${contactLabel(item.contact_channel)}</strong></span>
          <span>電話 <strong>${D.escapeHtml(item.phone || "未登録")}</strong></span>
        </div>
        <button class="btn secondary full-width" type="button" data-edit-followup="${item.id}">編集・対応結果</button>
      </article>`;
    }).join("");

    list.querySelectorAll("[data-edit-followup]").forEach((button) => {
      button.addEventListener("click", () => openFollowup(data.followups.find((item) => item.id === button.dataset.editFollowup)));
    });
  }

  function openFollowup(item = null) {
    document.getElementById("followupEditForm").reset();
    selectedFollowupCustomer = item ? {
      id:item.customer_id,full_name:item.full_name,customer_no:item.customer_no,phone:item.phone
    } : null;
    setValue("editFollowupId", item?.id);
    setValue("editFollowupCustomerId", item?.customer_id);
    setValue("editFollowupType", item?.task_type || "manual");
    setValue("editFollowupDue", toLocalDateTime(item?.due_at || new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setValue("editFollowupStatus", item?.status || "open");
    setValue("editFollowupPriority", item?.priority || "normal");
    setValue("editFollowupStaff", item?.assigned_staff_id);
    setValue("editFollowupChannel", item?.contact_channel || "line");
    setValue("editFollowupSubject", item?.subject);
    setValue("editFollowupNote", item?.note);
    document.getElementById("followupDialogTitle").textContent = item ? "フォロー予定を編集" : "フォローを追加";
    document.getElementById("followupCustomerSearchArea").hidden = !!item;
    document.getElementById("followupCustomerResults").innerHTML = "";
    document.getElementById("followupCustomerQuery").value = "";
    renderSelectedFollowupCustomer();
    formError("followupEditError","");
    document.getElementById("followupEditDialog").showModal();
  }

  async function searchFollowupCustomer() {
    const query = document.getElementById("followupCustomerQuery").value.trim();
    if (!query) return formError("followupEditError","顧客名・電話番号・顧客番号を入力してください。");
    formError("followupEditError","");
    try {
      const response = await adminRequest("/admin/owner/customers/search", {query,limit:20});
      const customers = response.result?.customers || [];
      const container = document.getElementById("followupCustomerResults");
      container.innerHTML = customers.length ? customers.map((customer) => `
        <button type="button" class="customer-result-button" data-select-customer="${customer.id}">
          <strong>${D.escapeHtml(customer.full_name)}</strong>
          <span>${D.escapeHtml(customer.customer_no)}｜${D.escapeHtml(customer.phone || "電話未登録")}</span>
        </button>`).join("") : `<p>該当する顧客が見つかりません。</p>`;
      container.querySelectorAll("[data-select-customer]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedFollowupCustomer = customers.find((customer) => customer.id === button.dataset.selectCustomer);
          setValue("editFollowupCustomerId", selectedFollowupCustomer.id);
          renderSelectedFollowupCustomer();
          container.innerHTML = "";
        });
      });
    } catch (error) {
      formError("followupEditError",withRequest(error));
    }
  }

  function renderSelectedFollowupCustomer() {
    const node = document.getElementById("selectedFollowupCustomer");
    if (!selectedFollowupCustomer) {
      node.hidden = true; node.innerHTML = "";
      return;
    }
    node.hidden = false;
    node.innerHTML = `<strong>${D.escapeHtml(selectedFollowupCustomer.full_name)}</strong><span>${D.escapeHtml(selectedFollowupCustomer.customer_no || "")}｜${D.escapeHtml(selectedFollowupCustomer.phone || "電話未登録")}</span>`;
  }

  async function saveFollowup(event) {
    event.preventDefault();
    formError("followupEditError","");
    if (!value("editFollowupCustomerId")) return formError("followupEditError","対象顧客を選択してください。");
    if (!value("editFollowupDue")) return formError("followupEditError","フォロー日時を入力してください。");
    try {
      await adminRequest("/admin/engagement/followups/upsert", {
        followup_id:value("editFollowupId"),
        customer_id:value("editFollowupCustomerId"),
        task_type:value("editFollowupType"),
        due_at:new Date(value("editFollowupDue")).toISOString(),
        status:value("editFollowupStatus"),
        priority:value("editFollowupPriority"),
        assigned_staff_id:value("editFollowupStaff"),
        subject:value("editFollowupSubject"),
        note:value("editFollowupNote"),
        contact_channel:value("editFollowupChannel")
      });
      document.getElementById("followupEditDialog").close();
      D.showToast("フォロー予定を保存しました。");
      await load();
    } catch (error) {
      formError("followupEditError",withRequest(error));
    }
  }

  function renderRepurchase() {
    const list = document.getElementById("repurchaseList");
    const rows = data?.repurchase_candidates || [];
    list.classList.toggle("single-item", rows.length === 1);
    if (!rows.length) {
      list.innerHTML = empty("現在、再購入時期を迎えた候補はありません。");
      return;
    }
    list.innerHTML = rows.map((item) => `
      <article class="card engagement-record">
        <div class="engagement-record-head">
          <div>
            <span class="status-pill ${item.marketing_allowed ? "status-active" : "status-cancelled"}">${item.marketing_allowed ? "案内同意あり" : "販促案内同意なし"}</span>
            <h2>${D.escapeHtml(item.full_name)}</h2>
            <p>${D.escapeHtml(item.customer_no)}｜${D.escapeHtml(item.product_name)} ${D.escapeHtml(item.variant_name || "")}</p>
          </div>
          <div class="repurchase-days">${overdueDays(item.expected_repurchase_at)}日</div>
        </div>
        <div class="owner-record-meta">
          <span>最終購入 <strong>${D.formatDateTime(item.last_purchased_at,{dateOnly:true})}</strong></span>
          <span>標準使用 <strong>${number(item.expected_days)}日</strong></span>
          <span>予想再購入日 <strong>${D.formatDateTime(item.expected_repurchase_at,{dateOnly:true})}</strong></span>
        </div>
        <button class="btn ${item.marketing_allowed ? "primary" : "secondary"} full-width" type="button"
          data-create-repurchase="${item.customer_id}:${item.product_variant_id}"
          ${item.marketing_allowed ? "" : "disabled"}>
          ${item.marketing_allowed ? "LINE再購入フォローを作成" : "同意がないため作成不可"}
        </button>
      </article>
    `).join("");
    list.querySelectorAll("[data-create-repurchase]").forEach((button) => {
      button.addEventListener("click", () => {
        const [customerId,variantId] = button.dataset.createRepurchase.split(":");
        const item = rows.find((row) => row.customer_id === customerId && row.product_variant_id === variantId);
        confirmAction(
          `${item.full_name} 様へ再購入フォローを作成しますか？`,
          `${item.product_name} ${item.variant_name || ""}の再購入時期として、LINE対応予定を作成します。`,
          async () => {
            await adminRequest("/admin/engagement/repurchase/create", {
              customer_id:customerId,
              product_variant_id:variantId,
              due_at:new Date().toISOString(),
              assigned_staff_id:null,
              note:`予想再購入日：${D.formatDateTime(item.expected_repurchase_at,{dateOnly:true})}`
            });
            D.showToast("再購入フォローを作成しました。");
            await load();
          }
        );
      });
    });
  }

  function renderCampaigns() {
    const list = document.getElementById("campaignAdminList");
    const rows = data?.campaigns || [];
    list.classList.toggle("single-item", rows.length === 1);
    if (!rows.length) {
      list.innerHTML = empty("キャンペーンはまだありません。");
      return;
    }
    list.innerHTML = rows.map((item) => `
      <article class="card engagement-record campaign-record ${selectedCampaignId === item.id ? "selected-campaign" : ""}">
        <div class="engagement-record-head">
          <div>
            <span class="status-pill status-${item.status}">${campaignStatusLabels[item.status] || item.status}</span>
            <span class="engagement-type-badge">${campaignTypeLabels[item.campaign_type] || item.campaign_type}</span>
            <h2>${D.escapeHtml(item.campaign_name)}</h2>
            <p>${D.escapeHtml(item.campaign_code)}｜${campaignPeriod(item)}</p>
          </div>
          <button class="btn secondary compact" type="button" data-edit-campaign="${item.id}">編集</button>
        </div>
        <div class="campaign-admin-content">${D.escapeHtml(item.approved_content || "案内文は未入力です。").replace(/\n/g,"<br>")}</div>
        <div class="owner-record-meta">
          <span>対象 <strong>${number(item.target_count)}名</strong></span>
          <span>未送信 <strong>${number(item.pending_count)}名</strong></span>
          <span>送信済み <strong>${number(item.sent_count)}名</strong></span>
          <span>反応・成約 <strong>${number(item.response_count)}名</strong></span>
        </div>
        <button class="btn primary full-width" type="button" data-select-campaign="${item.id}">対象を管理</button>
      </article>
    `).join("");

    list.querySelectorAll("[data-edit-campaign]").forEach((button) => {
      button.addEventListener("click", () => openCampaign(rows.find((item) => item.id === button.dataset.editCampaign)));
    });
    list.querySelectorAll("[data-select-campaign]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedCampaignId = button.dataset.selectCampaign;
        renderCampaigns();
        renderCampaignTargets();
      });
    });
  }

  function openCampaign(item = null) {
    document.getElementById("campaignEditForm").reset();
    setValue("editCampaignId",item?.id);
    setValue("editCampaignCode",item?.campaign_code || `campaign-${new Date().toISOString().slice(0,10).replace(/-/g,"")}`);
    setValue("editCampaignName",item?.campaign_name);
    setValue("editCampaignType",item?.campaign_type || "general");
    setValue("editCampaignStatus",item?.status || "draft");
    setValue("editCampaignStart",toLocalDateTime(item?.starts_at || new Date()));
    setValue("editCampaignEnd",item?.ends_at ? toLocalDateTime(item.ends_at) : "");
    setValue("editCampaignContent",item?.approved_content);
    document.getElementById("campaignDialogTitle").textContent = item ? "キャンペーンを編集" : "キャンペーンを追加";
    formError("campaignEditError","");
    document.getElementById("campaignEditDialog").showModal();
  }

  async function saveCampaign(event) {
    event.preventDefault();
    formError("campaignEditError","");
    try {
      await adminRequest("/admin/engagement/campaigns/upsert", {
        campaign_id:value("editCampaignId"),
        campaign:{
          campaign_code:value("editCampaignCode"),
          campaign_name:value("editCampaignName"),
          campaign_type:value("editCampaignType"),
          status:value("editCampaignStatus"),
          starts_at:value("editCampaignStart") ? new Date(value("editCampaignStart")).toISOString() : null,
          ends_at:value("editCampaignEnd") ? new Date(value("editCampaignEnd")).toISOString() : null,
          approved_content:value("editCampaignContent")
        }
      });
      document.getElementById("campaignEditDialog").close();
      D.showToast("キャンペーンを保存しました。");
      await load();
    } catch (error) {
      formError("campaignEditError",withRequest(error));
    }
  }

  function renderCampaignTargets() {
    const controls = document.getElementById("campaignTargetControls");
    const list = document.getElementById("campaignTargetList");
    const campaign = (data?.campaigns || []).find((item) => item.id === selectedCampaignId);
    if (!campaign) {
      document.getElementById("campaignTargetTitle").textContent = "配信対象";
      document.getElementById("campaignTargetHelp").textContent = "キャンペーンを選択してください。";
      controls.hidden = true;
      list.innerHTML = "";
      return;
    }
    document.getElementById("campaignTargetTitle").textContent = campaign.campaign_name;
    document.getElementById("campaignTargetHelp").textContent = "自動送信は行いません。対象と対応状況を管理します。";
    controls.hidden = false;
    const targets = (data.campaign_targets || []).filter((target) => target.campaign_id === campaign.id);
    if (!targets.length) {
      list.innerHTML = `<div class="empty-state compact-empty"><p>対象候補はまだありません。</p></div>`;
      return;
    }
    list.innerHTML = targets.map((target) => `
      <div class="campaign-target-item">
        <div>
          <span class="status-pill status-${target.send_status}">${targetStatusLabels[target.send_status] || target.send_status}</span>
          <strong>${D.escapeHtml(target.full_name)}</strong>
          <small>${D.escapeHtml(target.customer_no)}｜${D.escapeHtml(target.target_reason || "")}</small>
        </div>
        <select data-target-status="${target.id}" aria-label="${D.escapeHtml(target.full_name)}の状態">
          ${Object.entries(targetStatusLabels).map(([value,label]) => `<option value="${value}" ${value === target.send_status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
    `).join("");
    list.querySelectorAll("[data-target-status]").forEach((select) => {
      select.addEventListener("change", async () => {
        try {
          await adminRequest("/admin/engagement/campaigns/targets/update", {
            target_id:select.dataset.targetStatus,
            send_status:select.value
          });
          D.showToast("対象の状態を更新しました。");
          await load();
        } catch (error) {
          globalError(withRequest(error));
        }
      });
    });
  }

  async function generateTargets() {
    if (!selectedCampaignId) return;
    const segment = document.getElementById("campaignSegment").value;
    confirmAction(
      "キャンペーン対象候補を作成しますか？",
      "マーケティング同意済み・LINE連携承認済みの顧客だけが追加されます。重複は作成されません。",
      async () => {
        const response = await adminRequest("/admin/engagement/campaigns/targets/generate", {
          campaign_id:selectedCampaignId,
          segment
        });
        D.showToast(`${number(response.generated?.inserted_count)}名を追加しました。`);
        await load();
      }
    );
  }

  async function copyCampaignContent() {
    const campaign = (data?.campaigns || []).find((item) => item.id === selectedCampaignId);
    if (!campaign?.approved_content) return D.showToast("コピーできる案内文がありません。");
    try {
      await navigator.clipboard.writeText(campaign.approved_content);
      D.showToast("案内文をコピーしました。");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = campaign.approved_content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      D.showToast("案内文をコピーしました。");
    }
  }

  function switchView(name) {
    if (!views.includes(name)) return;
    currentView = name;
    document.querySelectorAll("[data-engagement-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.engagementView === name);
    });
    views.forEach((view) => {
      document.getElementById(`engagementView${capitalize(view)}`).hidden = view !== name;
    });
  }

  function confirmAction(title,message,callback) {
    pendingConfirm = callback;
    document.getElementById("engagementConfirmTitle").textContent = title;
    document.getElementById("engagementConfirmMessage").textContent = message;
    document.getElementById("engagementConfirmDialog").showModal();
  }
  function closeConfirm() {
    pendingConfirm = null;
    document.getElementById("engagementConfirmDialog").close();
  }
  async function executeConfirm() {
    if (!pendingConfirm) return;
    const callback = pendingConfirm;
    const button = document.getElementById("engagementConfirmExecute");
    button.disabled = true; button.textContent = "実行しています…";
    try {
      await callback();
      closeConfirm();
    } catch (error) {
      closeConfirm();
      globalError(withRequest(error));
    } finally {
      button.disabled = false; button.textContent = "実行する";
    }
  }

  function value(id) { return document.getElementById(id).value.trim() || null; }
  function setValue(id,valueText) { document.getElementById(id).value = valueText ?? ""; }
  function checked(id) { return document.getElementById(id).checked; }
  function loading(show) { document.getElementById("engagementLoading").hidden = !show; }
  function globalError(message) { const node=document.getElementById("engagementGlobalError");node.textContent=message;node.hidden=!message; }
  function loginError(message) { const node=document.getElementById("engagementLoginError");node.textContent=message;node.hidden=!message; }
  function formError(id,message) { const node=document.getElementById(id);node.textContent=message;node.hidden=!message; }
  function withRequest(error) { return error?.requestId ? `${error.message}（確認番号：${error.requestId}）` : error?.message || "エラーが発生しました。"; }
  function empty(message) { return `<div class="card empty-state engagement-empty"><p>${D.escapeHtml(message)}</p></div>`; }
  function number(valueText) { return new Intl.NumberFormat("ja-JP").format(Number(valueText || 0)); }
  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }
  function priorityLabel(priority) { return ({low:"低",normal:"通常",high:"高",urgent:"至急"})[priority] || priority; }
  function contactLabel(channel) { return ({line:"LINE",phone:"電話",email:"メール",in_person:"店頭",none:"連絡なし"})[channel] || channel; }
  function overdueDays(dateValue) {
    const diff = Math.floor((Date.now() - new Date(dateValue).getTime()) / 86400000);
    return Math.max(0,diff);
  }
  function campaignPeriod(item) {
    const start = item.starts_at ? D.formatDateTime(item.starts_at,{dateOnly:true}) : "開始日未定";
    const end = item.ends_at ? D.formatDateTime(item.ends_at,{dateOnly:true}) : "終了日未定";
    return `${start}〜${end}`;
  }
  function toLocalDateTime(valueText) {
    const date = valueText instanceof Date ? valueText : new Date(valueText);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2,"0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
})();