import { createSupabaseClient, GOOGLE_MAPS_API_KEY } from './config/supabaseClient.js';
import { state } from './state/appState.js';
import { $, $$ } from './utils/dom.js';
import {
  pad2,
  ymd,
  fmtDateLabel,
  escapeHtml,
  formatDate,
  formatTime,
} from './utils/format.js';
import { renderSidebar, renderMain } from './ui/layout.js';
import { createFacilitiesModule } from './data/facilities.js';
import { getCaretakerSession, getCaretakerDisplayName } from './caretakers/session.js';
import { createDayView } from './calendar/dayView.js';
import { createMonthModal } from './calendar/monthModal.js';
import { createBookingForm } from './booking/form.js';
import { createDocGenerator } from './documents/docGenerator.js';
import { createInstructionsModal } from './ui/instructionsModal.js';
import { createGalleryModal } from './ui/galleryModal.js';
import { createIntroVideoModal } from './ui/introVideo.js';

const supabase = createSupabaseClient();

if (!supabase) {
  console.error('Supabase client nie został utworzony. Przerwano inicjalizację aplikacji.');
} else {
  const domUtils = { $, $$ };
  const formatUtils = { pad2, ymd, fmtDateLabel, escapeHtml, formatDate, formatTime };

  const dayView = createDayView({ state, supabase, domUtils, formatUtils });
  const docGenerator = createDocGenerator({ state, supabase, domUtils, formatUtils });
  const instructionsModal = createInstructionsModal({ state, domUtils });
  const galleryModal = createGalleryModal({ state, domUtils, formatUtils });
  const introVideoModal = createIntroVideoModal();
  const facilities = createFacilitiesModule({
    state,
    supabase,
    domUtils,
    formatUtils,
    dayView,
    docGenerator,
    instructionsModal,
    galleryModal,
    googleMapsKey: GOOGLE_MAPS_API_KEY,
  });
  const monthModal = createMonthModal({
    state,
    supabase,
    renderDay: dayView.renderDay,
    setDayPickerFromCurrent: dayView.setDayPickerFromCurrent,
  });
  const bookingForm = createBookingForm({
    state,
    supabase,
    domUtils,
    formatUtils,
    dayView,
    docGenerator,
    facilities,
  });

  window.initMapsApi = facilities.initMapsApi;

  async function setupCaretakerNavigation() {
    const panelLink = document.getElementById('caretakerPanelLink');
    if (!panelLink) {
      return;
    }

    const loggedInfo = document.getElementById('caretakerLoggedInfo');
    const loggedName = document.getElementById('caretakerLoggedName');

    function applySessionToDom(session) {
      if (session) {
        panelLink.href = './caretakerPanel.html';
        panelLink.dataset.target = 'panel';
        if (loggedInfo && loggedName) {
          const displayName = getCaretakerDisplayName(session) || session.profile?.email || session.profile?.login || '';
          loggedName.textContent = displayName || 'Opiekun';
          loggedInfo.classList.remove('hidden');
          loggedInfo.classList.add('inline-flex');
        }
      } else {
        panelLink.href = './caretakerLogin.html';
        panelLink.dataset.target = 'login';
        if (loggedInfo) {
          loggedInfo.classList.remove('inline-flex');
          loggedInfo.classList.add('hidden');
        }
      }
    }

    async function refreshSession({ forceRefresh = false } = {}) {
      try {
        const session = await getCaretakerSession({ forceRefresh });
        applySessionToDom(session);
        return session;
      } catch (error) {
        console.warn('Nie udało się sprawdzić statusu logowania opiekuna.', error);
        applySessionToDom(null);
        return null;
      }
    }

    panelLink.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      panelLink.dataset.loading = '1';
      void (async () => {
        try {
          const session = await refreshSession();
          const targetUrl = session ? './caretakerPanel.html' : './caretakerLogin.html';
          window.location.href = targetUrl;
        } finally {
          delete panelLink.dataset.loading;
        }
      })();
    });

    await refreshSession();
  }

  async function init() {
    void setupCaretakerNavigation();
    introVideoModal.showIfNeeded();
    renderSidebar({ onSearch: facilities.renderFacilityList });
    renderMain();
    dayView.attachDayViewListeners();
    instructionsModal.attachListeners();
    galleryModal.attachListeners();
    monthModal.attachMonthModalListeners();
    bookingForm.installListeners();
    await facilities.loadDictionaries();
    await facilities.loadFacilities();
    await bookingForm.tryLoadBookingFromUrl();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
    });
  } else {
    void init();
  }
}
