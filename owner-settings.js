(() => {
  "use strict";
  const D = window.DPRO;
  const TOKEN_KEY = "dpro_cosmetics_owner_token";
  const views = ["store","staff","products","holidays"];
  const dayLabels = {mon:"月",tue:"火",wed:"水",thu:"木",fri:"金",sat:"土",sun:"日"};
  const categoryLabels = {
    cleansing:"クレンジング",face_wash:"洗顔",lotion:"化粧水",serum:"美容液",
    emulsion:"乳液",cream:"クリーム",uv:"UV",base_makeup:"化粧下地",
    foundation:"ファンデーション",point_makeup:"ポイントメイク",body:"ボディ",
    hair:"ヘア",fragrance:"フレグランス",tool:"美容ツール",gift:"ギフト",other:"その他"
  };
  const inventoryLabels = {
    in_stock:"在庫あり",low_stock:"残りわずか",check_required:"在庫確認",
    backorder:"入荷待ち",discontinued:"取扱終了"
  };
  let token = sessionStorage.getItem(TOKEN_KEY) || "";
  let data = null;
  let pendingConfirm = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bind();
    if (D.demoScenario) document.getElementById("operationsManagementCode").value = "1234";
    if (token) openApp().catch((e) => showLogin(withMessage(e)));
  }

  function bind() {
    document.getElementById("operationsLoginForm").addEventListener("submit", login);
    document.getElementById("operationsToggleCode").addEventListener("click", toggleCode);
    document.getElementById("operationsClearCode").addEventListener("click", () => {
      const input = document.getElementById("operationsManagementCode"); input.value = ""; input.focus();
    });
    document.getElementById("operationsLogoutButton").addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY); location.reload();
    });
    document.getElementById("operationsRefreshButton").addEventListener("click", async () => {
      await load(); D.showToast("最新情報へ更新しました。");
    });
    document.querySelectorAll("[data-operations-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.operationsView)));
    document.getElementById("storeSettingsForm").addEventListener("submit", saveStore);
    document.getElementById("addStaffButton").addEventListener("click", () => openStaff());
    document.getElementById("staffForm").addEventListener("submit", saveStaff);
    document.getElementById("staffCancel").addEventListener("click", () => document.getElementById("staffDialog").close());
    document.getElementById("addProductButton").addEventListener("click", () => openProduct());
    document.getElementById("productForm").addEventListener("submit", saveProduct);
    document.getElementById("productCancel").addEventListener("click", () => document.getElementById("productDialog").close());
    document.getElementById("productSearchInput").addEventListener("input", renderProducts);
    document.getElementById("addHolidayButton").addEventListener("click", () => openHoliday());
    document.getElementById("holidayForm").addEventListener("submit", saveHoliday);
    document.getElementById("holidayCancel").addEventListener("click", () => document.getElementById("holidayDialog").close());
    document.getElementById("holidayAllDay").addEventListener("change", toggleHolidayTimes);
    document.getElementById("operationsConfirmCancel").addEventListener("click", closeConfirm);
    document.getElementById("operationsConfirmExecute").addEventListener("click", executeConfirm);
  }

  async function login(event) {
    event.preventDefault();
    const code = document.getElementById("operationsManagementCode").value.trim();
    if (!code) return loginError("管理コードを入力してください。");
    try {
      const result = await D.request("/owner/auth", {method:"POST",body:{management_code:code}});
      token = result.admin_token;
      sessionStorage.setItem(TOKEN_KEY, token);
      document.getElementById("operationsManagementCode").value = "";
      await openApp();
    } catch (e) { loginError(withMessage(e)); }
  }

  async function openApp() {
    document.getElementById("operationsLoginView").hidden = true;
    document.getElementById("operationsAppView").hidden = false;
    await load();
  }

  function showLogin(message) {
    token = ""; sessionStorage.removeItem(TOKEN_KEY);
    document.getElementById("operationsAppView").hidden = true;
    document.getElementById("operationsLoginView").hidden = false;
    if (message) loginError(message);
  }

  function toggleCode() {
    const input = document.getElementById("operationsManagementCode");
    input.type = input.type === "password" ? "text" : "password";
    document.getElementById("operationsToggleCode").textContent = input.type === "password" ? "表示" : "隠す";
  }

  async function request(path, body={}) {
    try {
      return await D.request(path,{method:"POST",headers:{Authorization:`Bearer ${token}`},body});
    } catch (e) {
      if (e.status === 401) showLogin("管理者認証の有効期限が切れました。");
      throw e;
    }
  }

  async function load() {
    loading(true); globalError("");
    try {
      const response = await request("/admin/operations/bootstrap", {
        holiday_from: new Date().toISOString().slice(0,10),
        holiday_to: new Date(Date.now()+180*86400000).toISOString().slice(0,10)
      });
      data = response.operations;
      renderAll();
    } catch (e) { globalError(withMessage(e)); }
    finally { loading(false); }
  }

  function renderAll() {
    document.getElementById("operationsStoreName").textContent = data.store.store_name;
    document.getElementById("operationsDemoBadge").hidden = !data.store.is_demo;
    renderStore();
    renderStaff();
    renderCategoryOptions();
    renderInventoryOptions();
    renderProducts();
    renderHolidays();
  }

  function renderStore() {
    const s = data.store, st = data.settings;
    setValue("storeName",s.store_name); setValue("storeSubtitle",s.subtitle); setValue("storePhone",s.phone);
    setValue("storePostalCode",s.postal_code); setValue("storeAddress",s.address);
    setValue("holdExpireDays",st.hold_expire_days); setValue("sampleFollowupDays",st.sample_followup_days);
    setValue("maxSimultaneous",st.max_simultaneous_consultations);
    document.getElementById("lineLinkApproval").checked = !!st.line_link_approval_required;
    const hours = st.business_hours || {};
    document.getElementById("businessHoursEditor").innerHTML = Object.keys(dayLabels).map(day => {
      const h = hours[day] || {closed:false,open:"10:00",close:"19:00"};
      return `<div class="business-day-row" data-business-day="${day}">
        <strong>${dayLabels[day]}曜日</strong>
        <label class="operations-check compact-check"><input type="checkbox" data-closed ${h.closed?"checked":""}><span>定休日</span></label>
        <input type="time" step="1800" data-open value="${h.open||"10:00"}" ${h.closed?"disabled":""}>
        <span>〜</span>
        <input type="time" step="1800" data-close value="${h.close||"19:00"}" ${h.closed?"disabled":""}>
      </div>`;
    }).join("");
    document.querySelectorAll("[data-business-day] [data-closed]").forEach(c => c.addEventListener("change", () => {
      const row = c.closest("[data-business-day]");
      row.querySelector("[data-open]").disabled = c.checked;
      row.querySelector("[data-close]").disabled = c.checked;
    }));
  }

  async function saveStore(event) {
    event.preventDefault();
    const businessHours = {};
    document.querySelectorAll("[data-business-day]").forEach(row => {
      const closed = row.querySelector("[data-closed]").checked;
      businessHours[row.dataset.businessDay] = {
        closed,
        open: closed ? null : row.querySelector("[data-open]").value,
        close: closed ? null : row.querySelector("[data-close]").value
      };
    });
    try {
      await request("/admin/operations/store/update", {
        store:{store_name:value("storeName"),subtitle:value("storeSubtitle"),phone:value("storePhone"),postal_code:value("storePostalCode"),address:value("storeAddress")},
        settings:{default_slot_minutes:30,hold_expire_days:num("holdExpireDays"),sample_followup_days:num("sampleFollowupDays"),max_simultaneous_consultations:num("maxSimultaneous"),line_link_approval_required:document.getElementById("lineLinkApproval").checked,customer_photo_enabled:false},
        business_hours:businessHours
      });
      D.showToast("店舗設定を保存しました。"); await load();
    } catch (e) { globalError(withMessage(e)); }
  }

  function renderStaff() {
    const list = document.getElementById("staffList");
    list.innerHTML = (data.staff||[]).map(s => `<article class="card operations-record">
      <div class="operations-record-head"><div><span class="status-pill ${s.is_active?"status-active":"status-cancelled"}">${s.is_active?"有効":"停止"}</span><h2>${D.escapeHtml(s.display_name)}</h2><p>${D.escapeHtml(s.staff_code)}｜${roleLabel(s.role)}</p></div><button class="btn secondary compact" data-edit-staff="${s.id}">編集</button></div>
      <div class="owner-record-meta"><span>相談担当 <strong>${s.can_consult?"可":"不可"}</strong></span><span>機密メモ <strong>${s.can_view_sensitive_notes?"閲覧可":"不可"}</strong></span><span>表示順 <strong>${s.sort_order}</strong></span></div>
    </article>`).join("") || empty("スタッフがいません。");
    list.querySelectorAll("[data-edit-staff]").forEach(b => b.addEventListener("click",()=>openStaff(data.staff.find(s=>s.id===b.dataset.editStaff))));
  }

  function openStaff(s=null) {
    document.getElementById("staffForm").reset();
    setValue("staffId",s?.id); setValue("staffCode",s?.staff_code); setValue("staffName",s?.display_name);
    setValue("staffRole",s?.role||"staff"); setValue("staffSort",s?.sort_order??100); setValue("staffPhone",s?.phone); setValue("staffEmail",s?.email);
    document.getElementById("staffCanConsult").checked = s?.can_consult ?? true;
    document.getElementById("staffSensitive").checked = s?.can_view_sensitive_notes ?? false;
    document.getElementById("staffActive").checked = s?.is_active ?? true;
    document.getElementById("staffDialogTitle").textContent = s ? "スタッフを編集" : "スタッフを追加";
    formError("staffFormError","");
    document.getElementById("staffDialog").showModal();
  }

  async function saveStaff(event) {
    event.preventDefault();
    try {
      await request("/admin/operations/staff/upsert",{
        staff_id:value("staffId"),
        staff:{staff_code:value("staffCode"),display_name:value("staffName"),role:value("staffRole"),sort_order:num("staffSort"),phone:value("staffPhone"),email:value("staffEmail"),can_consult:checked("staffCanConsult"),can_view_sensitive_notes:checked("staffSensitive"),is_active:checked("staffActive")}
      });
      document.getElementById("staffDialog").close(); D.showToast("スタッフを保存しました。"); await load();
    } catch(e){formError("staffFormError",withMessage(e));}
  }

  function renderCategoryOptions() {
    document.getElementById("productCategory").innerHTML = (data.categories||[]).map(c=>`<option value="${c}">${categoryLabels[c]||c}</option>`).join("");
  }
  function renderInventoryOptions() {
    document.getElementById("inventoryStatus").innerHTML = (data.inventory_statuses||[]).map(s=>`<option value="${s}">${inventoryLabels[s]||s}</option>`).join("");
  }

  function renderProducts() {
    const q = document.getElementById("productSearchInput").value.trim().toLowerCase();
    const products = (data.products||[]).filter(p => !q || [p.product_name,p.brand_name,p.sku,p.variant_name].some(v=>String(v||"").toLowerCase().includes(q)));
    document.getElementById("productList").innerHTML = products.map(p=>`<article class="card operations-record">
      <div class="operations-record-head"><div><span class="status-pill status-${p.inventory_status}">${inventoryLabels[p.inventory_status]||p.inventory_status}</span><h2>${D.escapeHtml(p.product_name)}</h2><p>${D.escapeHtml(p.brand_name||"ブランド未設定")}｜${D.escapeHtml(p.variant_name)}｜${D.escapeHtml(p.sku)}</p></div><button class="btn secondary compact" data-edit-product="${p.variant_id}">編集</button></div>
      <div class="owner-record-meta"><span>価格 <strong>${D.formatYen(p.price_yen||0)}</strong></span><span>在庫 <strong>${p.quantity??"未入力"}</strong></span><span>標準使用 <strong>${p.standard_usage_days?`${p.standard_usage_days}日`:"未設定"}</strong></span><span>表示 <strong>${p.product_active&&p.variant_active?"表示中":"停止"}</strong></span></div>
    </article>`).join("") || empty("該当する商品がありません。");
    document.querySelectorAll("[data-edit-product]").forEach(b=>b.addEventListener("click",()=>openProduct(data.products.find(p=>p.variant_id===b.dataset.editProduct))));
  }

  function openProduct(p=null) {
    document.getElementById("productForm").reset();
    const map = {
      productId:p?.product_id,variantId:p?.variant_id,brandCode:p?.brand_code,brandName:p?.brand_name,
      productCode:p?.product_code,productName:p?.product_name,productCategory:p?.category||"other",
      usageDays:p?.standard_usage_days,productDescription:p?.description,sku:p?.sku,variantName:p?.variant_name,
      sizeLabel:p?.size_label,capacityMl:p?.capacity_ml,priceYen:p?.price_yen,barcode:p?.barcode,
      inventoryStatus:p?.inventory_status||"check_required",inventoryQuantity:p?.quantity,arrivalDate:p?.expected_arrival_date
    };
    Object.entries(map).forEach(([id,v])=>setValue(id,v));
    document.getElementById("sampleAvailable").checked = p?.is_sample_available ?? false;
    document.getElementById("productActive").checked = p?.product_active ?? true;
    document.getElementById("variantActive").checked = p?.variant_active ?? true;
    document.getElementById("productDialogTitle").textContent = p ? "商品・在庫を編集" : "商品を追加";
    formError("productFormError","");
    document.getElementById("productDialog").showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    try {
      await request("/admin/operations/product/upsert",{
        product_id:value("productId"),variant_id:value("variantId"),
        product:{brand_code:value("brandCode"),brand_name:value("brandName"),product_code:value("productCode"),product_name:value("productName"),category:value("productCategory"),description:value("productDescription"),standard_usage_days:nullableNum("usageDays"),is_sample_available:checked("sampleAvailable"),is_active:checked("productActive")},
        variant:{sku:value("sku"),variant_name:value("variantName"),size_label:value("sizeLabel"),capacity_ml:nullableNum("capacityMl"),price_yen:nullableNum("priceYen"),barcode:value("barcode"),is_active:checked("variantActive")},
        inventory:{inventory_status:value("inventoryStatus"),quantity:nullableNum("inventoryQuantity"),expected_arrival_date:value("arrivalDate")}
      });
      document.getElementById("productDialog").close(); D.showToast("商品・在庫を保存しました。"); await load();
    } catch(e){formError("productFormError",withMessage(e));}
  }

  function renderHolidays() {
    const list = document.getElementById("holidayList");
    list.innerHTML = (data.holidays||[]).map(h=>`<article class="card operations-record">
      <div class="operations-record-head"><div><span class="status-pill status-cancelled">${h.all_day?"終日休業":"部分休業"}</span><h2>${formatDate(h.holiday_date)}</h2><p>${h.all_day?"終日":`${h.start_time}〜${h.end_time}`}｜${D.escapeHtml(h.reason||"理由未登録")}</p></div><div class="operations-record-actions"><button class="btn secondary compact" data-edit-holiday="${h.id}">編集</button><button class="btn danger compact" data-delete-holiday="${h.id}">削除</button></div></div>
    </article>`).join("") || empty("今後180日以内の休業日はありません。");
    list.querySelectorAll("[data-edit-holiday]").forEach(b=>b.addEventListener("click",()=>openHoliday(data.holidays.find(h=>h.id===b.dataset.editHoliday))));
    list.querySelectorAll("[data-delete-holiday]").forEach(b=>b.addEventListener("click",()=>confirmDeleteHoliday(b.dataset.deleteHoliday)));
  }

  function openHoliday(h=null) {
    document.getElementById("holidayForm").reset();
    setValue("holidayId",h?.id); setValue("holidayDate",h?.holiday_date||new Date().toISOString().slice(0,10));
    document.getElementById("holidayAllDay").checked = h?.all_day ?? true;
    setValue("holidayStart",h?.start_time?.slice(0,5)||"10:00"); setValue("holidayEnd",h?.end_time?.slice(0,5)||"12:00"); setValue("holidayReason",h?.reason);
    document.getElementById("holidayDialogTitle").textContent = h ? "休業日を編集" : "休業日を追加";
    toggleHolidayTimes(); formError("holidayFormError","");
    document.getElementById("holidayDialog").showModal();
  }

  function toggleHolidayTimes() {
    const disabled = document.getElementById("holidayAllDay").checked;
    document.getElementById("holidayStart").disabled = disabled;
    document.getElementById("holidayEnd").disabled = disabled;
  }

  async function saveHoliday(event) {
    event.preventDefault();
    try {
      await request("/admin/operations/holiday/upsert",{
        holiday_id:value("holidayId"),
        holiday:{holiday_date:value("holidayDate"),all_day:checked("holidayAllDay"),start_time:value("holidayStart"),end_time:value("holidayEnd"),reason:value("holidayReason")}
      });
      document.getElementById("holidayDialog").close(); D.showToast("休業日を保存しました。"); await load();
    } catch(e){formError("holidayFormError",withMessage(e));}
  }

  function confirmDeleteHoliday(id) {
    const h = data.holidays.find(x=>x.id===id);
    openConfirm(`${formatDate(h.holiday_date)}の休業日を削除しますか？`,"削除すると、その日が予約可能になる場合があります。",async()=>{
      await request("/admin/operations/holiday/delete",{holiday_id:id});
      D.showToast("休業日を削除しました。"); await load();
    });
  }

  function switchView(name) {
    if (!views.includes(name)) return;
    document.querySelectorAll("[data-operations-view]").forEach(b=>b.classList.toggle("is-active",b.dataset.operationsView===name));
    views.forEach(v=>document.getElementById(`operationsView${v[0].toUpperCase()+v.slice(1)}`).hidden=v!==name);
  }

  function openConfirm(title,message,fn){pendingConfirm=fn;document.getElementById("operationsConfirmTitle").textContent=title;document.getElementById("operationsConfirmMessage").textContent=message;document.getElementById("operationsConfirmDialog").showModal();}
  function closeConfirm(){pendingConfirm=null;document.getElementById("operationsConfirmDialog").close();}
  async function executeConfirm(){if(!pendingConfirm)return;const fn=pendingConfirm;try{await fn();closeConfirm();}catch(e){closeConfirm();globalError(withMessage(e));}}

  function value(id){return document.getElementById(id).value.trim()||null;}
  function setValue(id,v){document.getElementById(id).value=v??"";}
  function num(id){return Number(document.getElementById(id).value);}
  function nullableNum(id){const v=document.getElementById(id).value;return v===""?null:Number(v);}
  function checked(id){return document.getElementById(id).checked;}
  function roleLabel(v){return({owner:"オーナー",manager:"店長",staff:"スタッフ",viewer:"閲覧のみ"})[v]||v;}
  function formatDate(v){if(!v)return"―";return new Intl.DateTimeFormat("ja-JP",{dateStyle:"long"}).format(new Date(`${v}T00:00:00`));}
  function empty(m){return `<div class="empty-state compact-empty"><p>${D.escapeHtml(m)}</p></div>`;}
  function loading(v){document.getElementById("operationsLoading").hidden=!v;}
  function globalError(m){const e=document.getElementById("operationsGlobalError");e.textContent=m;e.hidden=!m;}
  function loginError(m){const e=document.getElementById("operationsLoginError");e.textContent=m;e.hidden=!m;}
  function formError(id,m){const e=document.getElementById(id);e.textContent=m;e.hidden=!m;}
  function withMessage(e){return e?.requestId?`${e.message}（確認番号：${e.requestId}）`:e?.message||"エラーが発生しました。";}
})();