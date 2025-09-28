import {
  clearCaretakerSession,
  requireCaretakerSession,
  getCaretakerDisplayName,
} from '../caretakers/session.js';
import { loadMyFacilities } from '../caretakers/myFacilities.js';
import { initFacilityForm } from './facilityForm.js';
import { initCaretakerBookingsModal } from './caretakerBookingsModal.js';

const logoutBtn = document.getElementById('caretakerLogout');
const facilitiesList = document.getElementById('caretakerFacilitiesList');
const facilitiesMessage = document.getElementById('caretakerFacilitiesMessage');
const facilitiesRefreshBtn = document.getElementById('caretakerFacilitiesRefresh');
const addFacilityModal = document.getElementById('addFacilityModal');
const openAddFacilityBtn = document.getElementById('openAddFacilityModal');
const addFacilityModalCloseButtons = document.querySelectorAll('[data-add-facility-modal-close]');
const caretakerIdentity = document.getElementById('caretakerIdentity');
const caretakerIdentityName = document.getElementById('caretakerIdentityName');

function setStatus(element, text, tone = 'info') {
  if (!element) {
    return;
  }
  element.textContent = text || '';
  element.classList.remove('text-red-600', 'text-emerald-600', 'text-gray-500');
  if (!text) {
    return;
  }
  if (tone === 'error') {
    element.classList.add('text-red-600');
  } else if (tone === 'success') {
    element.classList.add('text-emerald-600');
  } else {
    element.classList.add('text-gray-500');
  }
}

function formatAddress(facility) {
  const parts = [];
  if (facility.city) {
    const cityPart = facility.postal_code ? `${facility.postal_code} ${facility.city}`.trim() : facility.city;
    parts.push(cityPart);
  } else if (facility.postal_code) {
    parts.push(facility.postal_code);
  }
  if (facility.address_line1) {
    parts.push(facility.address_line1);
  }
  if (facility.address_line2) {
    parts.push(facility.address_line2);
  }
  return parts.join(', ');
}

function renderFacilities(facilities) {
  if (!facilitiesList) {
    return;
  }
  facilitiesList.innerHTML = '';
  if (!facilities || facilities.length === 0) {
    const emptyInfo = document.createElement('p');
    emptyInfo.className = 'text-sm text-gray-500';
    emptyInfo.textContent = 'Nie masz jeszcze żadnych świetlic. Dodaj pierwszą, aby rozpocząć.';
    facilitiesList.appendChild(emptyInfo);
    return;
  }

  facilities.forEach((facility) => {
    const card = document.createElement('article');
    card.className = 'rounded-2xl border border-gray-100 shadow-sm p-4 bg-white flex flex-col gap-3';

    const header = document.createElement('div');
    header.className = 'space-y-1';

    const title = document.createElement('h3');
    title.className = 'text-base font-semibold text-gray-900';
    title.textContent = facility.name || 'Świetlica';
    header.appendChild(title);

    const cityLineParts = [];
    if (facility.postal_code) {
      cityLineParts.push(facility.postal_code);
    }
    if (facility.city) {
      cityLineParts.push(facility.city);
    }
    if (cityLineParts.length) {
      const subtitle = document.createElement('p');
      subtitle.className = 'text-xs font-medium text-gray-500';
      subtitle.textContent = cityLineParts.join(' ');
      header.appendChild(subtitle);
    }

    card.appendChild(header);

    const metaList = document.createElement('dl');
    metaList.className = 'text-sm text-gray-600 space-y-1';

    const address = formatAddress(facility);
    if (address) {
      const dt = document.createElement('dt');
      dt.className = 'font-medium text-gray-700';
      dt.textContent = 'Adres';
      const dd = document.createElement('dd');
      dd.textContent = address;
      metaList.appendChild(dt);
      metaList.appendChild(dd);
    }

    if (facility.capacity !== null && facility.capacity !== undefined) {
      const dt = document.createElement('dt');
      dt.className = 'font-medium text-gray-700';
      dt.textContent = 'Pojemność';
      const dd = document.createElement('dd');
      dd.textContent = `${facility.capacity} osób`;
      metaList.appendChild(dt);
      metaList.appendChild(dd);
    }

    card.appendChild(metaList);

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap items-center gap-2 pt-2';

    const editLink = document.createElement('a');
    editLink.className = 'inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring focus-visible:ring-blue-500/70';
    editLink.href = `./caretakerFacilityEdit.html?facility=${encodeURIComponent(facility.id)}`;
    editLink.textContent = '✏️ Edytuj świetlicę';
    actions.appendChild(editLink);

    card.appendChild(actions);

    facilitiesList.appendChild(card);
  });
}

