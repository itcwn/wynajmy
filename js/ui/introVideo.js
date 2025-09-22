const STORAGE_KEY = 'introVideoLastSeen';
const DEFAULT_VIDEO_PATH = './assets/intro.mp4';

const pad2 = (value) => String(value).padStart(2, '0');

const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const safeGetStorage = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn('Nie udało się odczytać informacji o intro wideo z localStorage.', error);
    return null;
  }
};

const safeSetStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn('Nie udało się zapisać informacji o intro wideo w localStorage.', error);
  }
};

const resolveVideoSrc = (explicitSrc) => {
  if (explicitSrc && explicitSrc.trim()) {
    return explicitSrc.trim();
  }

  const dataSrc = document.body?.dataset?.introVideoSrc;
  if (dataSrc && dataSrc.trim()) {
    return dataSrc.trim();
  }

  return DEFAULT_VIDEO_PATH;
};

export function createIntroVideoModal(options = {}) {
  const {
    storageKey = STORAGE_KEY,
    videoSrc: configuredVideoSrc,
  } = options;

  let overlay;
  let dialog;
  let frame;
  let mainVideo;
  let blurVideo;
  let closeButton;

  const isOverlayVisible = () => overlay && !overlay.classList.contains('hidden');

  const hideOverlay = () => {
    if (!overlay) {
      return;
    }

    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('intro-video-open');

    if (mainVideo) {
      mainVideo.pause();
      mainVideo.currentTime = 0;
    }

    if (blurVideo) {
      blurVideo.pause();
      blurVideo.currentTime = 0;
    }
  };

  const ensureOverlay = (videoSrc) => {
    if (overlay) {
      if (mainVideo && mainVideo.getAttribute('src') !== videoSrc) {
        mainVideo.setAttribute('src', videoSrc);
        mainVideo.load();
      }

      if (blurVideo && blurVideo.getAttribute('src') !== videoSrc) {
        blurVideo.setAttribute('src', videoSrc);
        blurVideo.load();
      }

      return;
    }

    overlay = document.createElement('div');
    overlay.id = 'intro-video-overlay';
    overlay.className = 'intro-video-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');

    closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'intro-video-close';
    closeButton.setAttribute('aria-label', 'Zamknij wideo powitalne');
    closeButton.innerHTML = '&times;';
    overlay.appendChild(closeButton);

    dialog = document.createElement('div');
    dialog.className = 'intro-video-dialog';
    overlay.appendChild(dialog);

    blurVideo = document.createElement('video');
    blurVideo.className = 'intro-video-blur';
    blurVideo.setAttribute('aria-hidden', 'true');
    blurVideo.muted = true;
    blurVideo.loop = true;
    blurVideo.playsInline = true;
    blurVideo.preload = 'auto';
    blurVideo.setAttribute('src', videoSrc);
    dialog.appendChild(blurVideo);

    frame = document.createElement('div');
    frame.className = 'intro-video-frame';
    dialog.appendChild(frame);

    mainVideo = document.createElement('video');
    mainVideo.className = 'intro-video-main';
    mainVideo.controls = true;
    mainVideo.playsInline = true;
    mainVideo.preload = 'auto';
    mainVideo.autoplay = true;
    mainVideo.muted = true;
    mainVideo.setAttribute('src', videoSrc);
    frame.appendChild(mainVideo);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        hideOverlay();
      }
    });

    dialog.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    closeButton.addEventListener('click', hideOverlay);

    mainVideo.addEventListener('ended', hideOverlay);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOverlayVisible()) {
        hideOverlay();
      }
    });

    document.body.appendChild(overlay);
  };

  const showOverlay = (videoSrc, dateKey) => {
    ensureOverlay(videoSrc);

    overlay.classList.remove('hidden');
    overlay.removeAttribute('aria-hidden');
    document.body.classList.add('intro-video-open');

    requestAnimationFrame(() => {
      if (closeButton) {
        closeButton.focus({ preventScroll: true });
      }
    });

    if (blurVideo) {
      blurVideo.currentTime = 0;
      const playBlurPromise = blurVideo.play();
      if (playBlurPromise) {
        playBlurPromise.catch(() => {
          /* Ignorujemy błędy autoplay np. na urządzeniach mobilnych */
        });
      }
    }

    if (mainVideo) {
      mainVideo.currentTime = 0;
      const playPromise = mainVideo.play();
      if (playPromise) {
        playPromise.catch(() => {
          /* Ignorujemy błędy autoplay wymagające interakcji użytkownika */
        });
      }
    }

    if (dateKey) {
      safeSetStorage(storageKey, dateKey);
    }
  };

  const showIfNeeded = ({ force = false } = {}) => {
    const todayKey = getTodayKey();
    const videoSrc = resolveVideoSrc(configuredVideoSrc);

    if (!videoSrc) {
      return;
    }

    if (!force) {
      const lastSeen = safeGetStorage(storageKey);
      if (lastSeen === todayKey) {
        return;
      }
    }

    showOverlay(videoSrc, todayKey);
  };

  return {
    showIfNeeded,
    hide: hideOverlay,
    forceShow: () => showIfNeeded({ force: true }),
  };
}
