(() => {
  "use strict";
  const { request, config, demoScenario, setDemoBadge, escapeHtml, formatYen, appendQuery } = window.DPRO;
  const $ = (id) => document.getElementById(id);
  const state = { catalog: null };

  document.addEventListener("DOMContentLoaded", () => {
    setDemoBadge($("demoBadge"));
    document.querySelector("[data-home-link]").href = appendQuery("index.html");
    $("catalogForm").addEventListener("submit", (event) => { event.preventDefault(); loadCatalog(); });
    loadCatalog();
  });

  async function loadCatalog() {
    setBusy(true);
    const params = new URLSearchParams();
    const query = $("catalogQuery").value.trim();
    const category = $("categoryFilter").value;
    const brandId = $("brandFilter").value;
    if (query) params.set("query", query);
    if (category) params.set("category", category);
    if (brandId) params.set("brand_id", brandId);
    params.set("limit", "200");
    try {
      const data = await request(`/catalog?${params}`);
      state.catalog = data.catalog || {};
      renderFilters();
      renderProducts(state.catalog.products || []);
    } catch (error) {
      $("catalogError").textContent = error.message;
      $("catalogError").hidden = false;
      $("catalogCount").textContent = "取得できませんでした";
    } finally {
      setBusy(false);
    }
  }

  function renderFilters() {
    const keepCategory = $("categoryFilter").value;
    const keepBrand = $("brandFilter").value;
    $("categoryFilter").innerHTML = '<option value="">すべて</option>' + (state.catalog.categories || []).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    $("brandFilter").innerHTML = '<option value="">すべて</option>' + (state.catalog.brands || []).map((brand) => `<option value="${escapeHtml(brand.id)}">${escapeHtml(brand.brand_name)}</option>`).join("");
    if ([...$("categoryFilter").options].some((o) => o.value === keepCategory)) $("categoryFilter").value = keepCategory;
    if ([...$("brandFilter").options].some((o) => o.value === keepBrand)) $("brandFilter").value = keepBrand;
  }

  function renderProducts(products) {
    $("catalogCount").textContent = `${products.length}商品`;
    $("productGrid").hidden = products.length === 0;
    $("catalogEmpty").hidden = products.length !== 0;
    $("productGrid").innerHTML = products.map(productCard).join("");
  }

  function productCard(product) {
    const media = (product.media || []).find((item) => item.is_primary) || (product.media || [])[0];
    const image = media?.public_url ? `<img src="${escapeHtml(media.public_url)}" alt="${escapeHtml(media.alt_text || product.product_name)}" loading="lazy">` : '<div class="cos-placeholder" aria-hidden="true">✦</div>';
    const variants = product.variants || [];
    const prices = variants.map((v) => Number(v.price_yen)).filter(Number.isFinite);
    const price = prices.length ? (Math.min(...prices) === Math.max(...prices) ? formatYen(prices[0]) : `${formatYen(Math.min(...prices))}〜`) : "価格は店舗へ確認";
    const detail = appendQuery(config.PRODUCT_PAGE || "product.html", product.catalog_slug ? { slug: product.catalog_slug } : { product_id: product.product_id });
    return `<article class="cos-product-card">
      <a class="cos-product-image" href="${escapeHtml(detail)}">${image}</a>
      <div class="cos-card-body">
        <div class="cos-chip-row"><span class="cos-chip gold">${escapeHtml(product.brand_name || "SELECT")}</span><span class="cos-chip">${escapeHtml(product.category || "化粧品")}</span></div>
        <h3><a href="${escapeHtml(detail)}">${escapeHtml(product.product_name)}</a></h3>
        <p>${escapeHtml(product.short_description || product.description || "商品詳細をご確認ください。")}</p>
        <div class="cos-card-meta"><span class="cos-price">${escapeHtml(price)}</span><span class="cos-count">${variants.length}種類</span></div>
      </div>
    </article>`;
  }

  function setBusy(value) {
    $("catalogLoading").hidden = !value;
    if (value) { $("catalogError").hidden = true; $("productGrid").hidden = true; $("catalogEmpty").hidden = true; }
  }
})();
