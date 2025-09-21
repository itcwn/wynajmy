export function createBookingForm({ state, supabase, domUtils, formatUtils, dayView, docGenerator }) {
  const { $ } = domUtils;
  const { pad2 } = formatUtils;
  let listenersAttached = false;

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
    const msg = $('#formMsg');
    if (msg) {
      msg.textContent = 'Trwa zapisywanie...';
    }
    let startIso;
    let endIso;
    if (state.mode === 'day') {
      const dayValue = form.day_only.value;
      if (!dayValue) {
        if (msg) msg.textContent = 'Wybierz dzień.';
        return;
      }
      startIso = new Date(`${dayValue}T00:00`).toISOString();
      endIso = new Date(`${dayValue}T23:59:59`).toISOString();
    } else {
      const dayValue = $('#dayPicker')?.value;
      if (!dayValue) {
        if (msg) msg.textContent = 'Wybierz dzień.';
        return;
      }
      const startHour = pad2(parseInt($('#hourStart')?.value ?? '0', 10));
      const endHour = pad2(parseInt($('#hourEnd')?.value ?? '0', 10));
      startIso = new Date(`${dayValue}T${startHour}:00`).toISOString();
      endIso = new Date(`${dayValue}T${endHour}:00`).toISOString();
      if (new Date(endIso) <= new Date(startIso)) {
        if (msg) msg.textContent = 'Koniec musi być po początku.';
        return;
      }
    }
    const overlap = await hasOverlap(state.selectedFacility.id, startIso, endIso);
    if (overlap) {
      if (msg) msg.textContent = 'Wybrany termin koliduje z istniejącą rezerwacją (wstępna lub potwierdzona). Wybierz inny termin.';
      return;
    }
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
      if (msg) msg.textContent = `Błąd: ${error.message || 'nie udało się utworzyć rezerwacji.'}`;
      return;
    }
    if (msg) {
      msg.textContent = 'Wstępna rezerwacja złożona! Opiekun obiektu potwierdzi lub odrzuci.';
    }
    const bookingRow = data && data[0] ? data[0] : null;
    state.lastBooking = bookingRow;
    state.bookingsCache.clear();
    await dayView.renderDay();
    const docsLink = $('#genDocsLink');
    docsLink?.classList.remove('hidden');
    const cancelBtn = $('#cancelThisBooking');
    cancelBtn?.classList.remove('hidden');
    if (bookingRow) {
      const mount = $('#docGen');
      await docGenerator.showTemplateSelectorLive(bookingRow, mount);
      const cancelUrl = new URL(window.location.href);
      cancelUrl.searchParams.set('cancel', bookingRow.cancel_token);
      console.log('Cancel URL (do e-maila):', cancelUrl.toString());
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

  async function tryCancelFromUrl() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('cancel');
    if (!token) {
      return;
    }
    if (!confirm('Wykryto link anulowania rezerwacji. Czy chcesz kontynuować?')) {
      return;
    }
    const { data, error } = await supabase.rpc('cancel_booking', { p_token: token });
    if (error) {
      alert(`Błąd anulowania: ${error.message || ''}`);
      return;
    }
    if (data) {
      alert('Rezerwacja anulowana.');
      state.bookingsCache.clear();
      if (state.selectedFacility) {
        await dayView.renderDay();
      }
    } else {
      alert('Nie znaleziono lub już anulowana.');
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

  return { installListeners, tryCancelFromUrl };
}
