import { refreshLayoutAlignment } from '../ui/layout.js';
import {
  getTenantId,
  setTenantId,
  inferTenantIdFromFacility,
  resolveTenantIdForFacility,
} from '../state/tenant.js';

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
  const publicPagination = state.publicFacilitiesPagination ?? {
    page: 1,
    pageSize: 10,
    totalItems: 0,
  };
  state.publicFacilitiesPagination = publicPagination;
  const facilityAmenitiesCache = state.facilityAmenitiesCache ?? new Map();
  state.facilityAmenitiesCache = facilityAmenitiesCache;
  const PLACEHOLDER_IMAGE = 'https://picsum.photos/800/400';
  let galleryListenersAttached = false;
  let currentSearchTerm = '';
  let searchListenerAttached = false;
  let searchClearListenerAttached = false;
  let reservationCtaListenerAttached = false;
  let paginationListenerAttached = false;

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
    const tenantId = getTenantId();
    if (!tenantId) {
      facilityAmenitiesCache.clear();
      state.eventTypes = [];
      const select = $('#bookingForm select[name="event_type_id"]');
      if (select) {
        select.innerHTML = '<option value="">(brak)</option>';
      }
      return;
    }
    facilityAmenitiesCache.clear();
    const eventTypes = await runFirstSuccessfulQuery([
      () => supabase.from('public_event_types').select('*').order('order_index'),
      () => supabase.from('event_types').select('*').eq('is_active', true).order('order_index'),
    ], { allowEmpty: false });
    state.eventTypes = eventTypes || [];
    const select = $('#bookingForm select[name="event_type_id"]');
    if (select) {
      select.innerHTML = ['<option value="">(brak)</option>',
        ...state.eventTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`),
      ].join('');
    }
  }

  async function loadAmenitiesForFacility(facilityId) {
    if (!facilityId) {
      return [];
    }
    if (facilityAmenitiesCache.has(facilityId)) {
      return facilityAmenitiesCache.get(facilityId);
    }
    const amenitiesData = await runFirstSuccessfulQuery([
      () => supabase
        .from('public_amenities')
        .select('facility_id, id, name, description, order_index')
        .eq('facility_id', facilityId)
        .order('order_index'),
      () => supabase
        .from('facility_amenities')
        .select('amenity_id, amenity:amenities(id, name, description, order_index)')
        .eq('facility_id', facilityId),
    ]);
    const normalized = (amenitiesData || [])
      .map((row) => {
        const amenity = row.amenity || {};
        const amenityId = row.id ?? row.amenity_id ?? amenity.id;
        return {
          amenity_id: amenityId,
          name: row.name ?? amenity.name ?? '',
          description: row.description ?? amenity.description ?? '',
          order_index: row.order_index ?? amenity.order_index ?? 0,
        };
      })
      .filter((item) => item.amenity_id);
    normalized.sort((a, b) => {
      const normalizedOrderA = Number(a.order_index);
      const normalizedOrderB = Number(b.order_index);
      const orderA = Number.isFinite(normalizedOrderA) ? normalizedOrderA : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(normalizedOrderB) ? normalizedOrderB : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB, 'pl');
    });
    facilityAmenitiesCache.set(facilityId, normalized);
    return normalized;
  }

  async function loadFacilities() {
    const tenantId = getTenantId();
    const facilitiesData = await runFirstSuccessfulQuery(
      tenantId
        ? [
            () => supabase.from('public_facilities').select('*').order('name'),
            () => supabase.from('facilities').select('*').order('name'),
          ]
        : [
            () => supabase.rpc('list_public_facilities'),
          ],
      { allowEmpty: false },
    );
    const normalized = Array.isArray(facilitiesData) ? facilitiesData : [];
    if (!tenantId && normalized.length > 1) {
      normalized.sort((a, b) => {
        const nameA = (a?.name || '').toLowerCase();
        const nameB = (b?.name || '').toLowerCase();
        return nameA.localeCompare(nameB, 'pl');
      });
    }
    state.facilities = normalized;
    publicPagination.totalItems = normalized.length;
    publicPagination.page = 1;
    renderFacilityList();
  }

  function renderFacilityList(searchTerm) {
    if (typeof searchTerm === 'string') {
      currentSearchTerm = searchTerm;
    }
    const tenantId = getTenantId();
    if (!tenantId && typeof searchTerm === 'string') {
      publicPagination.page = 1;
    }
    const normalizedQuery = currentSearchTerm.trim().toLowerCase();
    const filtered = state.facilities.filter((facility) => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${facility.name} ${facility.city} ${facility.postal_code}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
    const count = $('#count');
    if (count) {
      count.textContent = String(filtered.length);
    }
    let itemsToRender = filtered;
    if (!tenantId) {
      const totalItems = filtered.length;
      publicPagination.totalItems = totalItems;
      if (totalItems === 0) {
        publicPagination.page = 1;
      }
      const totalPages = totalItems > 0
        ? Math.max(1, Math.ceil(totalItems / publicPagination.pageSize))
        : 1;
      if (totalItems > 0 && publicPagination.page > totalPages) {
        publicPagination.page = totalPages;
      }
      const startIndex = totalItems === 0 ? 0 : (publicPagination.page - 1) * publicPagination.pageSize;
      const endExclusive = totalItems === 0
        ? 0
        : Math.min(totalItems, startIndex + publicPagination.pageSize);
      itemsToRender = totalItems === 0 ? [] : filtered.slice(startIndex, endExclusive);
      renderPaginationControls({
        visible: totalItems > 0,
        page: publicPagination.page,
        totalPages,
        totalItems,
        startIndex: totalItems === 0 ? 0 : startIndex + 1,
        endIndex: totalItems === 0 ? 0 : endExclusive,
      });
    } else {
      publicPagination.page = 1;
      publicPagination.totalItems = filtered.length;
      renderPaginationControls({ visible: false });
    }
    const container = $('#facilities');
    if (!container) {
      return;
    }
    container.innerHTML = itemsToRender.map((facility) => renderFacilityTile(facility)).join('');
    container.querySelectorAll('[data-facility-card]').forEach((card) => {
      const id = card.dataset.facilityCard;
      if (!id) {
        return;
      }
      card.addEventListener('click', (event) => {
        event.preventDefault();
        void handleFacilitySelection(id, { focusReservation: false });
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          void handleFacilitySelection(id, { focusReservation: false });
        }
      });
    });
    ensureSearchControls();
    ensurePaginationListeners();
    ensureReservationCtaListener();
    markSelectedTile();
    updateReservationCta();
    refreshLayoutAlignment();
  }

  function renderFacilityTile(facility) {
    const imageSrc = escapeHtml(parseImageUrls(facility)[0] || PLACEHOLDER_IMAGE);
    const alt = escapeHtml(
      facility.name ? `Zdjęcie obiektu ${facility.name}` : 'Zdjęcie obiektu',
    );
    const location = formatFacilityLocation(facility);
    const badges = [];
    if (facility.capacity) {
      badges.push(
        `<span class="facility-tile__badge facility-tile__badge--neutral">👥 ${escapeHtml(String(facility.capacity))} osób</span>`,
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
            `<span class="facility-tile__badge facility-tile__badge--accent">${escapeHtml(part)}</span>`,
          );
        });
    }
    const badgesHtml = badges.join('');
    const isSelected = state.selectedFacility && String(state.selectedFacility.id) === String(facility.id);
    const selectedClass = isSelected ? ' facility-tile--selected' : '';
    return `
      <article class="facility-tile${selectedClass}" data-facility-card="${facility.id}" role="button" tabindex="0" aria-label="${escapeHtml(facility.name || 'Obiekt')}">
        <div class="facility-tile__media">
          <img
            src="${imageSrc}"
            alt="${alt}"
            loading="lazy"
          />
        </div>
        <div class="facility-tile__body">
          <h3 class="facility-tile__title">${escapeHtml(facility.name || '')}</h3>
          ${location ? `<p class="facility-tile__location"><span aria-hidden="true">📍</span> ${location}</p>` : ''}
          ${badgesHtml ? `<div class="facility-tile__badges">${badgesHtml}</div>` : ''}
        </div>
      </article>
    `;
  }

  function ensureSearchControls() {
    const input = $('#facilitySearch');
    if (input) {
      if (!searchListenerAttached) {
        input.addEventListener('input', (event) => {
          currentSearchTerm = event.target.value || '';
          renderFacilityList(currentSearchTerm);
        });
        searchListenerAttached = true;
      }
      if (input.value !== currentSearchTerm) {
        input.value = currentSearchTerm;
      }
    }
    const clearBtn = $('#facilitySearchClear');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !currentSearchTerm.trim());
      if (!searchClearListenerAttached) {
        clearBtn.addEventListener('click', (event) => {
          event.preventDefault();
          currentSearchTerm = '';
          renderFacilityList('');
          input?.focus();
        });
        searchClearListenerAttached = true;
      }
    }
  }

  function ensureReservationCtaListener() {
    const button = $('#openReservationCta');
    if (!button) {
      return;
    }
    if (!reservationCtaListenerAttached) {
      button.addEventListener('click', (event) => {
        if (!state.selectedFacility) {
          event.preventDefault();
          button.blur();
          return;
        }
        event.preventDefault();
        scrollToReservationSection();
      });
      reservationCtaListenerAttached = true;
    }
  }

  function ensurePaginationListeners() {
    if (paginationListenerAttached) {
      return;
    }
    const container = $('#publicFacilitiesPagination');
    if (!container) {
      return;
    }
    container.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-pagination-action]');
      if (!trigger) {
        return;
      }
      event.preventDefault();
      const action = trigger.dataset.paginationAction;
      if (action === 'prev') {
        goToPaginationPage(publicPagination.page - 1);
      } else if (action === 'next') {
        goToPaginationPage(publicPagination.page + 1);
      }
    });
    paginationListenerAttached = true;
  }

  function goToPaginationPage(page) {
    const tenantId = getTenantId();
    if (tenantId) {
      return;
    }
    const totalItems = publicPagination.totalItems;
    if (totalItems <= 0) {
      return;
    }
    const totalPages = Math.max(1, Math.ceil(totalItems / publicPagination.pageSize));
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    if (nextPage === publicPagination.page) {
      return;
    }
    publicPagination.page = nextPage;
    renderFacilityList();
    const facilitiesCard = document.getElementById('facilityBrowser');
    if (facilitiesCard) {
      facilitiesCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderPaginationControls(details) {
    const container = $('#publicFacilitiesPagination');
    if (!container) {
      return;
    }
    if (!details || !details.visible) {
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    const rangeLabel = container.querySelector('[data-pagination-range]');
    if (rangeLabel) {
      const { startIndex, endIndex, totalItems } = details;
      rangeLabel.textContent = `${startIndex}–${endIndex} z ${totalItems} obiektów`;
    }
    const pageLabel = container.querySelector('[data-pagination-page]');
    if (pageLabel) {
      pageLabel.textContent = String(details.page);
    }
    const pagesLabel = container.querySelector('[data-pagination-pages]');
    if (pagesLabel) {
      pagesLabel.textContent = String(details.totalPages);
    }
    const prevBtn = container.querySelector('[data-pagination-action="prev"]');
    const nextBtn = container.querySelector('[data-pagination-action="next"]');
    const isFirstPage = details.page <= 1;
    const isLastPage = details.page >= details.totalPages;
    if (prevBtn) {
      prevBtn.disabled = isFirstPage;
      prevBtn.setAttribute('aria-disabled', isFirstPage ? 'true' : 'false');
    }
    if (nextBtn) {
      nextBtn.disabled = isLastPage;
      nextBtn.setAttribute('aria-disabled', isLastPage ? 'true' : 'false');
    }
  }

  function markSelectedTile() {
    const container = $('#facilities');
    if (!container) {
      return;
    }
    const selectedId = state.selectedFacility ? String(state.selectedFacility.id) : '';
    container.querySelectorAll('[data-facility-card]').forEach((card) => {
      card.classList.toggle('facility-tile--selected', selectedId && card.dataset.facilityCard === selectedId);
    });
  }

  function updateReservationCta() {
    const button = $('#openReservationCta');
    if (!button) {
      return;
    }
    const hasSelection = Boolean(state.selectedFacility);
    button.disabled = !hasSelection;
    button.setAttribute('aria-disabled', hasSelection ? 'false' : 'true');
    if (hasSelection) {
      const name = state.selectedFacility?.name ? `: ${state.selectedFacility.name}` : '';
      button.textContent = `Przejdź do formularza rezerwacji${name}`;
    } else {
      button.textContent = 'Wybierz obiekt, aby przejść do rezerwacji';
    }
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
        mainImg.alt = 'Zdjęcie obiektu';
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

  function scrollToReservationSection() {
    const section = document.getElementById('reservationSection');
    if (!section) {
      return;
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleFacilitySelection(id, { focusReservation = false } = {}) {
    await selectFacility(id);
    if (focusReservation) {
      scrollToReservationSection();
    }
  }

  async function ensureTenantForFacilitySelection(facility) {
    if (!facility) {
      return { tenantId: null, changed: false };
    }
    const currentTenant = getTenantId();
    const facilityTenant = inferTenantIdFromFacility(facility);
    if (facilityTenant && facilityTenant !== facility.tenant_id) {
      facility.tenant_id = facilityTenant;
    }
    if (facilityTenant && facilityTenant !== currentTenant) {
      setTenantId(facilityTenant);
      return { tenantId: facilityTenant, changed: true };
    }
    if (!facilityTenant) {
      const resolved = await resolveTenantIdForFacility({
        supabase,
        facilityId: facility.id,
      });
      if (resolved) {
        facility.tenant_id = resolved;
        if (resolved !== currentTenant) {
          setTenantId(resolved);
          return { tenantId: resolved, changed: true };
        }
        return { tenantId: resolved, changed: false };
      }
    }
    if (!currentTenant && facilityTenant) {
      setTenantId(facilityTenant);
      return { tenantId: facilityTenant, changed: true };
    }
    return { tenantId: facilityTenant || currentTenant || null, changed: false };
  }

  async function selectFacility(id) {
    loadMapsIfKey();
    const facility = state.facilities.find((f) => String(f.id) === String(id));
    if (!facility) {
      console.warn('Facility not found', id);
      return;
    }
    const previousTenant = getTenantId();
    const tenantInfo = await ensureTenantForFacilitySelection(facility);
    let workingFacility = facility;
    if (tenantInfo.changed) {
      state.isTenantReloading = true;
      try {
        await loadDictionaries();
        await loadFacilities();
      } finally {
        state.isTenantReloading = false;
      }
      const updatedFacility = state.facilities.find((f) => String(f.id) === String(id));
      if (!updatedFacility) {
        console.warn('Nie udało się ponownie odnaleźć obiektu po zmianie najemcy.', id);
        return;
      }
      workingFacility = updatedFacility;
      if (tenantInfo.tenantId) {
        workingFacility.tenant_id = tenantInfo.tenantId;
      }
    } else if (tenantInfo.tenantId && tenantInfo.tenantId !== previousTenant) {
      facility.tenant_id = tenantInfo.tenantId;
    }
    state.selectedFacility = workingFacility;
    markSelectedTile();
    updateReservationCta();
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
      const amenities = await loadAmenitiesForFacility(facility.id);
      amenitiesList.innerHTML = amenities
        .map((amenity) => {
          const label = escapeHtml(amenity.name || '—');
          const description = (amenity.description || '').trim();
          const title = description ? ` title="${escapeHtml(description)}"` : '';
          return `<span class="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1"${title}>${label}</span>`;
        })
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
