export function createGalleryModal({ state, domUtils, formatUtils }) {
  const { $ } = domUtils;
  const { escapeHtml } = formatUtils;
  let listenersAttached = false;

  function getModal() {
    return $('#galleryModal');
  }

  function isOpen() {
    const modal = getModal();
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  function clampIndex(index) {
    const images = state.galleryImages || [];
    if (!images.length) {
      return 0;
    }
    const numeric = Number(index);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.min(Math.max(numeric, 0), images.length - 1);
  }

  function renderModal() {
    const modal = getModal();
    if (!modal) {
      return;
    }
    const images = state.galleryImages || [];
    const total = images.length;
    const imageEl = $('#galleryModalImage');
    const counterEl = $('#galleryModalCounter');
    const titleEl = $('#galleryModalTitle');
    const emptyEl = $('#galleryModalEmpty');
    const prevBtn = $('#galleryPrev');
    const nextBtn = $('#galleryNext');
    const thumbsContainer = $('#galleryModalThumbs');

    const facilityName = state.galleryFacilityName || state.selectedFacility?.name || '';
    if (titleEl) {
      titleEl.textContent = facilityName ? `Galeria — ${facilityName}` : 'Galeria zdjęć';
    }

    if (!total) {
      if (imageEl) {
        imageEl.src = '';
        imageEl.classList.add('hidden');
        imageEl.removeAttribute('data-index');
      }
      if (counterEl) {
        counterEl.textContent = 'Brak zdjęć';
      }
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
      }
      prevBtn?.classList.add('hidden');
      nextBtn?.classList.add('hidden');
      if (thumbsContainer) {
        thumbsContainer.innerHTML = '';
        thumbsContainer.classList.add('hidden');
      }
      return;
    }

    const index = clampIndex(state.galleryCurrentIndex);
    state.galleryCurrentIndex = index;
    const activeUrl = images[index];

    if (imageEl) {
      imageEl.src = activeUrl;
      imageEl.dataset.index = String(index);
      imageEl.alt = facilityName
        ? `Zdjęcie ${index + 1} — ${facilityName}`
        : `Zdjęcie ${index + 1}`;
      imageEl.classList.remove('hidden');
    }
    if (emptyEl) {
      emptyEl.classList.add('hidden');
    }
    if (counterEl) {
      counterEl.textContent = `${index + 1} / ${total}`;
    }

    prevBtn?.classList.toggle('hidden', total < 2);
    nextBtn?.classList.toggle('hidden', total < 2);

    if (thumbsContainer) {
      thumbsContainer.innerHTML = images
        .map((url, idx) => {
          const classes = [
            'relative',
            'w-20',
            'h-20',
            'flex-shrink-0',
            'overflow-hidden',
            'rounded-xl',
            'border-2',
            'focus:outline-none',
            'focus:ring-2',
            'focus:ring-amber-300',
          ];
          if (idx === index) {
            classes.push('border-amber-400', 'ring-2', 'ring-amber-300');
          } else {
            classes.push('border-transparent');
          }
          return `
            <button
              type="button"
              class="${classes.join(' ')}"
              data-index="${idx}"
              aria-label="Pokaż zdjęcie ${idx + 1} z ${total}"
            >
              <img
                src="${escapeHtml(url)}"
                alt="Miniatura ${idx + 1}"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          `;
        })
        .join('');
      thumbsContainer.classList.toggle('hidden', total <= 1);
    }
  }

  function notifyIndexChange(index) {
    document.dispatchEvent(
      new CustomEvent('gallery:index-changed', {
        detail: { index },
      })
    );
  }

  function close() {
    const modal = getModal();
    if (!modal) {
      return;
    }
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function open(startIndex = 0) {
    if (!state.galleryImages?.length) {
      return;
    }
    const modal = getModal();
    if (!modal) {
      return;
    }
    state.galleryCurrentIndex = clampIndex(startIndex);
    renderModal();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function showRelative(step) {
    const images = state.galleryImages || [];
    if (!images.length) {
      return;
    }
    const total = images.length;
    const nextIndex = (clampIndex(state.galleryCurrentIndex) + step + total) % total;
    state.galleryCurrentIndex = nextIndex;
    renderModal();
    notifyIndexChange(nextIndex);
  }

  function selectIndexFromModal(index) {
    if (!state.galleryImages?.length) {
      return;
    }
    const safeIndex = clampIndex(index);
    state.galleryCurrentIndex = safeIndex;
    renderModal();
    notifyIndexChange(safeIndex);
  }

  function handleKeyDown(event) {
    if (!isOpen()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showRelative(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showRelative(1);
    }
  }

  function attachListeners() {
    if (listenersAttached) {
      return;
    }
    listenersAttached = true;

    const closeBtn = $('#closeGalleryModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        close();
      });
    }

    const modal = getModal();
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target?.dataset.role === 'gallery-overlay') {
          close();
        }
      });
    }

    const prevBtn = $('#galleryPrev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        showRelative(-1);
      });
    }

    const nextBtn = $('#galleryNext');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        showRelative(1);
      });
    }

    const thumbsContainer = $('#galleryModalThumbs');
    if (thumbsContainer) {
      thumbsContainer.addEventListener('click', (event) => {
        const target = event.target.closest('button[data-index]');
        if (!target) {
          return;
        }
        const index = Number(target.dataset.index);
        if (Number.isFinite(index)) {
          selectIndexFromModal(index);
        }
      });
    }

    document.addEventListener('keydown', handleKeyDown);
  }

  function setImages(images, facilityName = '') {
    state.galleryImages = Array.isArray(images) ? images : [];
    state.galleryFacilityName = facilityName;
    state.galleryCurrentIndex = 0;
    renderModal();
  }

  function update(index = state.galleryCurrentIndex) {
    state.galleryCurrentIndex = clampIndex(index);
    if (isOpen()) {
      renderModal();
    }
  }

  return {
    attachListeners,
    close,
    open,
    setImages,
    update,
  };
}
