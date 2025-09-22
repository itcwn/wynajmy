export function createFacilitiesModule({
  state,
  supabase,
  domUtils,
  formatUtils,
  dayView,
  docGenerator,
  instructionsModal,
  googleMapsKey,
}) {
  const { $ } = domUtils;
  const { escapeHtml } = formatUtils;

  async function loadDictionaries() {
    state.amenities = {};
    const [{ data: amenitiesData }, { data: eventTypes }] = await Promise.all([
      supabase.from('amenities').select('*').order('name'),
      supabase.from('event_types').select('*').order('name'),
    ]);
    (amenitiesData || []).forEach((amenity) => {
      state.amenities[amenity.id] = amenity.name;
    });
    state.eventTypes = eventTypes || [];
    const select = $('#bookingForm select[name="event_type_id"]');
    if (select) {
      select.innerHTML = ['<option value="">(brak)</option>',
        ...state.eventTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`),
      ].join('');
    }
  }

  async function loadFacilities() {
    const { data } = await supabase.from('facilities').select('*').order('name');
    state.facilities = data || [];
    renderFacilityList();
  }

  function renderFacilityList(searchTerm) {
    const querySource =
      typeof searchTerm === 'string' ? searchTerm : $('#q')?.value;
    const query = querySource ? querySource.trim().toLowerCase() : '';
    const list = state.facilities.filter((facility) => {
      const haystack = `${facility.name} ${facility.city} ${facility.postal_code}`.toLowerCase();
      return haystack.includes(query);
    });
    const count = $('#count');
    if (count) {
      count.textContent = String(list.length);
    }
    const container = $('#facilities');
    if (!container) {
      return;
    }
    container.innerHTML = list
      .map(
        (facility) => `
      <li>
        <button data-id="${facility.id}" class="w-full text-left border rounded-xl p-3 hover:bg-gray-50">
          <div class="font-semibold">${escapeHtml(facility.name || '')}${facility.postal_code ? ` (${escapeHtml(facility.postal_code)})` : ''}</div>
          <div class="text-sm text-gray-600">${escapeHtml(facility.city || '')}</div>
        </button>
      </li>`
      )
      .join('');
    container.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (id) {
          void selectFacility(id);
        }
      });
    });
  }

  function loadMapsIfKey() {
    if (!googleMapsKey) {
      return;
    }
    if (document.querySelector('script[data-role="maps"]')) {
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&callback=initMapsApi`;
    script.async = true;
    script.defer = true;
    script.dataset.role = 'maps';
    document.body.appendChild(script);
  }

  function renderMap() {
    const facility = state.selectedFacility;
    if (!state.mapsReady || !facility || !facility.lat || !facility.lng) {
      return;
    }
    const card = $('#mapCard');
    if (card) {
      card.classList.remove('hidden');
    }
    const center = { lat: Number(facility.lat), lng: Number(facility.lng) };
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      return;
    }
    const map = new google.maps.Map(mapContainer, { center, zoom: 13 });
    new google.maps.Marker({ position: center, map, title: facility.name });
  }

  function hideMapCard() {
    const card = $('#mapCard');
    if (card) {
      card.classList.add('hidden');
    }
  }

  function formatPrices(facility) {
    const parts = [];
    if (facility.price_per_hour) {
      parts.push(`Cena/h: ${Number(facility.price_per_hour).toFixed(2)} zł`);
    }
    if (facility.price_per_day) {
      parts.push(`Cena/doba: ${Number(facility.price_per_day).toFixed(2)} zł`);
    }
    return parts.join(' · ');
  }

  async function selectFacility(id) {
    loadMapsIfKey();
    const facility = state.facilities.find((f) => String(f.id) === String(id));
    if (!facility) {
      console.warn('Facility not found', id);
      return;
    }
    state.selectedFacility = facility;
    if (instructionsModal?.updateContent) {
      instructionsModal.updateContent(facility);
    }
    const card = $('#facilityCard');
    const selectors = $('#selectors');
    const booking = $('#booking');
    const calendar = $('#calendar');
    card?.classList.remove('hidden');
    selectors?.classList.remove('hidden');
    booking?.classList.remove('hidden');
    calendar?.classList.remove('hidden');

    const img = $('#facilityImg');
    if (img) {
      img.src = facility.image_url || 'https://picsum.photos/800/400';
    }
    const name = $('#facilityName');
    if (name) {
      const postal = facility.postal_code ? ` (${facility.postal_code})` : '';
      name.textContent = `${facility.name || ''}${postal}`;
    }
    const desc = $('#facilityDesc');
    if (desc) {
      desc.textContent = facility.description || '';
    }
    const address = $('#facilityAddr');
    if (address) {
      const fullAddress = `${facility.address_line1 || ''}${facility.address_line2 ? `, ${facility.address_line2}` : ''}, ${facility.postal_code || ''} ${facility.city || ''}`;
      address.textContent = fullAddress.trim();
    }
    const cap = $('#facilityCap');
    if (cap) {
      cap.textContent = facility.capacity ? `Maksymalna liczba osób: ${facility.capacity}` : '';
    }
    const prices = $('#facilityPrices');
    if (prices) {
      prices.textContent = formatPrices(facility);
    }
    const amenitiesList = $('#facilityAmenities');
    if (amenitiesList) {
      const { data: joins } = await supabase
        .from('facility_amenities')
        .select('amenity_id')
        .eq('facility_id', facility.id);
      amenitiesList.innerHTML = (joins || [])
        .map((join) => `<span class="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">${escapeHtml(state.amenities[join.amenity_id] || '—')}</span>`)
        .join('');
    }

    state.currentDate = new Date();
    state.bookingsCache.clear();
    dayView.setDayPickerFromCurrent();
    dayView.initHourSliderDefaults();
    await dayView.renderDay();
    if (docGenerator?.loadTemplatesForFacility) {
      await docGenerator.loadTemplatesForFacility(facility.id);
    }
    if (facility.lat && facility.lng) {
      renderMap();
    } else {
      hideMapCard();
    }
  }

  function initMapsApi() {
    state.mapsReady = true;
    renderMap();
  }

  const module = {
    initMapsApi,
    loadDictionaries,
    loadFacilities,
    loadMapsIfKey,
    renderFacilityList,
    renderMap,
    selectFacility,
  };

  state.facilitiesModule = module;

  return module;
}