async function bootstrap() {
  const session = await requireCaretakerSession({ redirectTo: './caretakerLogin.html' });
  if (!session) {
    return;
  }

  if (caretakerIdentity && caretakerIdentityName) {
    const displayName = getCaretakerDisplayName(session) || session.profile?.email || session.profile?.login || '';
    caretakerIdentityName.textContent = displayName || 'Opiekun';
    caretakerIdentity.classList.remove('hidden');
    caretakerIdentity.classList.add('inline-flex');
  }

  initCaretakerBookingsModal({ session });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      void (async () => {
        await clearCaretakerSession();
        window.location.replace('./caretakerLogin.html');
      })();
    });
  }

  let facilitiesCache = [];
  let isLoadingFacilities = false;

  function setLoadingState(isLoading) {
    if (facilitiesRefreshBtn) {
      facilitiesRefreshBtn.disabled = isLoading;
    }
    if (openAddFacilityBtn) {
      openAddFacilityBtn.disabled = isLoading;
    }
  }

  async function loadFacilities({ forceRefresh = false } = {}) {
    if (isLoadingFacilities) {
      return;
    }
    isLoadingFacilities = true;
    setLoadingState(true);
    setStatus(facilitiesMessage, forceRefresh ? 'Odświeżanie listy świetlic...' : 'Ładowanie listy świetlic...');

    try {
      const facilities = await loadMyFacilities({
        columns:
          'id,name,postal_code,city,address_line1,address_line2,capacity,price_per_hour,price_per_day,price_list_url,rental_rules_url,lat,lng,description',
        forceRefresh,
      });
      facilitiesCache = Array.isArray(facilities) ? facilities : [];
      renderFacilities(facilitiesCache);
      setStatus(
        facilitiesMessage,
        facilitiesCache.length
          ? 'Wybierz świetlicę, aby przejść do szczegółowej edycji.'
          : 'Nie masz jeszcze żadnych świetlic przypisanych do konta.',
        facilitiesCache.length ? 'info' : 'info',
      );
    } catch (error) {
      console.error(error);
      setStatus(facilitiesMessage, 'Nie udało się pobrać listy świetlic.', 'error');
      if (!facilitiesCache.length) {
        renderFacilities([]);
      }
    } finally {
      isLoadingFacilities = false;
      setLoadingState(false);
    }
  }

  let facilityFormControls = initFacilityForm({
    session,
    onFacilityCreated: async () => {
      await loadFacilities({ forceRefresh: true });
      setStatus(facilitiesMessage, 'Dodano nową świetlicę. Możesz teraz edytować jej szczegóły.', 'success');
      closeAddFacilityModalDialog({ restoreFocus: false, resetForm: true });
    },
  });

  const bodyClassList = document.body?.classList || null;
  const modalClassList = addFacilityModal?.classList || null;
  let lastFocusedBeforeModal = null;
  let escapeListenerAttached = false;

  function isModalOpen() {
    return Boolean(modalClassList) && !modalClassList.contains('hidden');
  }

  function trapBodyScroll(shouldTrap) {
    if (!bodyClassList) {
      return;
    }
    if (shouldTrap) {
      bodyClassList.add('overflow-hidden');
    } else {
      bodyClassList.remove('overflow-hidden');
    }
  }

  function handleModalEscape(event) {
    if (event.key !== 'Escape' || !isModalOpen()) {
      return;
    }
    event.preventDefault();
    closeAddFacilityModalDialog({ restoreFocus: true, resetForm: true });
  }

  function attachModalEscapeListener() {
    if (escapeListenerAttached) {
      return;
    }
    document.addEventListener('keydown', handleModalEscape);
    escapeListenerAttached = true;
  }

  function detachModalEscapeListener() {
    if (!escapeListenerAttached) {
      return;
    }
    document.removeEventListener('keydown', handleModalEscape);
    escapeListenerAttached = false;
  }

  function openAddFacilityModalDialog() {
    if (!addFacilityModal || !modalClassList || isModalOpen()) {
      return;
    }
    lastFocusedBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalClassList.remove('hidden');
    modalClassList.add('flex');
    trapBodyScroll(true);
    facilityFormControls?.reset?.({ focus: false });
    window.setTimeout(() => {
      facilityFormControls?.focusFirstField?.();
    }, 50);
    attachModalEscapeListener();
  }

  function closeAddFacilityModalDialog({ restoreFocus = true, resetForm = false } = {}) {
    if (!addFacilityModal || !modalClassList || !isModalOpen()) {
      return;
    }
    modalClassList.add('hidden');
    modalClassList.remove('flex');
    trapBodyScroll(false);
    detachModalEscapeListener();
    if (resetForm) {
      facilityFormControls?.reset?.({ focus: false });
      facilityFormControls?.clearMessage?.();
    }
    if (restoreFocus && lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  window.closeAddFacilityModalDialog = closeAddFacilityModalDialog;

  if (openAddFacilityBtn) {
    openAddFacilityBtn.addEventListener('click', () => {
      openAddFacilityModalDialog();
    });
  }

  addFacilityModalCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeAddFacilityModalDialog({ restoreFocus: true, resetForm: true });
    });
  });

  if (addFacilityModal) {
    addFacilityModal.addEventListener('click', (event) => {
      if (event.target === addFacilityModal) {
        closeAddFacilityModalDialog({ restoreFocus: true, resetForm: true });
      }
    });
  }

  if (facilitiesRefreshBtn) {
    facilitiesRefreshBtn.addEventListener('click', () => {
      void loadFacilities({ forceRefresh: true });
    });
  }

  await loadFacilities({ forceRefresh: false });
}

void bootstrap();
