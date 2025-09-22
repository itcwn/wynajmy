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
  const bookingForm = createBookingForm({ state, supabase, domUtils, formatUtils, dayView, docGenerator });

  window.initMapsApi = facilities.initMapsApi;

  async function init() {
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
    await bookingForm.tryCancelFromUrl();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
    });
  } else {
    void init();
  }
}
