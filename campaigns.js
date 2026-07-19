(() => {
  "use strict";
  const D = window.DPRO;
  const typeLabels = {
    general:"店舗からのお知らせ",new_product:"新商品",brand:"ブランド",
    birthday:"誕生日",repurchase:"再購入",coupon:"クーポン"
  };
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    D.setDemoBadge(document.getElementById("demoBadge"));
    document.querySelector("[data-top-link]").href = `index.html${D.querySuffix()}`;
    try {
      const [store, response] = await Promise.all([
        D.request("/store"),
        D.request("/campaigns/list",{method:"POST",body:{limit:30}})
      ]);
      document.querySelectorAll("[data-store-name]").forEach((node)=>node.textContent=store.store?.store_name||"DPROコスメティックサロン");
      render(response.result?.campaigns||[]);
    } catch(error) {
      const node=document.getElementById("campaignsError");
      node.textContent=error?.requestId?`${error.message}（確認番号：${error.requestId}）`:error.message;
      node.hidden=false;
    } finally {
      document.getElementById("campaignsLoading").hidden=true;
    }
  }

  function render(items) {
    const list=document.getElementById("campaignsList");
    if(!items.length){
      list.innerHTML=`<div class="card empty-state"><p>現在公開中のお知らせはありません。</p></div>`;
      return;
    }
    list.innerHTML=items.map((item)=>`
      <article class="card public-campaign-card">
        <div class="public-campaign-icon">${icon(item.campaign_type)}</div>
        <div>
          <span class="campaign-type">${typeLabels[item.campaign_type]||item.campaign_type}</span>
          <h2>${D.escapeHtml(item.campaign_name)}</h2>
          <p class="campaign-period">${period(item.starts_at,item.ends_at)}</p>
          <div class="campaign-content">${D.escapeHtml(item.approved_content).replace(/\n/g,"<br>")}</div>
        </div>
      </article>`).join("");
  }
  function icon(type){return({general:"✨",new_product:"💄",brand:"🏷️",birthday:"🎂",repurchase:"🔁",coupon:"🎫"})[type]||"✨";}
  function period(start,end){
    if(!start&&!end)return"";
    return `${start?D.formatDateTime(start,{dateOnly:true}):"公開中"} 〜 ${end?D.formatDateTime(end,{dateOnly:true}):"終了日未定"}`;
  }
})();