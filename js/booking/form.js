import {
  BOOKING_NOTIFICATION_EVENTS,
  triggerBookingNotification,
} from '../utils/emailNotifications.js';
import {
  getTenantId,
  setTenantId,
  inferTenantIdFromFacility,
  resolveTenantIdForFacility,
  resolveTenantIdForBookingToken,
} from '../state/tenant.js';

export function createBookingForm({
  state,
  supabase,
  domUtils,
  formatUtils,
  dayView,
  docGenerator,
  facilities,
  availabilityPreview,
  bookingWizard,
}) {
  const { $ } = domUtils;
  const { pad2 } = formatUtils;
  let listenersAttached = false;
  let titleInput;
  let typeSelect;
  let renterNameInput;
  let mathAnswerInput;
  let mathPuzzleQuestionEl;
  let mathPuzzleRefreshBtn;
  let mathPuzzle = null;
  const facilitiesModule = facilities || state.facilitiesModule || null;
  if (facilitiesModule && state.facilitiesModule !== facilitiesModule) {
    state.facilitiesModule = facilitiesModule;
  }
  const previewModule = availabilityPreview || null;
  const wizardModule = bookingWizard || null;

  const FORM_MESSAGE_BASE_CLASSES = [
    'mt-3',
    'rounded-2xl',
    'border',
    'px-4',
    'py-2',
    'text-sm',
    'font-medium',
    'shadow-sm',
    'backdrop-blur-sm',
  ];
  const FORM_MESSAGE_TONE_CLASSES = {
    success: ['border-emerald-400', 'bg-emerald-50/90', 'text-emerald-700'],
    error: ['border-rose-400', 'bg-rose-50/90', 'text-rose-700'],
    info: ['border-slate-200', 'bg-white/80', 'text-slate-700'],
  };
  const FORM_MESSAGE_ALL_TONE_CLASSES = Object.values(FORM_MESSAGE_TONE_CLASSES).flat();

  function setFormMessage(text, tone = 'info') {
    const msg = $('#formMsg');
    if (msg) {
      const { classList } = msg;
      if (!text) {
        msg.textContent = '';
        classList.remove(
          ...FORM_MESSAGE_BASE_CLASSES,
          ...FORM_MESSAGE_ALL_TONE_CLASSES,
        );
        classList.add('hidden');
        return;
      }

      msg.textContent = text;
      classList.remove('hidden');
      classList.remove(...FORM_MESSAGE_ALL_TONE_CLASSES);
      classList.add(...FORM_MESSAGE_BASE_CLASSES);
      const toneClasses = FORM_MESSAGE_TONE_CLASSES[tone] || FORM_MESSAGE_TONE_CLASSES.info;
      classList.add(...toneClasses);
    }
  }

  async function rerenderDayAndPreview() {
    await dayView.renderDay();
    if (previewModule?.refresh) {
      await previewModule.refresh();
    }
  }

  async function ensureTenantForFacility(facility) {
    if (!facility) {
      return null;
    }
    const currentTenant = getTenantId();
    const facilityTenant = inferTenantIdFromFacility(facility);
    if (facilityTenant) {
      facility.tenant_id = facilityTenant;
      if (facilityTenant !== currentTenant) {
        setTenantId(facilityTenant);
      }
      return facilityTenant;
    }
    const resolved = await resolveTenantIdForFacility({
      supabase,
      facilityId: facility.id,
    });
    if (resolved) {
      facility.tenant_id = resolved;
      if (resolved !== currentTenant) {
        setTenantId(resolved);
      }
      return resolved;
    }
    return currentTenant;
  }

  async function ensureTenantForBookingToken(token) {
    const currentTenant = getTenantId();
    if (currentTenant) {
      return currentTenant;
    }
    const resolved = await resolveTenantIdForBookingToken({ supabase, token });
    if (resolved) {
      setTenantId(resolved);
    }
    return resolved;
  }

  async function fetchFacilityById(facilityId) {
    const builders = [
      () => supabase.from('public_facilities').select('*').eq('id', facilityId).maybeSingle(),
      () => supabase.from('facilities').select('*').eq('id', facilityId).maybeSingle(),
    ];
    for (const build of builders) {
      try {
        const { data, error } = await build();
        if (error) {
          console.warn('Błąd wczytywania obiektu (źródło publiczne):', error);
          continue;
        }
        if (data) {
          await ensureTenantForFacility(data);
          return data;
        }
      } catch (error) {
        console.warn('Wyjątek wczytywania obiektu:', error);
      }
    }
    return null;
  }

  function generateMathPuzzle() {
    const operations = [
      { symbol: '+', label: 'plus', compute: (a, b) => a + b },
      { symbol: '−', label: 'minus', compute: (a, b) => a - b },
    ];
    const first = Math.floor(Math.random() * 8) + 3;
    const second = Math.floor(Math.random() * 8) + 2;
    const op = operations[Math.floor(Math.random() * operations.length)];
    const [a, b] = op.symbol === '−' && second > first ? [second, first] : [first, second];
    return {
      question: `Ile to ${a} ${op.symbol} ${b}?`,
      answer: op.compute(a, b),
    };
  }

  function renderMathPuzzle() {
    if (!mathAnswerInput || !mathPuzzleQuestionEl) {
      return;
    }
    if (!mathPuzzle) {
      mathPuzzle = generateMathPuzzle();
    }
    mathPuzzleQuestionEl.textContent = mathPuzzle.question;
    mathAnswerInput.value = '';
    mathAnswerInput.setAttribute('aria-label', mathPuzzle.question);
  }

  function refreshMathPuzzle({ focusInput = false } = {}) {
    mathPuzzle = generateMathPuzzle();
    renderMathPuzzle();
    if (focusInput && mathAnswerInput) {
      mathAnswerInput.focus();
    }
  }

  function generateClientUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${randomPart}`;
  }

  function validateMathPuzzleAnswer() {
    if (!mathAnswerInput) {
      return true;
    }
    const raw = mathAnswerInput.value.trim();
    if (!raw) {
      return false;
    }
    const number = Number.parseInt(raw, 10);
    if (!Number.isFinite(number)) {
      return false;
    }
    return number === mathPuzzle?.answer;
  }

  function getSelectedEventTypeName() {
    if (!typeSelect || !typeSelect.value) {
      return '';
    }
    const option = typeSelect.selectedOptions?.[0]
      || typeSelect.options[typeSelect.selectedIndex];
    return option ? option.textContent.trim() : '';
  }

  function maskNameValue(rawValue) {
    if (!rawValue) {
      return '';
    }
    const parts = rawValue
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) {
      return '';
    }
    const masked = parts
      .map((part) => {
        const firstChar = part.charAt(0);
        if (!firstChar) {
          return '';
        }
        return `${firstChar.toUpperCase()}***`;
      })
      .filter(Boolean);
    return masked.join(' ');
  }

  function updateTitleField() {
    if (!titleInput) {
      return;
    }
    const eventTypeName = getSelectedEventTypeName();
    const maskedName = maskNameValue(renterNameInput?.value || '');
    const segments = [];
    if (eventTypeName) {
      segments.push(eventTypeName);
    }
    if (maskedName) {
      segments.push(maskedName);
    }
    titleInput.value = segments.join(' – ');
  }

  async function hasOverlap(facilityId, startIso, endIso) {
    const { data, error } = await supabase
      .from('public_bookings')
      .select('id,status,start_time,end_time')
      .eq('facility_id', facilityId)
      .in('status', ['active', 'pending'])
      .lt('start_time', endIso)
      .gt('end_time', startIso);
    if (error) {
      console.warn('Błąd sprawdzania kolizji:', error);
      return false;
    }
    return (data || []).length > 0;
  }

  async function hasTouchingBooking(facilityId, startIso, endIso) {
    const { data, error } = await supabase
      .from('public_bookings')
      .select('id')
      .eq('facility_id', facilityId)
      .in('status', ['active', 'pending'])
      .or(`end_time.eq.${startIso},start_time.eq.${endIso}`);
    if (error) {
      console.warn('Błąd sprawdzania styczności rezerwacji:', error);
      return false;
    }
    return (data || []).length > 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!state.selectedFacility) {
      alert('Najpierw wybierz obiekt.');
      return;
    }
    const form = event.target;
    setFormMessage('');
    if (!validateMathPuzzleAnswer()) {
      setFormMessage('Niepoprawna odpowiedź na zagadkę. Spróbuj ponownie.', 'error');
      refreshMathPuzzle({ focusInput: true });
      return;
    }
    setFormMessage('Trwa zapisywanie...', 'info');
    let startIso;
    let endIso;
    let dayValue;
    if (state.mode === 'day') {
      dayValue = form.day_only.value;
      if (!dayValue) {
        setFormMessage('Wybierz dzień.', 'error');
        return;
      }
      startIso = new Date(`${dayValue}T00:00`).toISOString();
      endIso = new Date(`${dayValue}T23:59:59`).toISOString();
    } else {
      dayValue = $('#dayPicker')?.value;
      if (!dayValue) {
        setFormMessage('Wybierz dzień.', 'error');
        return;
      }
      const startHour = pad2(parseInt($('#hourStart')?.value ?? '0', 10));
      const endHour = pad2(parseInt($('#hourEnd')?.value ?? '0', 10));
      startIso = new Date(`${dayValue}T${startHour}:00`).toISOString();
      endIso = new Date(`${dayValue}T${endHour}:00`).toISOString();
      if (new Date(endIso) <= new Date(startIso)) {
        setFormMessage('Koniec musi być po początku.', 'error');
        return;
      }
    }
    const startDay = new Date(startIso).getDay();
    const isWeekendStart = startDay === 0 || startDay === 6;
    const overlap = await hasOverlap(state.selectedFacility.id, startIso, endIso);
    if (overlap) {
      setFormMessage('Wybrany termin koliduje z istniejącą rezerwacją (wstępna lub potwierdzona). Wybierz inny termin.', 'error');
      return;
    }
    let touchesAdjacentBooking = false;
    if (isWeekendStart) {
      touchesAdjacentBooking = await hasTouchingBooking(
        state.selectedFacility.id,
        startIso,
        endIso,
      );
      if (touchesAdjacentBooking) {
        setFormMessage('Trwa zapisywanie... Uwaga: rezerwacja graniczy z inną i może wymagać uzgodnień między rezerwującymi.', 'info');
      }
    }
    updateTitleField();

    const payload = {
      id: generateClientUuid(),
      cancel_token: generateClientUuid(),
      facility_id: state.selectedFacility.id,
      title: form.title.value.trim(),
      event_type_id: form.event_type_id.value || null,
      start_time: startIso,
      end_time: endIso,
      renter_name: form.renter_name.value.trim(),
      renter_email: form.renter_email.value.trim(),
      notes: form.notes.value.trim() || null,
      is_public: true,
      status: 'pending',
    };
    const { error } = await supabase
      .from('bookings')
      .insert(payload, { returning: 'minimal' });
    if (error) {
      console.error(error);
      setFormMessage(`Błąd: ${error.message || 'nie udało się utworzyć rezerwacji.'}`, 'error');
      return;
    }
    let successMessage = 'Wstępna rezerwacja złożona! Opiekun obiektu potwierdzi lub odrzuci.';
    if (touchesAdjacentBooking) {
      successMessage += ' Uwaga: rezerwacja graniczy z inną i może wymagać uzgodnień między rezerwującymi.';
    }
    setFormMessage(successMessage, 'success');
    const { data: freshBooking, error: freshBookingError } = await supabase
      .from('public_bookings')
      .select('*')
      .eq('id', payload.id)
      .maybeSingle();
    if (freshBookingError) {
      console.error('Błąd pobierania nowej rezerwacji:', freshBookingError);
    }
    const bookingRow = freshBooking
      ? {
          ...freshBooking,
          cancel_token: freshBooking.cancel_token ?? payload.cancel_token,
          renter_email: freshBooking.renter_email ?? payload.renter_email,
          renter_name: freshBooking.renter_name ?? payload.renter_name,
          notes: freshBooking.notes ?? payload.notes,
        }
      : { ...payload };
    state.bookingsCache.clear();
    await rerenderDayAndPreview();
    await showPostBookingActions(bookingRow, { logCancelUrl: true });
    if (wizardModule?.showForm) {
      wizardModule.showForm({ focusForm: false });
    }
    if (bookingRow?.id) {
      void triggerBookingNotification(
        supabase,
        BOOKING_NOTIFICATION_EVENTS.CREATED,
        {
          bookingId: bookingRow.id,
          cancelToken: bookingRow.cancel_token || null,
          metadata: {
            source: 'public_form',
          },
        },
      );
    }
    refreshMathPuzzle();
  }

  async function handleCancelClick() {
    if (!state.lastBooking) {
      alert('Brak ostatniej rezerwacji.');
      return;
    }
    const lastBooking = state.lastBooking;
    if (!confirm('Na pewno anulować tę rezerwację?')) {
      return;
    }
    const { data, error } = await supabase.rpc('cancel_booking', { p_token: state.lastBooking.cancel_token });
    if (error) {
      alert(`Błąd anulowania: ${error.message || ''}`);
      return;
    }
    if (data) {
      alert('Rezerwacja anulowana.');
      setFormMessage('Rezerwacja anulowana.', 'success');
      void triggerBookingNotification(
        supabase,
        BOOKING_NOTIFICATION_EVENTS.CANCELLED_BY_RENTER,
        {
          bookingId: lastBooking?.id || null,
          cancelToken: lastBooking?.cancel_token || null,
          metadata: {
            source: 'self_service',
          },
        },
      );
      state.lastBooking = null;
      state.bookingsCache.clear();
      await rerenderDayAndPreview();
      setCancelButtonVisible(false);
    } else {
      alert('Nie znaleziono lub już anulowana.');
    }
  }

  function handleDocsLinkClick(event) {
    event.preventDefault();
    const el = $('#docGen');
    if (el) {
      window.scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' });
    }
  }

  function setCancelButtonVisible(visible) {
    const cancelBtn = $('#cancelThisBooking');
    if (!cancelBtn) {
      return;
    }
    cancelBtn.classList.toggle('hidden', !visible);
  }

  async function revealDocGenerator(bookingRow) {
    const docsLink = $('#genDocsLink');
    docsLink?.classList.remove('hidden');
    if (!docGenerator?.showTemplateSelectorLive) {
      return;
    }
    const mount = $('#docGen');
    if (mount) {
      await docGenerator.showTemplateSelectorLive(bookingRow, mount);
    }
  }

  async function showPostBookingActions(bookingRow, { logCancelUrl = false } = {}) {
    state.lastBooking = bookingRow || null;
    await revealDocGenerator(bookingRow || null);
    setCancelButtonVisible(Boolean(bookingRow));
    if (bookingRow && logCancelUrl && bookingRow.cancel_token) {
      const cancelUrl = new URL(window.location.href);
      cancelUrl.searchParams.set('cancel', bookingRow.cancel_token);
      console.log('Cancel URL (do e-maila):', cancelUrl.toString());
    }
  }

  async function ensureFacilitySelected(facilityId) {
    if (!facilityId) {
      return false;
    }
    const stringId = String(facilityId);
    const alreadySelected = state.selectedFacility
      && String(state.selectedFacility.id) === stringId;
    let facility = state.facilities.find((f) => String(f.id) === stringId);
    if (!facility) {
      const facilityRow = await fetchFacilityById(facilityId);
      if (!facilityRow) {
        return false;
      }
      facility = facilityRow;
      if (!state.facilities.some((item) => String(item.id) === stringId)) {
        state.facilities.push(facilityRow);
      }
    }
    await ensureTenantForFacility(facility);
    const module = facilitiesModule || state.facilitiesModule;
    if (!alreadySelected) {
      if (module?.selectFacility) {
        await module.selectFacility(facility.id);
      } else {
        state.selectedFacility = facility;
        if (docGenerator?.loadTemplatesForFacility) {
          await docGenerator.loadTemplatesForFacility(facility.id);
        }
      }
    }
    return true;
  }

  async function showDocumentsForFacility(facilityId) {
    const facilityLoaded = await ensureFacilitySelected(facilityId);
    if (!facilityLoaded) {
      return false;
    }
    state.bookingsCache.clear();
    await showPostBookingActions(null);
    if (previewModule?.refresh) {
      await previewModule.refresh();
    }
    if (wizardModule?.showForm) {
      wizardModule.showForm({ focusForm: false });
    }
    return true;
  }

  async function loadBookingFromToken(token, { message } = {}) {
    if (!token) {
      return null;
    }
    const tenantResolved = await ensureTenantForBookingToken(token);
    if (!tenantResolved) {
      console.warn('Nie udało się ustawić najemcy na podstawie tokenu anulowania.');
    }
    const { data: bookingRow, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('cancel_token', token)
      .maybeSingle();
    if (error) {
      console.error('Błąd wczytywania rezerwacji z linku:', error);
      alert('Nie udało się wczytać rezerwacji. Spróbuj ponownie lub skontaktuj się z administratorem.');
      return null;
    }
    if (!bookingRow) {
      alert('Nie znaleziono rezerwacji powiązanej z tym linkiem.');
      return null;
    }
    const facilityLoaded = await ensureFacilitySelected(bookingRow.facility_id);
    if (!facilityLoaded) {
      alert('Nie udało się wczytać obiektu powiązanego z rezerwacją.');
      return null;
    }
    state.bookingsCache.clear();
    if (bookingRow.start_time) {
      const startDate = new Date(bookingRow.start_time);
      if (!Number.isNaN(startDate.getTime())) {
        state.currentDate = startDate;
        dayView.setDayPickerFromCurrent();
        await dayView.renderDay();
      }
    }
    await showPostBookingActions(bookingRow, { logCancelUrl: false });
    if (previewModule?.refresh) {
      await previewModule.refresh();
    }
    if (wizardModule?.showForm) {
      wizardModule.showForm({ focusForm: false });
    }
    if (message) {
      setFormMessage(message, 'info');
    }
    return bookingRow;
  }

  async function tryLoadBookingFromUrl() {
    const url = new URL(window.location.href);
    const bookingParam = url.searchParams.get('booking');
    const cancelToken = url.searchParams.get('cancel');
    if (!bookingParam && !cancelToken) {
      return;
    }

    setCancelButtonVisible(false);

    if (cancelToken) {
      const bookingRow = await loadBookingFromToken(cancelToken, {
        message: 'Wczytano rezerwację z linku. Potwierdź anulowanie, aby kontynuować.',
      });
      if (!bookingRow) {
        return;
      }
      if (!confirm('Wykryto link anulowania rezerwacji. Czy chcesz kontynuować?')) {
        return;
      }
      const { data, error } = await supabase.rpc('cancel_booking', { p_token: cancelToken });
      if (error) {
        alert(`Błąd anulowania: ${error.message || ''}`);
        return;
      }
      if (data) {
        alert('Rezerwacja anulowana.');
        setFormMessage('Rezerwacja anulowana.', 'success');
        void triggerBookingNotification(
          supabase,
          BOOKING_NOTIFICATION_EVENTS.CANCELLED_BY_RENTER,
          {
            bookingId: bookingRow?.id || null,
            cancelToken: cancelToken || null,
            metadata: {
              source: 'email_link',
            },
          },
        );
        state.lastBooking = null;
        state.bookingsCache.clear();
        if (state.selectedFacility) {
          await rerenderDayAndPreview();
        }
        setCancelButtonVisible(false);
      } else {
        alert('Nie znaleziono lub już anulowana.');
      }
      return;
    }

    if (!bookingParam) {
      return;
    }

    const trimmedBooking = bookingParam.trim();
    if (!trimmedBooking) {
      return;
    }

    const looksLikeFacilityId = /^\d+$/.test(trimmedBooking);
    let handledAsFacility = false;
    if (looksLikeFacilityId) {
      handledAsFacility = await showDocumentsForFacility(trimmedBooking);
      if (handledAsFacility) {
        setFormMessage('Wczytano dane obiektu z linku. Możesz wygenerować dokumenty.', 'info');
        return;
      }
    }

    const bookingRow = await loadBookingFromToken(trimmedBooking, {
      message: 'Wczytano rezerwację z linku. Możesz ją anulować lub wygenerować dokumenty.',
    });

    if (!bookingRow && looksLikeFacilityId && !handledAsFacility) {
      setFormMessage('Nie udało się wczytać danych powiązanych z tym linkiem.', 'error');
    }
  }

  function installListeners() {
    if (listenersAttached) {
      return;
    }
    listenersAttached = true;
    const form = $('#bookingForm');
    if (form) {
      form.addEventListener('submit', (event) => {
        void handleSubmit(event);
      });
    }
    titleInput = form?.querySelector('input[name="title"]') || null;
    typeSelect = form?.querySelector('select[name="event_type_id"]') || null;
    renterNameInput = form?.querySelector('input[name="renter_name"]') || null;
    mathAnswerInput = form?.querySelector('input[name="math_answer"]') || null;
    mathPuzzleQuestionEl = $('#mathPuzzleQuestion');
    mathPuzzleRefreshBtn = $('#mathPuzzleRefresh');

    if (titleInput) {
      titleInput.readOnly = true;
    }
    if (typeSelect) {
      typeSelect.addEventListener('change', updateTitleField);
      typeSelect.addEventListener('input', updateTitleField);
    }
    if (renterNameInput) {
      renterNameInput.addEventListener('input', updateTitleField);
      renterNameInput.addEventListener('change', updateTitleField);
    }
    if (mathPuzzleRefreshBtn) {
      mathPuzzleRefreshBtn.addEventListener('click', () => {
        refreshMathPuzzle({ focusInput: true });
      });
    }
    form?.addEventListener('reset', () => {
      window.setTimeout(() => {
        updateTitleField();
        refreshMathPuzzle();
      }, 0);
    });

    updateTitleField();
    renderMathPuzzle();
    const cancelBtn = $('#cancelThisBooking');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        void handleCancelClick();
      });
    }
  }

  return {
    installListeners,
    tryLoadBookingFromUrl,
    tryCancelFromUrl: tryLoadBookingFromUrl,
  };
}
