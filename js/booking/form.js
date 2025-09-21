export function createBookingForm({
  state,
  supabase,
  domUtils,
  formatUtils,
  dayView,
  docGenerator,
  facilities,
}) {
  const { $ } = domUtils;
  const { pad2 } = formatUtils;
  let listenersAttached = false;
  let titleInput;
  let typeSelect;
  let renterNameInput;

  function setFormMessage(text) {
    const msg = $('#formMsg');
    if (msg) {
      msg.textContent = text || '';
    }
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
      .from('bookings')
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

  async function handleSubmit(event) {
    event.preventDefault();
    if (!state.selectedFacility) {
      alert('Najpierw wybierz świetlicę.');
      return;
    }
    const form = event.target;
    setFormMessage('Trwa zapisywanie...');
    let startIso;
    let endIso;
    if (state.mode === 'day') {
      const dayValue = form.day_only.value;
      if (!dayValue) {
        setFormMessage('Wybierz dzień.');
        return;
      }
      startIso = new Date(`${dayValue}T00:00`).toISOString();
      endIso = new Date(`${dayValue}T23:59:59`).toISOString();
    } else {
      const dayValue = $('#dayPicker')?.value;
      if (!dayValue) {
        setFormMessage('Wybierz dzień.');
        return;
      }
      const startHour = pad2(parseInt($('#hourStart')?.value ?? '0', 10));
      const endHour = pad2(parseInt($('#hourEnd')?.value ?? '0', 10));
      startIso = new Date(`${dayValue}T${startHour}:00`).toISOString();
      endIso = new Date(`${dayValue}T${endHour}:00`).toISOString();
      if (new Date(endIso) <= new Date(startIso)) {
        setFormMessage('Koniec musi być po początku.');
        return;
      }
    }
    const overlap = await hasOverlap(state.selectedFacility.id, startIso, endIso);
    if (overlap) {
      setFormMessage('Wybrany termin koliduje z istniejącą rezerwacją (wstępna lub potwierdzona). Wybierz inny termin.');
      return;
    }
    updateTitleField();

    const payload = {
      facility_id: state.selectedFacility.id,
      title: form.title.value.trim(),
      event_type_id: form.event_type_id.value || null,
      start_time: startIso,
      end_time: endIso,
      renter_name: form.renter_name.value.trim(),
      renter_email: form.renter_email.value.trim(),
      notes: form.notes.value.trim() || null,
      is_public: $('#is_public')?.checked ?? true,
      status: 'pending',
    };
    const { data, error } = await supabase.from('bookings').insert(payload).select();
    if (error) {
      console.error(error);
      setFormMessage(`Błąd: ${error.message || 'nie udało się utworzyć rezerwacji.'}`);
      return;
    }
    setFormMessage('Wstępna rezerwacja złożona! Opiekun obiektu potwierdzi lub odrzuci.');
    const bookingRow = data && data[0] ? data[0] : null;
    state.bookingsCache.clear();
    await dayView.renderDay();
    if (bookingRow) {
      await showPostBookingActions(bookingRow, { logCancelUrl: true });
    }
  }

  async function handleCancelClick() {
    if (!state.lastBooking) {
      alert('Brak ostatniej rezerwacji.');
      return;
    }
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
      setFormMessage('Rezerwacja anulowana.');
      state.bookingsCache.clear();
      await dayView.renderDay();
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

  async function showPostBookingActions(bookingRow, { logCancelUrl = false } = {}) {
    if (!bookingRow) {
      return;
    }
    state.lastBooking = bookingRow;
    const docsLink = $('#genDocsLink');
    docsLink?.classList.remove('hidden');
    const cancelBtn = $('#cancelThisBooking');
    cancelBtn?.classList.remove('hidden');
    const mount = $('#docGen');
    if (mount) {
      await docGenerator.showTemplateSelectorLive(bookingRow, mount);
    }
    if (logCancelUrl && bookingRow.cancel_token) {
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
    const alreadySelected = state.selectedFacility && String(state.selectedFacility.id) === stringId;
    let facility = state.facilities.find((f) => String(f.id) === stringId);
    if (!facility) {
      const { data: facilityRow, error } = await supabase
        .from('facilities')
        .select('*')
        .eq('id', facilityId)
        .maybeSingle();
      if (error) {
        console.error('Błąd wczytywania świetlicy:', error);
        return false;
      }
      if (!facilityRow) {
        return false;
      }
      facility = facilityRow;
      if (!state.facilities.some((item) => String(item.id) === stringId)) {
        state.facilities.push(facilityRow);
      }
    }
    if (!alreadySelected && facilities?.selectFacility) {
      await facilities.selectFacility(facility.id);
    } else if (!state.selectedFacility) {
      state.selectedFacility = facility;
    }
    return true;
  }

  async function loadBookingFromToken(token, { message } = {}) {
    if (!token) {
      return null;
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
      alert('Nie udało się wczytać świetlicy powiązanej z rezerwacją.');
      return null;
    }
    if (bookingRow.start_time) {
      const startDate = new Date(bookingRow.start_time);
      if (!Number.isNaN(startDate.getTime())) {
        state.currentDate = startDate;
        dayView.setDayPickerFromCurrent();
        await dayView.renderDay();
      }
    }
    await showPostBookingActions(bookingRow, { logCancelUrl: false });
    if (message) {
      setFormMessage(message);
    }
    return bookingRow;
  }

  async function tryLoadBookingFromUrl() {
    const url = new URL(window.location.href);
    const cancelToken = url.searchParams.get('cancel');
    const bookingToken = url.searchParams.get('booking');
    const tokenToLoad = bookingToken || cancelToken;
    if (!tokenToLoad) {
      return;
    }
    const message = cancelToken
      ? 'Wczytano rezerwację z linku. Potwierdź anulowanie, aby kontynuować.'
      : 'Wczytano rezerwację z linku. Możesz ją anulować lub wygenerować dokumenty.';
    const bookingRow = await loadBookingFromToken(tokenToLoad, { message });
    if (!bookingRow) {
      return;
    }
    if (cancelToken) {
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
        setFormMessage('Rezerwacja anulowana.');
        state.bookingsCache.clear();
        if (state.selectedFacility) {
          await dayView.renderDay();
        }
      } else {
        alert('Nie znaleziono lub już anulowana.');
      }
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
    form?.addEventListener('reset', () => {
      window.setTimeout(updateTitleField, 0);
    });

    updateTitleField();
    const cancelBtn = $('#cancelThisBooking');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        void handleCancelClick();
      });
    }
    const docsLink = $('#genDocsLink');
    if (docsLink) {
      docsLink.addEventListener('click', handleDocsLinkClick);
    }
  }

  return { installListeners, tryLoadBookingFromUrl };
}
