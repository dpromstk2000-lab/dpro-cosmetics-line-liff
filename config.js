window.DPRO_COSMETICS_CONFIG = Object.freeze({
  API_BASE: "https://dpro-cosmetics-line-api.dpromstk2000.workers.dev",
  STORE_CODE: "dpro_cosmetics_demo",

  // LINE DevelopersでLIFFアプリを作成した後に設定します。
  // 例: "2000000000-abcdefgh"
  LIFF_ID: "",

  // デモRepositoryではLIFF ID未設定時に既存顧客デモを表示します。
  // 本番導入時は false に変更してください。
  DEMO_WHEN_LIFF_ID_EMPTY: true,

  MEMBER_PAGE: "member.html",
  CONSULTATION_PAGE: "consultation.html",
  PICKUP_PAGE: "pickup.html",
  OWNER_PAGE: "owner.html",
  OWNER_IPAD_PAGE: "owner-ipad.html",
  OWNER_SETTINGS_PAGE: "owner-settings.html",
  POLICY_VERSION: "2026-07",
  REQUEST_TIMEOUT_MS: 15000,
});
