(() => {
  "use strict";

  const D = window.DPRO;
  const state = {
    identityPayload: null,
    bootstrap: null,
    selectedMenu: null,
    selectedStaff: null,
    selectedSlot: null,
    availability: null,
    editingReservation: null,
    cancellingReservation: null,
    submitting: false,
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    D.setDemoBadge(document.getElementById("demoBadge"));
    document.getElementById("backLink").href = `index.html${D.querySuffix()}`;
    document.getElementById("notReadyBack").href = `index.html${D.querySuffix()}`;
    bindEvents();
    setDateLimits();

    try {
      state.identityPayload = await D.getIdentityPayload();
      const result = await D.request("/consultation/bootstrap", {
        method: "POST",
        body: state.identityPayload,
      });
      state.bootstrap = result;
      renderStore(result.store);
      renderBootstrap(result);
    } catch (error) {
      showFatalError(error);
    }
  }

  function bindEvents() {
    document.getElementById("loadSlotsButton").addEventListener("click", loadAvailability);
    document.getElementById("submitBookingButton").addEventListener("click", submitBooking);
    document.getElementById("cancelEditButton").addEventListener("click", clearEditMode);
    document.getElementById("consultationRequest").addEventListener("input", updateRequestCount);
    document.getElementById("bookingDate").addEventListener("change", () => {
      state.selectedSlot = null;
      state.availability = null;
      renderSlots([]);
      updateConfirmation();
    });
    document.getElementById("retryButton").addEventListener("click", () => window.location.reload());
    document.getElementById("confirmCancelButton").addEventListener("click", confirmCancellation);
  }

  function renderStore(store) {
    const name = store?.store_name || "DPROコスメティックサロン";
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = name; });
    document.title = `${name}｜美容相談予約`;
  }

  function renderBootstrap(result) {
    const member = result?.member || {};
    document.getElementById("loadingView").hidden = true;

    if (member.member_status !== "approved") {
      document.getElementById("notReadyMessage").textContent = member.message || "会員登録が完了していません。";
      document.getElementById("notReadyView").hidden = false;
      return;
    }

    document.getElementById("memberName").textContent = member.customer?.full_name || "お客様";
    renderMenus(result.consultation_menus || []);
    renderStaff(result.consultant_staff || []);
    renderReservations(result.reservations?.upcoming || []);
    document.getElementById("bookingContent").hidden = false;

    if ((result.consultation_menus || []).length) {
      selectMenu(result.consultation_menus[0].id);
    }
    selectStaff(null);
  }

  function renderMenus(menus) {
    const box = document.getElementById("menuOptions");
    if (!menus.length) {
      box.innerHTML = '<div class="alert warning">現在予約できる相談メニューがありません。店舗へお問い合わせください。</div>';
      return;
    }
    box.innerHTML = menus.map((menu) => `
      <button class="choice-card" type="button" role="radio" aria-checked="false" data-menu-id="${D.escapeHtml(menu.id)}">
        <span class="choice-icon" aria-hidden="true">${menu.duration_minutes >= 60 ? "🪞" : "💄"}</span>
        <span class="choice-title">${D.escapeHtml(menu.menu_name)}</span>
        <span class="choice-description">${D.escapeHtml(menu.description || "美容相談メニュー")}</span>
        <span class="choice-meta">${D.escapeHtml(String(menu.duration_minutes))}分／${D.escapeHtml(D.formatYen(menu.price_yen))}</span>
      </button>`).join("");
    box.querySelectorAll("[data-menu-id]").forEach((button) => {
      button.addEventListener("click", () => selectMenu(button.dataset.menuId));
    });
  }

  function renderStaff(staff) {
    const box = document.getElementById("staffOptions");
    box.innerHTML = `
      <button class="choice-card staff-card" type="button" role="radio" aria-checked="false" data-staff-id="">
        <span class="choice-icon" aria-hidden="true">✨</span>
        <span class="choice-title">おまかせ</span>
        <span class="choice-description">空いているスタッフが担当します</span>
        <span class="choice-meta">最も予約しやすい選択</span>
      </button>
      ${staff.map((person) => `
        <button class="choice-card staff-card" type="button" role="radio" aria-checked="false" data-staff-id="${D.escapeHtml(person.id)}">
          <span class="choice-icon staff-initial" aria-hidden="true">${D.escapeHtml((person.display_name || "担").slice(0, 1))}</span>
          <span class="choice-title">${D.escapeHtml(person.display_name || "担当スタッフ")}</span>
          <span class="choice-description">美容相談担当</span>
          <span class="choice-meta">指名する</span>
        </button>`).join("")}`;
    box.querySelectorAll("[data-staff-id]").forEach((button) => {
      button.addEventListener("click", () => selectStaff(button.dataset.staffId || null));
    });
  }

  function selectMenu(menuId) {
    state.selectedMenu = (state.bootstrap?.consultation_menus || []).find((menu) => menu.id === menuId) || null;
    document.querySelectorAll("[data-menu-id]").forEach((button) => {
      const selected = button.dataset.menuId === menuId;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    resetAvailability();
    updateConfirmation();
  }

  function selectStaff(staffId) {
    state.selectedStaff = staffId
      ? (state.bootstrap?.consultant_staff || []).find((staff) => staff.id === staffId) || null
      : null;
    document.querySelectorAll("[data-staff-id]").forEach((button) => {
      const selected = (button.dataset.staffId || null) === staffId;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    resetAvailability();
    updateConfirmation();
  }

  function resetAvailability() {
    state.selectedSlot = null;
    state.availability = null;
    renderSlots([]);
    document.getElementById("slotStatus").className = "alert info";
    document.getElementById("slotStatus").textContent = "日付を選び、「空き時間を表示」を押してください。";
  }

  async function loadAvailability() {
    clearBookingError();
    const date = document.getElementById("bookingDate").value;
    if (!state.selectedMenu || !date) {
      showBookingError("相談メニューと予約日を選択してください。");
      return;
    }

    const button = document.getElementById("loadSlotsButton");
    button.disabled = true;
    button.textContent = "確認しています…";
    document.getElementById("slotStatus").className = "alert info";
    document.getElementById("slotStatus").textContent = "空き時間を確認しています。";
    renderSlots([]);

    try {
      const result = await D.request("/consultation/availability", {
        method: "POST",
        body: {
          ...state.identityPayload,
          menu_id: state.selectedMenu.id,
          staff_id: state.selectedStaff?.id || null,
          date,
          exclude_reservation_no: state.editingReservation?.reservation_no || null,
        },
      });
      state.availability = result.availability;
      state.selectedSlot = null;
      const slots = result.availability?.slots || [];
      if (result.availability?.closed) {
        document.getElementById("slotStatus").className = "alert warning";
        document.getElementById("slotStatus").textContent = result.availability.closed_reason || "この日は予約できません。";
      } else if (!slots.length) {
        document.getElementById("slotStatus").className = "alert warning";
        document.getElementById("slotStatus").textContent = "選択した日は空き時間がありません。別の日または「おまかせ」を選んでください。";
      } else {
        document.getElementById("slotStatus").className = "alert success";
        document.getElementById("slotStatus").textContent = `${slots.length}件の空き時間があります。希望時間を選択してください。`;
      }
      renderSlots(slots);
      updateConfirmation();
    } catch (error) {
      document.getElementById("slotStatus").className = "alert danger";
      document.getElementById("slotStatus").textContent = withRequestId(error);
    } finally {
      button.disabled = false;
      button.textContent = "空き時間を表示";
    }
  }

  function renderSlots(slots) {
    const box = document.getElementById("slotOptions");
    if (!slots.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = slots.map((slot) => `
      <button class="slot-button" type="button" role="radio" aria-checked="false" data-start-at="${D.escapeHtml(slot.start_at)}">
        <span class="slot-time">${D.escapeHtml(slot.display_time)}</span>
        <span class="slot-meta">${state.selectedStaff ? D.escapeHtml(state.selectedStaff.display_name) : `${D.escapeHtml(String(slot.available_staff_count))}名対応可`}</span>
      </button>`).join("");
    box.querySelectorAll("[data-start-at]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSlot = slots.find((slot) => slot.start_at === button.dataset.startAt) || null;
        box.querySelectorAll("[data-start-at]").forEach((item) => {
          const selected = item.dataset.startAt === button.dataset.startAt;
          item.classList.toggle("selected", selected);
          item.setAttribute("aria-checked", String(selected));
        });
        updateConfirmation();
      });
    });
  }

  function renderReservations(reservations) {
    const box = document.getElementById("upcomingReservations");
    if (!reservations.length) {
      box.innerHTML = '<div class="empty-state"><span aria-hidden="true">🌿</span><p>現在、予定されている美容相談はありません。</p></div>';
      return;
    }
    box.innerHTML = reservations.map((reservation) => `
      <article class="reservation-card" data-reservation-no="${D.escapeHtml(reservation.reservation_no)}">
        <div class="reservation-card-main">
          <span class="status-pill">予約確定</span>
          <h3>${D.escapeHtml(D.formatDateTime(reservation.start_at))}</h3>
          <p>${D.escapeHtml(reservation.menu_name || "美容相談")}／${D.escapeHtml(reservation.staff_name || "担当者おまかせ")}</p>
          ${reservation.consultation_request ? `<p class="reservation-request">相談内容：${D.escapeHtml(reservation.consultation_request)}</p>` : ""}
          <span class="reservation-number">予約番号：${D.escapeHtml(reservation.reservation_no)}</span>
        </div>
        <div class="reservation-card-actions">
          <button class="btn secondary" type="button" data-action="edit">変更する</button>
          <button class="btn soft" type="button" data-action="cancel">キャンセル</button>
        </div>
      </article>`).join("");

    box.querySelectorAll("[data-reservation-no]").forEach((card) => {
      const reservation = reservations.find((item) => item.reservation_no === card.dataset.reservationNo);
      card.querySelector('[data-action="edit"]').addEventListener("click", () => startEdit(reservation));
      card.querySelector('[data-action="cancel"]').addEventListener("click", () => openCancelDialog(reservation));
    });
  }

  function startEdit(reservation) {
    state.editingReservation = reservation;
    const menu = (state.bootstrap.consultation_menus || []).find((item) => item.id === reservation.menu_id);
    if (menu) selectMenu(menu.id);
    selectStaff(reservation.staff_id || null);
    document.getElementById("consultationRequest").value = reservation.consultation_request || "";
    updateRequestCount();
    const localDate = localDateValue(reservation.start_at);
    document.getElementById("bookingDate").value = localDate;
    document.getElementById("submitBookingButton").textContent = "変更内容を確定する";
    document.getElementById("cancelEditButton").hidden = false;
    document.getElementById("confirmTitle").textContent = "変更後の予約内容";
    document.getElementById("menuStepTitle").scrollIntoView({ behavior: "smooth", block: "start" });
    loadAvailability();
  }

  function clearEditMode() {
    state.editingReservation = null;
    state.selectedSlot = null;
    document.getElementById("submitBookingButton").textContent = "この内容で予約する";
    document.getElementById("cancelEditButton").hidden = true;
    document.getElementById("confirmTitle").textContent = "予約内容";
    document.getElementById("consultationRequest").value = "";
    updateRequestCount();
    resetAvailability();
    updateConfirmation();
  }

  async function submitBooking() {
    clearBookingError();
    if (!state.selectedMenu || !state.selectedSlot) {
      showBookingError("メニュー・日付・空き時間を選択してください。");
      return;
    }
    if (state.submitting) return;

    state.submitting = true;
    const button = document.getElementById("submitBookingButton");
    button.disabled = true;
    button.textContent = state.editingReservation ? "変更しています…" : "予約しています…";

    const body = {
      ...state.identityPayload,
      menu_id: state.selectedMenu.id,
      staff_id: state.selectedStaff?.id || null,
      start_at: state.selectedSlot.start_at,
      consultation_request: document.getElementById("consultationRequest").value.trim() || null,
    };

    try {
      let result;
      if (state.editingReservation) {
        result = await D.request("/consultation/reschedule", {
          method: "POST",
          body: { ...body, reservation_no: state.editingReservation.reservation_no },
        });
      } else {
        result = await D.request("/consultation/create", {
          method: "POST",
          body: { ...body, idempotency_key: createIdempotencyKey() },
        });
      }
      D.showToast(result.booking?.message || "予約を保存しました。");
      await refreshReservations();
      clearEditMode();
      document.getElementById("memberBookingTitle").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showBookingError(withRequestId(error));
      await loadAvailability();
    } finally {
      state.submitting = false;
      button.disabled = !state.selectedSlot;
      button.textContent = state.editingReservation ? "変更内容を確定する" : "この内容で予約する";
    }
  }

  async function refreshReservations() {
    const result = await D.request("/consultation/list", {
      method: "POST",
      body: { ...state.identityPayload, include_history: true },
    });
    state.bootstrap.reservations = result.reservations;
    renderReservations(result.reservations?.upcoming || []);
  }

  function openCancelDialog(reservation) {
    state.cancellingReservation = reservation;
    document.getElementById("cancelReservationText").textContent = `${D.formatDateTime(reservation.start_at)} ${reservation.menu_name || "美容相談"}`;
    document.getElementById("cancelReason").value = "";
    document.getElementById("cancelError").hidden = true;
    const dialog = document.getElementById("cancelDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  async function confirmCancellation() {
    if (!state.cancellingReservation) return;
    const button = document.getElementById("confirmCancelButton");
    button.disabled = true;
    button.textContent = "処理しています…";
    document.getElementById("cancelError").hidden = true;
    try {
      const result = await D.request("/consultation/cancel", {
        method: "POST",
        body: {
          ...state.identityPayload,
          reservation_no: state.cancellingReservation.reservation_no,
          reason: document.getElementById("cancelReason").value.trim() || null,
        },
      });
      D.showToast(result.cancellation?.message || "予約をキャンセルしました。");
      document.getElementById("cancelDialog").close();
      state.cancellingReservation = null;
      await refreshReservations();
    } catch (error) {
      const box = document.getElementById("cancelError");
      box.textContent = withRequestId(error);
      box.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "キャンセルを確定";
    }
  }

  function updateConfirmation() {
    document.getElementById("confirmMenu").textContent = state.selectedMenu?.menu_name || "未選択";
    document.getElementById("confirmStaff").textContent = state.selectedStaff?.display_name || "おまかせ";
    document.getElementById("confirmDateTime").textContent = state.selectedSlot ? D.formatDateTime(state.selectedSlot.start_at) : "未選択";
    document.getElementById("confirmDuration").textContent = state.selectedMenu ? `${state.selectedMenu.duration_minutes}分` : "―";
    document.getElementById("confirmPrice").textContent = state.selectedMenu ? D.formatYen(state.selectedMenu.price_yen) : "―";
    document.getElementById("submitBookingButton").disabled = !state.selectedMenu || !state.selectedSlot || state.submitting;
  }

  function setDateLimits() {
    const input = document.getElementById("bookingDate");
    const today = jstDate(new Date());
    const max = new Date();
    max.setDate(max.getDate() + 90);
    input.min = today;
    input.max = jstDate(max);
    input.value = nextLikelyOpenDate();
    document.getElementById("dateHint").textContent = `選択可能期間：${formatDateLabel(today)}〜${formatDateLabel(input.max)}`;
  }

  function nextLikelyOpenDate() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    for (let i = 0; i < 7; i += 1) {
      if (date.getDay() !== 0) return jstDate(date);
      date.setDate(date.getDate() + 1);
    }
    return jstDate(date);
  }

  function jstDate(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  }

  function localDateValue(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  }

  function formatDateLabel(value) {
    const date = new Date(`${value}T00:00:00+09:00`);
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date);
  }

  function updateRequestCount() {
    document.getElementById("requestCount").textContent = String(document.getElementById("consultationRequest").value.length);
  }

  function createIdempotencyKey() {
    if (window.crypto?.randomUUID) return `consult-${window.crypto.randomUUID()}`;
    return `consult-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showBookingError(message) {
    const box = document.getElementById("bookingError");
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearBookingError() {
    const box = document.getElementById("bookingError");
    box.hidden = true;
    box.textContent = "";
  }

  function showFatalError(error) {
    document.getElementById("loadingView").hidden = true;
    document.getElementById("errorMessage").textContent = withRequestId(error);
    document.getElementById("errorView").hidden = false;
  }

  function withRequestId(error) {
    return error?.requestId ? `${error.message}（確認番号：${error.requestId}）` : (error?.message || "エラーが発生しました。");
  }
})();
