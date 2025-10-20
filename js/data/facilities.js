import { refreshLayoutAlignment } from '../ui/layout.js';

export function createFacilitiesModule({
  state,
  supabase,
  domUtils,
  formatUtils,
  dayView,
  docGenerator,
  instructionsModal,
  galleryModal,
  googleMapsKey,
  bookingWizard,
  availabilityPreview,
}) {
  const { $ } = domUtils;
  const { escapeHtml } = formatUtils;
  const PLACEHOLDER_IMAGE = 'https://picsum.photos/800/400';
  let galleryListenersAttached = false;

  function applyViewModeToDom(view) {
    const normalized = view === 'tiles' ? 'tiles' : 'list';
    const container = $('#facilities');
    if (container) {
      container.dataset.viewMode = normalized;
      container.classList.toggle('facility-list--tiles', normalized === 'tiles');
      container.classList.toggle('facility-list--list', normalized !== 'tiles');
    }
    const switcher = document.querySelector('[data-role="facility-view-switch"]');
    if (switcher) {
      switcher.dataset.viewActive = normalized;
      switcher.querySelectorAll('button[data-view-toggle]').forEach((button) => {
        const isActive = button.dataset.viewToggle === normalized;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    }
  }

  function logQueryError(scope, error) {
    if (!error) {
      return;
    }
    const message = error?.message || error?.hint || String(error);
    console.warn(`${scope}: ${message}`);
  }

  async function runFirstSuccessfulQuery(builders, { allowEmpty = true } = {}) {
    for (const build of builders) {
      if (typeof build !== 'function') {
        continue;
      }
      try {
        const { data, error } = await build();
        if (error) {
          logQueryError('Supabase query warning', error);
          continue;
        }
        if (Array.isArray(data)) {
          if (data.length > 0) {
            return data;
          }
          if (allowEmpty) {
            return data;
          }
        } else if (data) {
          return data;
        }
      } catch (error) {
        logQueryError('Supabase query exception', error);
      }
    }
    return [];
  }

  async function loadDictionaries() {
    state.amenities = {};
    const [amenitiesData, eventTypes] = await Promise.all([
      runFirstSuccessfulQuery([
        () => supabase.from('public_amenities').select('*').order('order_index'),
        () => supabase.from('amenities').select('*').order('order_index'),
      ], { allowEmpty: false }),
      runFirstSuccessfulQuery([
        () => supabase.from('public_event_types').select('*').order('order_index'),
        () => supabase.from('event_types').select('*').eq('is_active', true).order('order_index'),
      ], { allowEmpty: false }),
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
    const facilitiesData = await runFirstSuccessfulQuery([
      () => supabase.from('public_facilities').select('*').order('name'),
      () => supabase.from('facilities').select('*').order('name'),
    ], { allowEmpty: false });
    state.facilities = facilitiesData || [];
    renderFacilityList();
  }

  function renderFacilityList(searchTerm) {
    const view = state.facilitiesView === 'tiles' ? 'tiles' : 'list';
    applyViewModeToDom(view);
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
    const isTileView = view === 'tiles';
    container.innerHTML = list
      .map((facility) => (isTileView ? renderFacilityTile(facility) : renderFacilityRow(facility)))
      .join('');
    container.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (id) {
          void selectFacility(id);
        }
      });
    });
    refreshLayoutAlignment();
  }

  function renderFacilityRow(facility) {
    const imageSrc = escapeHtml(parseImageUrls(facility)[0] || PLACEHOLDER_IMAGE);
    const alt = escapeHtml(
      facility.name ? `Zdjęcie obiektu ${facility.name}` : 'Zdjęcie świetlicy',
    );
    return `
      <button data-id="${facility.id}" class="w-full text-left rounded-xl border border-transparent px-4 py-3 transition hover:border-[#003580] hover:bg-[#003580]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003580]/40">
        <div class="flex items-center gap-3">
          <div class="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
            <img
              src="${imageSrc}"
              alt="${alt}"
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-slate-900">${escapeHtml(facility.name || '')}</div>
            <div class="text-sm text-slate-500">${formatFacilityLocation(facility)}</div>
          </div>
        </div>
      </button>
    `;
  }

  function renderFacilityTile(facility) {
    const imageSrc = escapeHtml(parseImageUrls(facility)[0] || PLACEHOLDER_IMAGE);
    const alt = escapeHtml(
      facility.name ? `Zdjęcie obiektu ${facility.name}` : 'Zdjęcie świetlicy',
    );
    const location = formatFacilityLocation(facility);
    const badges = [];
    if (facility.capacity) {
      badges.push(
        `<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">👥 ${escapeHtml(String(facility.capacity))} osób</span>`,
      );
    }
    const priceInfo = formatPrices(facility);
    if (priceInfo) {
      priceInfo
        .split('·')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          badges.push(
            `<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">${escapeHtml(part)}</span>`,
          );
        });
    }
    const badgesHtml = badges.join('');
    return `
      <button data-id="${facility.id}" class="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#003580] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#003580]/40">
        <div class="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <img
            src="${imageSrc}"
            alt="${alt}"
            class="h-full w-full object-cover transition duration-300 ease-out group-hover:scale-[1.03]"
            loading="lazy"
          />
        </div>
        <div class="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3">
          <div class="text-base font-semibold text-slate-900">${escapeHtml(facility.name || '')}</div>
          ${location
            ? `<p class="flex items-center gap-2 text-sm text-slate-500"><span aria-hidden="true">📍</span><span>${location}</span></p>`
            : ''}
          ${badgesHtml ? `<div class="flex flex-wrap gap-2">${badgesHtml}</div>` : ''}
        </div>
      </button>
    `;
  }

  function formatFacilityLocation(facility) {
    const parts = [facility.city, facility.postal_code]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .map((value) => escapeHtml(value));
    return parts.join(' ');
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

  function getRawImageSource(facility) {
    if (!facility) {
      return '';
    }
    if (Array.isArray(facility.image_urls)) {
      return facility.image_urls
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(';');
    }
    if (typeof facility.image_urls === 'string' && facility.image_urls.trim()) {
      return facility.image_urls;
    }
    if (Array.isArray(facility.image_url)) {
      return facility.image_url
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(';');
    }
    if (typeof facility.image_url === 'string') {
      return facility.image_url;
    }
    return '';
  }

  function parseImageUrls(facility) {
    if (!facility) {
      return [];
    }
    if (Array.isArray(facility.image_urls)) {
      return facility.image_urls.map((url) => String(url ?? '').trim()).filter(Boolean);
    }
    if (Array.isArray(facility.image_url)) {
      return facility.image_url.map((url) => String(url ?? '').trim()).filter(Boolean);
    }
    const source = typeof facility.image_urls === 'string' && facility.image_urls.trim()
      ? facility.image_urls
      : typeof facility.image_url === 'string'
        ? facility.image_url
        : '';
    if (!source) {
      return [];
    }
    return source
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && part.toLowerCase() !== 'null' && part.toLowerCase() !== 'undefined');
  }

  function setMainGalleryImage(index, { skipModalUpdate = false } = {}) {
    const images = state.galleryImages || [];
    if (!images.length) {
      return;
    }
    const numeric = Number(index);
    const safeIndex = Number.isFinite(numeric)
      ? Math.min(Math.max(Math.trunc(numeric), 0), images.length - 1)
      : 0;
    state.galleryCurrentIndex = safeIndex;
    const mainImg = $('#facilityImgMain');
    if (mainImg) {
      mainImg.src = images[safeIndex];
      mainImg.dataset.index = String(safeIndex);
      if (state.selectedFacility?.name) {
        mainImg.alt = `Zdjęcie obiektu ${state.selectedFacility.name}`;
      }
    }
    if (!skipModalUpdate && galleryModal?.update) {
      galleryModal.update(safeIndex);
    }
  }

  function ensureGalleryListeners() {
    if (galleryListenersAttached) {
      return;
    }
    const mainImg = $('#facilityImgMain');
    const openBtn = $('#openGalleryBtn');
    const thumbs = $('#facilityThumbs');
    if (!mainImg || !openBtn) {
      return;
    }
    galleryListenersAttached = true;
    openBtn.addEventListener('click', () => {
      if (!state.galleryImages?.length) {
        return;
      }
      galleryModal?.open?.(state.galleryCurrentIndex || 0);
    });
    mainImg.addEventListener('click', () => {
      if (!state.galleryImages?.length) {
        return;
      }
      galleryModal?.open?.(state.galleryCurrentIndex || 0);
    });
    if (thumbs) {
      thumbs.addEventListener('click', (event) => {
        const target = event.target.closest('button[data-index]');
        if (!target) {
          return;
        }
        const idx = Number(target.dataset.index);
        if (Number.isFinite(idx)) {
          setMainGalleryImage(idx);
        }
      });
    }
    document.addEventListener('gallery:index-changed', (event) => {
      const detailIndex = Number(event.detail?.index);
      if (Number.isFinite(detailIndex)) {
        setMainGalleryImage(detailIndex, { skipModalUpdate: true });
      }
    });
  }

  function updateGalleryPreview(facility) {
    const images = parseImageUrls(facility);
    state.galleryImages = images;
    state.galleryCurrentIndex = images.length ? 0 : 0;
    state.galleryFacilityName = facility?.name || '';

    const mainImg = $('#facilityImgMain');
    if (mainImg) {
      const src = images[0] || PLACEHOLDER_IMAGE;
      mainImg.src = src;
      mainImg.dataset.index = images.length ? '0' : '';
      mainImg.classList.toggle('cursor-zoom-in', images.length > 0);
      if (facility?.name) {
        mainImg.alt = `Zdjęcie obiektu ${facility.name}`;
      } else {
        mainImg.alt = 'Zdjęcie świetlicy';
      }
      const handleImageEvent = () => {
        refreshLayoutAlignment();
      };
      mainImg.addEventListener('load', handleImageEvent, { once: true });
      mainImg.addEventListener('error', handleImageEvent, { once: true });
    }
    refreshLayoutAlignment();

    const openBtn = $('#openGalleryBtn');
    if (openBtn) {
      const hasImages = images.length > 0;
      openBtn.disabled = !hasImages;
      openBtn.setAttribute('aria-disabled', hasImages ? 'false' : 'true');
      openBtn.classList.toggle('opacity-60', !hasImages);
      openBtn.classList.toggle('cursor-not-allowed', !hasImages);
      openBtn.textContent = images.length > 1
        ? `Otwórz galerię (${images.length})`
        : hasImages
          ? 'Zobacz zdjęcie'
          : 'Brak zdjęć';
    }

    ensureGalleryListeners();
    if (galleryModal?.setImages) {
      galleryModal.setImages(images, facility?.name || '');
    }
  }

  function updateGalleryColumnInfo(facility) {
    const infoEl = $('#galleryColumnInfo');
    if (!infoEl) {
      return;
    }
    const raw = getRawImageSource(facility);
    const hasImages = Boolean(raw && raw.trim());
    infoEl.classList.remove('text-red-600');

    if (hasImages) {
      infoEl.textContent = '';
    } else {
      infoEl.textContent = 'Brak zdjęć. Dodaj fotografie w panelu opiekuna, korzystając z przesyłania plików.';
    }
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
    const placeholder = $('#facilityPlaceholder');
    placeholder?.classList.add('hidden');
    const card = $('#facilityCard');
    const selectors = $('#selectors');
    const booking = $('#booking');
    const calendar = $('#calendar');
    card?.classList.remove('hidden');
    selectors?.classList.remove('hidden');
    if (calendar) {
      calendar.classList.toggle('hidden', state.mode !== 'hour');
    }
    if (bookingWizard?.reset) {
      bookingWizard.reset();
    } else {
      booking?.classList.add('hidden');
    }
    refreshLayoutAlignment();

    updateGalleryPreview(facility);
    updateGalleryColumnInfo(facility);
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
    const linksContainer = $('#facilityLinks');
    if (linksContainer) {
      const links = [];
      const priceUrl = typeof facility.price_list_url === 'string' ? facility.price_list_url.trim() : '';
      if (priceUrl) {
        const safeUrl = escapeHtml(priceUrl);
        links.push(
          `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="Otwórz cennik w nowym oknie">📄 Cennik</a>`,
        );
      }
      const rulesUrl = typeof facility.rental_rules_url === 'string' ? facility.rental_rules_url.trim() : '';
      if (rulesUrl) {
        const safeUrl = escapeHtml(rulesUrl);
        links.push(
          `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="Zobacz regulamin wynajmu w nowym oknie">📘 Regulamin wynajmu</a>`,
        );
      }
      linksContainer.innerHTML = links.join('');
      linksContainer.classList.toggle('hidden', links.length === 0);
    }
    const amenitiesList = $('#facilityAmenities');
    if (amenitiesList) {
      const joins = await runFirstSuccessfulQuery([
        () => supabase
          .from('public_facility_amenities')
          .select('amenity_id')
          .eq('facility_id', facility.id),
        () => supabase
          .from('facility_amenities')
          .select('amenity_id')
          .eq('facility_id', facility.id),
      ]);
      amenitiesList.innerHTML = (joins || [])
        .map((join) => `<span class="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">${escapeHtml(state.amenities[join.amenity_id] || '—')}</span>`)
        .join('');
    }

    state.currentDate = new Date();
    state.bookingsCache.clear();
    dayView.setDayPickerFromCurrent();
    dayView.initHourSliderDefaults();
    await dayView.renderDay();
    if (availabilityPreview?.setFacility) {
      availabilityPreview.setFacility(facility);
    }
    if (docGenerator?.loadTemplatesForFacility) {
      await docGenerator.loadTemplatesForFacility(facility.id);
    }
    if (facility.lat && facility.lng) {
      renderMap();
    } else {
      hideMapCard();
    }
    refreshLayoutAlignment();
  }

  function initMapsApi() {
    state.mapsReady = true;
    renderMap();
  }

  function setViewMode(view, { silent = false } = {}) {
    const normalized = view === 'tiles' ? 'tiles' : 'list';
    state.facilitiesView = normalized;
    applyViewModeToDom(normalized);
    if (!silent) {
      renderFacilityList();
    }
    return normalized;
  }

  const module = {
    initMapsApi,
    loadDictionaries,
    loadFacilities,
    loadMapsIfKey,
    renderFacilityList,
    renderMap,
    selectFacility,
    setViewMode,
  };

  state.facilitiesModule = module;

  return module;
}
