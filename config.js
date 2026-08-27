window.DPRO_COSMETICS_CONFIG = Object.freeze({
  API_BASE: "https://dpro-cosmetics-line-api.dpromstk2000.workers.dev",
  STORE_CODE: "dpro_cosmetics_demo",
  PRODUCT_RELEASE_VERSION: "COSMETICS-16-FINAL-RELEASE-20260722",
  FRONTEND_RUNTIME_VERSION: "COSMETICS-R3-FRONTEND-READY-20260825",
  ADAPTER_VERSION: "COSMETICS-R3-PRODUCT-READY-ADAPTER-20260825",
  DATABASE_VERSION: "COSMETICS-1-R2-REPURCHASE-FUNCTION-FIX-20260719",
  LIFF_ID: "",
  DEMO_WHEN_LIFF_ID_EMPTY: true,
  MEMBER_PAGE: "member.html",
  CONSULTATION_PAGE: "consultation.html",
  PICKUP_PAGE: "pickup.html",
  OWNER_PAGE: "owner.html",
  OWNER_CRM_PAGE: "owner-crm.html",
  OWNER_IPAD_PAGE: "owner-ipad.html",
  OWNER_IPAD_CARE_PAGE: "owner-ipad-care.html",
  OWNER_SETTINGS_PAGE: "owner-settings.html",
  INQUIRY_PAGE: "inquiry.html",
  CAMPAIGNS_PAGE: "campaigns.html",
  OWNER_ENGAGEMENT_PAGE: "owner-engagement.html",
  SYSTEM_CHECK_PAGE: "system-check.html",
  CATALOG_PAGE: "catalog.html",
  PRODUCT_PAGE: "product.html",
  MY_COSMETICS_PAGE: "my-cosmetics.html",
  RECOMMENDATION_PAGE: "recommendation.html",
  POLICY_VERSION: "2026-08-R3",
  REQUEST_TIMEOUT_MS: 15000,
});

(() => {
  if (document.querySelector('script[data-dpro-tutorial-loader]')) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'tutorial.css';
  style.dataset.dproTutorialLoader = '1';
  document.head.appendChild(style);

  const script = document.createElement('script');
  script.src = 'tutorial.js';
  script.async = false;
  script.dataset.dproTutorialLoader = '1';
  document.head.appendChild(script);
})();
