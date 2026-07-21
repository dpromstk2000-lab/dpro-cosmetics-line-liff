(() => {
  "use strict";
  const { request, config, setDemoBadge, getIdentityPayload, escapeHtml, formatDate, formatYen, appendQuery, showToast } = window.DPRO;
  const $ = (id) => document.getElementById(id);
  const state = { identity: null, data: null, catalog: null };
  const labels = {
    remaining: { full:"ほぼ満量",high:"多い",half:"半分",low:"少ない",empty:"使い切り",unknown:"未確認" },
    active: { not_started:"未使用",using:"使用中",paused:"一時停止",finished:"使用終了",repurchased:"再購入済み",stopped:"中止" },
    repurchase: { active:"ご案内前",snoozed:"後日確認",hold_requested:"取り置き希望",repurchased:"再購入済み",not_needed:"今回は不要",cancelled:"終了" },
    response: { unanswered:"未回答",interested:"興味あり",hold_requested:"取り置き希望",consultation_requested:"相談希望",purchased:"購入済み",declined:"今回は見送り" },
    recurring: { active:"継続中",paused:"一時停止",skipped:"次回スキップ",ended:"終了" },
  };

  document.addEventListener("DOMContentLoaded", () => {
    setDemoBadge($("demoBadge"));
    document.querySelector("[data-home-link]").href = appendQuery("index.html");
    document.querySelector("[data-pickup-link]").href = appendQuery(config.PICKUP_PAGE || "pickup.html");
    document.querySelectorAll(".cos-tab").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    $("openAddProduct").addEventListener("click", () => openDialog("activeProductDialog"));
    $("openRecurring").addEventListener("click", () => openDialog("recurringDialog"));
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
    $("activeProductForm").addEventListener("submit", saveActiveProduct);
    $("recurringForm").addEventListener("submit", saveRecurring);
    document.addEventListener("click", handleAction);
    boot();
  });

  async function boot() {
    try {
      state.identity = await getIdentityPayload();
      const [care, catalog] = await Promise.all([
        request("/member/care/bootstrap", { method:"POST", body: state.identity }),
        request("/catalog?limit=200"),
      ]);
      state.data = care;
      state.catalog = catalog.catalog || {};
      populateVariants(); renderAll();
      $("careApp").hidden = false;
      const preselect = new URLSearchParams(location.search).get("variant_id");
      if (preselect && [...$("activeVariant").options].some((o) => o.value === preselect)) { $("activeVariant").value = preselect; openDialog("activeProductDialog"); }
    } catch (error) { $("careError").textContent = error.message; $("careError").hidden = false; }
    finally { $("careLoading").hidden = true; }
  }

  function renderAll() {
    const d = state.data;
    $("customerName").textContent = `${d.customer?.full_name || "お客様"} 様`;
    $("customerNo").textContent = d.customer?.customer_no || "";
    $("careSummary").innerHTML = summary("使用中商品", d.active_products?.filter((v)=>["not_started","using","paused"].includes(v.status)).length || 0) + summary("再購入目安", d.repurchase_plans?.filter((v)=>["active","snoozed","hold_requested"].includes(v.status)).length || 0) + summary("おすすめ", d.recommendations?.length || 0) + summary("定期購入希望", d.recurring_preferences?.filter((v)=>v.status!=="ended").length || 0);
    renderActive(); renderRepurchase(); renderRecommendations(); renderRecurring(); renderSamples();
  }
  function summary(label, value) { return `<div class="cos-info"><span>${escapeHtml(label)}</span><strong>${value}件</strong></div>`; }
  function productInfo(row) { const v=row.product_variant||{}; const p=v.product||{}; const media=(v.media||[])[0]; return { variant:v, product:p, image:media?.public_url, name:p.product_name||"商品", variantName:v.variant_name||v.color_name||v.size_label||"", price:v.price_yen }; }
  function imageHtml(info) { return info.image ? `<img src="${escapeHtml(info.image)}" alt="${escapeHtml(info.name)}">` : '<div class="cos-placeholder" aria-hidden="true" style="font-size:28px">✦</div>'; }
  function empty(text) { return `<div class="cos-empty" style="grid-column:1/-1"><strong>${escapeHtml(text)}</strong></div>`; }

  function renderActive() {
    const rows=state.data.active_products||[]; $("activeProducts").innerHTML = rows.length ? rows.map((row)=>{ const i=productInfo(row); const progress={full:10,high:25,half:50,low:80,empty:100,unknown:0}[row.remaining_level]||0; return `<article class="cos-care-card"><div class="cos-care-product"><div class="cos-care-image">${imageHtml(i)}</div><div><span class="cos-status ${escapeHtml(row.status)}">${escapeHtml(labels.active[row.status]||row.status)}</span><h3>${escapeHtml(i.name)}</h3><p>${escapeHtml(i.variantName)}</p></div></div><div class="cos-progress"><span style="width:${progress}%"></span></div><p>残量：${escapeHtml(labels.remaining[row.remaining_level]||"未確認")}｜使い切り目安：${escapeHtml(formatDate(row.expected_finish_on))}</p><div class="cos-inline-form"><select data-remaining-select="${escapeHtml(row.id)}"><option value="full">ほぼ満量</option><option value="high">多い</option><option value="half">半分</option><option value="low">少ない</option><option value="empty">使い切り</option><option value="unknown">未確認</option></select><button class="cos-btn soft small" type="button" data-action="update-remaining" data-id="${escapeHtml(row.id)}">更新</button></div><div class="cos-actions" style="margin-top:10px">${row.status==="paused"?`<button class="cos-btn secondary small" data-action="resume-active" data-id="${row.id}">使用を再開</button>`:`<button class="cos-btn secondary small" data-action="pause-active" data-id="${row.id}">一時停止</button>`}<button class="cos-btn secondary small" data-action="finish-active" data-id="${row.id}">使い切った</button></div></article>`; }).join("") : empty("使用中商品はまだ登録されていません。");
    rows.forEach((row)=>{ const s=document.querySelector(`[data-remaining-select="${row.id}"]`); if(s) s.value=row.remaining_level||"unknown"; });
  }
  function renderRepurchase() { const rows=state.data.repurchase_plans||[]; $("repurchasePlans").innerHTML = rows.length ? rows.map((row)=>{ const active=(state.data.active_products||[]).find((v)=>v.id===row.active_product_id)||row; const i=productInfo(active); return `<article class="cos-care-card"><div class="cos-care-product"><div class="cos-care-image">${imageHtml(i)}</div><div><span class="cos-status ${escapeHtml(row.status)}">${escapeHtml(labels.repurchase[row.status]||row.status)}</span><h3>${escapeHtml(i.name)}</h3><p>${escapeHtml(i.variantName)}</p></div></div><p>使い切り目安：${escapeHtml(formatDate(row.expected_finish_on))}</p><p>次回確認：${escapeHtml(formatDate(row.next_contact_on))}</p><div class="cos-actions"><a class="cos-btn primary small" href="${escapeHtml(appendQuery(config.PICKUP_PAGE||"pickup.html",{variant_id:row.product_variant_id,source:"repurchase"}))}">取り置きを依頼</a></div></article>`; }).join("") : empty("再購入時期が近い商品はありません。"); }
  function renderRecommendations() { const sets=state.data.recommendations||[]; $("recommendations").innerHTML = sets.length ? sets.flatMap((set)=>set.items||[]).map((row)=>{ const i=productInfo(row); return `<article class="cos-care-card"><div class="cos-care-product"><div class="cos-care-image">${imageHtml(i)}</div><div><span class="cos-status ${escapeHtml(row.customer_response)}">${escapeHtml(labels.response[row.customer_response]||"おすすめ")}</span><h3>${escapeHtml(i.name)}</h3><p>${escapeHtml(i.variantName)}</p></div></div><p><strong>おすすめ理由：</strong>${escapeHtml(row.recommendation_reason||"お客様に合わせてご提案しました。")}</p>${row.usage_tip?`<p><strong>使い方：</strong>${escapeHtml(row.usage_tip)}</p>`:""}<div class="cos-actions"><a class="cos-btn primary small" href="${escapeHtml(appendQuery(config.PICKUP_PAGE||"pickup.html",{variant_id:row.product_variant_id,source:"recommendation"}))}">取り置き</a><a class="cos-btn secondary small" href="${escapeHtml(appendQuery(config.CONSULTATION_PAGE||"consultation.html",{product_variant_id:row.product_variant_id}))}">相談</a></div></article>`; }).join("") : empty("現在公開中のおすすめ提案はありません。"); }
  function renderRecurring() { const rows=state.data.recurring_preferences||[]; $("recurringPreferences").innerHTML = rows.length ? rows.map((row)=>{ const i=productInfo(row); return `<article class="cos-care-card"><div class="cos-care-product"><div class="cos-care-image">${imageHtml(i)}</div><div><span class="cos-status ${escapeHtml(row.status)}">${escapeHtml(labels.recurring[row.status]||row.status)}</span><h3>${escapeHtml(i.name)}</h3><p>${escapeHtml(i.variantName)}</p></div></div><p>${escapeHtml(row.cycle_days)}日ごと｜${escapeHtml(row.quantity)}点</p><p>次回確認：${escapeHtml(formatDate(row.next_confirmation_on))}</p><div class="cos-actions">${row.status==="paused"?`<button class="cos-btn secondary small" data-action="recurring-resume" data-id="${row.id}">再開</button>`:`<button class="cos-btn secondary small" data-action="recurring-pause" data-id="${row.id}">一時停止</button>`}<button class="cos-btn secondary small" data-action="recurring-skip" data-id="${row.id}">次回スキップ</button><button class="cos-btn secondary small" data-action="recurring-end" data-id="${row.id}">終了</button></div></article>`; }).join("") : empty("定期購入希望はまだ登録されていません。"); }
  function renderSamples() { const rows=state.data.sample_followups||[]; $("sampleFollowups").innerHTML = rows.length ? rows.map((row)=>`<article class="cos-care-card"><span class="cos-status ${escapeHtml(row.usage_status||"")}">${escapeHtml(row.usage_status||"確認予定")}</span><h3>サンプル使用状況</h3><p>配布日：${escapeHtml(formatDate(row.distributed_at))}</p><p>確認予定：${escapeHtml(formatDate(row.followup_due_at))}</p><p>${escapeHtml(row.feedback_note||"使用後の感想を店舗へお伝えください。")}</p></article>`).join("") : empty("確認中のサンプルはありません。"); }

  async function handleAction(event) { const button=event.target.closest("[data-action]"); if(!button)return; const action=button.dataset.action,id=button.dataset.id; button.disabled=true; try { if(action==="update-remaining"){ const remaining=document.querySelector(`[data-remaining-select="${id}"]`).value; await updateActive(id,{remaining_level:remaining,status:remaining==="empty"?"finished":undefined,ended_on:remaining==="empty"?today():undefined}); } else if(action==="pause-active") await updateActive(id,{status:"paused"}); else if(action==="resume-active") await updateActive(id,{status:"using"}); else if(action==="finish-active") await updateActive(id,{status:"finished",remaining_level:"empty",ended_on:today()}); else if(action.startsWith("recurring-")) await recurringStatus(id,action.replace("recurring-","")); showToast("更新しました。"); await reloadCare(); } catch(error){showToast(error.message);} finally{button.disabled=false;} }
  async function updateActive(id,patch){ const body={...state.identity,active_product_id:id}; Object.entries(patch).forEach(([k,v])=>{if(v!==undefined)body[k]=v}); await request("/member/active-products/update",{method:"POST",body}); }
  async function recurringStatus(id,action){ await request("/member/recurring/status",{method:"POST",body:{...state.identity,preference_id:id,action}}); }
  async function saveActiveProduct(event) { event.preventDefault(); const button=event.submitter; button.disabled=true; try { await request("/member/active-products/upsert",{method:"POST",body:{...state.identity,product_variant_id:$("activeVariant").value,source:"customer_report",opened_on:$("openedOn").value||null,started_on:$("startedOn").value||null,expected_days:Number($("expectedDays").value)||null,use_frequency:$("useFrequency").value.trim()||null,remaining_level:"full",status:"using",customer_feedback:$("activeFeedback").value.trim()||null}}); $("activeProductDialog").close(); showToast("使用中商品を登録しました。"); await reloadCare(); } catch(error){showToast(error.message);} finally{button.disabled=false;} }
  async function saveRecurring(event) { event.preventDefault(); const button=event.submitter; button.disabled=true; try { await request("/member/recurring/upsert",{method:"POST",body:{...state.identity,product_variant_id:$("recurringVariant").value,cycle_days:Number($("cycleDays").value),quantity:Number($("recurringQuantity").value),fulfillment_mode:$("fulfillmentMode").value,status:"active",customer_note:$("recurringNote").value.trim()||null}}); $("recurringDialog").close(); showToast("定期購入希望を登録しました。"); await reloadCare(); } catch(error){showToast(error.message);} finally{button.disabled=false;} }
  async function reloadCare(){ state.data=await request("/member/care/bootstrap",{method:"POST",body:state.identity}); renderAll(); }
  function populateVariants(){ const options=(state.catalog.products||[]).flatMap((p)=>(p.variants||[]).map((v)=>({id:v.product_variant_id,label:`${p.brand_name?`${p.brand_name}｜`:""}${p.product_name} ${v.variant_name||v.color_name||v.size_label||""}｜${formatYen(v.price_yen)}`}))); const html=options.map((o)=>`<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join(""); $("activeVariant").innerHTML=html; $("recurringVariant").innerHTML=html; }
  function switchTab(name){ document.querySelectorAll(".cos-tab").forEach((b)=>b.classList.toggle("active",b.dataset.tab===name)); document.querySelectorAll("[data-panel]").forEach((p)=>p.hidden=p.dataset.panel!==name); }
  function openDialog(id){ const d=$(id); if(typeof d.showModal==="function") d.showModal(); else d.setAttribute("open",""); }
  function today(){ return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
})();
