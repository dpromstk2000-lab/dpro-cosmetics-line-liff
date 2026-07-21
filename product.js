(() => {
  "use strict";
  const { request, config, setDemoBadge, escapeHtml, formatYen, appendQuery } = window.DPRO;
  const $ = (id) => document.getElementById(id);
  let product = null;
  document.addEventListener("DOMContentLoaded", () => {
    setDemoBadge($("demoBadge"));
    document.querySelector("[data-home-link]").href = appendQuery("index.html");
    $("backCatalog").href = appendQuery(config.CATALOG_PAGE || "catalog.html");
    $("variantSelect").addEventListener("change", renderVariant);
    load();
  });

  async function load() {
    const params = new URLSearchParams(location.search);
    const slug = params.get("slug");
    const productId = params.get("product_id");
    const api = new URLSearchParams();
    if (slug) api.set("slug", slug); else if (productId) api.set("product_id", productId);
    else return fail("商品が指定されていません。");
    try {
      const data = await request(`/catalog/product?${api}`);
      product = data.product;
      render();
      $("productDetail").hidden = false;
    } catch (error) { fail(error.message); }
    finally { $("productLoading").hidden = true; }
  }

  function render() {
    $("productBrand").textContent = product.brand?.brand_name || "DPRO SELECT";
    $("productName").textContent = product.product_name;
    $("productShort").textContent = product.short_description || product.description || "";
    const chips = [...(product.feature_tags || []), ...(product.target_skin_concerns || []).map((v) => `肌悩み：${v}`)];
    $("featureChips").innerHTML = chips.map((v) => `<span class="cos-chip">${escapeHtml(v)}</span>`).join("");
    const media = product.media || [];
    showImage(media[0]);
    $("thumbnailList").innerHTML = media.length > 1 ? media.map((item, i) => `<button class="cos-thumb ${i===0?'active':''}" type="button" data-index="${i}"><img src="${escapeHtml(item.public_url)}" alt="${escapeHtml(item.alt_text || product.product_name)}"></button>`).join("") : "";
    $("thumbnailList").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      showImage(media[Number(button.dataset.index)]); $("thumbnailList").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button));
    }));
    $("variantSelect").innerHTML = (product.variants || []).map((variant) => `<option value="${escapeHtml(variant.id)}">${escapeHtml(variant.variant_name || variant.color_name || variant.size_label || variant.sku)}｜${escapeHtml(formatYen(variant.price_yen))}</option>`).join("");
    $("productDescription").innerHTML = `<h2>商品について</h2><p>${escapeHtml(product.description || product.short_description || "店舗スタッフへお問い合わせください。").replace(/\n/g,"<br>")}</p>${product.usage_method ? `<h3>使用方法</h3><p>${escapeHtml(product.usage_method).replace(/\n/g,"<br>")}</p>` : ""}`;
    const profiles = [
      ["香り", product.fragrance_profile], ["質感", product.texture_profile], ["仕上がり", product.finish_profile], ["使用目安", product.standard_usage_days ? `${product.standard_usage_days}日` : null], ["サンプル", product.is_sample_available ? "ご相談可能" : "対象外"], ["取り置き", product.hold_available ? "受付可能" : "店舗へ確認"],
    ];
    $("productProfile").innerHTML = profiles.filter(([,v]) => v).map(([k,v]) => `<div class="cos-info"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
    renderVariant();
  }

  function showImage(item) {
    const mainImage = $("mainImage");
    const hasImage = Boolean(item?.public_url);
    mainImage.classList.toggle("is-placeholder", !hasImage);
    mainImage.innerHTML = hasImage
      ? `<img src="${escapeHtml(item.public_url)}" alt="${escapeHtml(item.alt_text || product.product_name)}">`
      : '<div class="cos-placeholder" aria-hidden="true">✦</div>';
  }
  function renderVariant() {
    const variant = (product?.variants || []).find((v) => v.id === $("variantSelect").value) || product?.variants?.[0];
    if (!variant) { $("variantInfo").innerHTML = '<div class="cos-info"><span>商品種類</span><strong>店舗へ確認</strong></div>'; return; }
    const inv = variant.inventory || {};
    const inventoryLabel = ({in_stock:"在庫あり",low_stock:"残りわずか",out_of_stock:"売り切れ",backorder:"入荷待ち",check_required:"店舗へ確認"})[inv.inventory_status] || "店舗へ確認";
    $("variantInfo").innerHTML = `<div class="cos-info"><span>価格</span><strong>${escapeHtml(formatYen(variant.price_yen))}</strong></div><div class="cos-info"><span>在庫</span><strong>${escapeHtml(inventoryLabel)}</strong></div>${variant.capacity_ml ? `<div class="cos-info"><span>容量</span><strong>${escapeHtml(variant.capacity_ml)}mL</strong></div>` : ""}${inv.expected_arrival_date ? `<div class="cos-info"><span>入荷予定</span><strong>${escapeHtml(inv.expected_arrival_date)}</strong></div>` : ""}`;
    $("pickupLink").href = appendQuery(config.PICKUP_PAGE || "pickup.html", { variant_id: variant.id, source: "catalog" });
    $("activeLink").href = appendQuery(config.MY_COSMETICS_PAGE || "my-cosmetics.html", { variant_id: variant.id });
    $("consultLink").href = appendQuery(config.CONSULTATION_PAGE || "consultation.html", { product_variant_id: variant.id });
  }
  function fail(message) { $("productLoading").hidden = true; $("productError").textContent = message; $("productError").hidden = false; }
})();
