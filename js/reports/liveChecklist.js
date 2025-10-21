const DB_NAME = 'sowaChecklistReport';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';

export function initLiveChecklistReport(initialConfig = {}) {
  const supabaseUrl = initialConfig.SUPABASE_URL ?? window.__SUPA?.SUPABASE_URL;
  const supabaseAnonKey = initialConfig.SUPABASE_ANON_KEY ?? window.__SUPA?.SUPABASE_ANON_KEY;

  if (!window.supabase || !window.supabase.createClient) {
    // eslint-disable-next-line no-alert
    alert('Nie wykryto Supabase SDK. Sprawdź konfigurację.');
    return;
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    // eslint-disable-next-line no-alert
    alert('Brak konfiguracji Supabase. Uzupełnij plik supabase-config.js.');
    return;
  }

  const supa = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  const dom = {
    sessionIdDisplay: document.getElementById('sessionIdDisplay'),
    facilitySelect: document.getElementById('reportFacilitySelect'),
    facilityMeta: document.getElementById('reportFacilityMeta'),
    saveStatus: document.getElementById('saveStatus'),
    progressIndicator: document.getElementById('progressIndicator'),
    checklistMessage: document.getElementById('checklistMessage'),
    handoverList: document.getElementById('handoverList'),
    returnList: document.getElementById('returnList'),
    caretakerEmail: document.getElementById('caretakerEmail'),
    bookingReference: document.getElementById('bookingReference'),
    contactName: document.getElementById('contactName'),
    contactPhone: document.getElementById('contactPhone'),
    eventDate: document.getElementById('eventDate'),
    eventStart: document.getElementById('eventStart'),
    eventEnd: document.getElementById('eventEnd'),
    eventNotes: document.getElementById('eventNotes'),
    generalRemarks: document.getElementById('generalRemarks'),
    reportPreview: document.getElementById('reportPreview'),
    copyReport: document.getElementById('copyReport'),
    downloadReport: document.getElementById('downloadReport'),
    sendEmail: document.getElementById('sendEmail'),
    reportActionMessage: document.getElementById('reportActionMessage'),
  };

  const state = {
    sessionId: '',
    sessionData: null,
    facilities: [],
    selectedFacility: null,
    checklistItems: [],
    attachmentUrlMap: new Map(),
    saveTimeoutId: null,
  };

  let dbPromise = null;

  function setStatus(element, text, tone = 'info') {
    if (!element) {
      return;
    }
    element.textContent = text || '';
    element.classList.remove('text-red-600', 'text-emerald-600', 'text-gray-500');
    if (!text) {
      return;
    }
    if (tone === 'error') {
      element.classList.add('text-red-600');
    } else if (tone === 'success') {
      element.classList.add('text-emerald-600');
    } else {
      element.classList.add('text-gray-500');
    }
  }

  function formatBytes(bytes) {
    if (!bytes || Number.isNaN(bytes)) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDateLabel(date) {
    if (!date) {
      return '';
    }
    return new Date(date).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatTimeLabel(date) {
    if (!date) {
      return '';
    }
    return new Date(date).toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function ensureSessionId() {
    const params = new URLSearchParams(window.location.search);
    let sessionId = params.get('report');
    if (!sessionId) {
      const generator = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID.bind(crypto) : null;
      sessionId = generator ? generator() : `report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      params.set('report', sessionId);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
    return sessionId;
  }

  function getStorageKey(sessionId) {
    return `sowa:checklistReport:${sessionId}`;
  }

  function loadSession(sessionId) {
    try {
      const raw = window.localStorage.getItem(getStorageKey(sessionId));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return parsed;
    } catch (error) {
      console.error('Nie udało się odczytać zapisanej sesji.', error);
      return null;
    }
  }

  function createEmptySession(sessionId) {
    const now = new Date().toISOString();
    return {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      facilityId: null,
      facilityName: '',
      caretakerEmail: '',
      bookingReference: '',
      contactName: '',
      contactPhone: '',
      eventDate: '',
      eventStart: '',
      eventEnd: '',
      eventNotes: '',
      generalRemarks: '',
      itemStates: {},
    };
  }

  function normalizeSessionData(sessionId, data) {
    const fallback = createEmptySession(sessionId);
    if (!data || typeof data !== 'object') {
      return fallback;
    }
    return {
      ...fallback,
      ...data,
      id: sessionId,
      itemStates: data.itemStates && typeof data.itemStates === 'object' ? data.itemStates : {},
    };
  }

  function persistSession() {
    if (!state.sessionId || !state.sessionData) {
      return;
    }
    try {
      const payload = {
        ...state.sessionData,
        updatedAt: new Date().toISOString(),
      };
      state.sessionData.updatedAt = payload.updatedAt;
      window.localStorage.setItem(getStorageKey(state.sessionId), JSON.stringify(payload));
      setStatus(dom.saveStatus, `Zapisano o ${formatTimeLabel(payload.updatedAt)}`, 'success');
    } catch (error) {
      console.error('Nie udało się zapisać raportu.', error);
      setStatus(dom.saveStatus, 'Nie udało się zapisać danych do pamięci przeglądarki.', 'error');
    }
  }

  function scheduleSave() {
    if (state.saveTimeoutId) {
      window.clearTimeout(state.saveTimeoutId);
    }
    setStatus(dom.saveStatus, 'Zapisywanie...', 'info');
    state.saveTimeoutId = window.setTimeout(() => {
      state.saveTimeoutId = null;
      persistSession();
    }, 400);
  }

  function describeFacility(facility) {
    if (!facility) {
      return '';
    }
    const parts = [];
    if (facility.postal_code || facility.city) {
      parts.push([facility.postal_code, facility.city].filter(Boolean).join(' '));
    }
    if (facility.address_line1 || facility.address_line2) {
      parts.push([facility.address_line1, facility.address_line2].filter(Boolean).join(', '));
    }
    return parts.filter(Boolean).join(' · ');
  }

  function updateFacilityMeta(facility) {
    if (!dom.facilityMeta) {
      return;
    }
    dom.facilityMeta.textContent = facility ? describeFacility(facility) : '';
  }

  function ensureItemState(itemKey) {
    if (!state.sessionData) {
      return null;
    }
    if (!state.sessionData.itemStates || typeof state.sessionData.itemStates !== 'object') {
      state.sessionData.itemStates = {};
    }
    if (!state.sessionData.itemStates[itemKey]) {
      state.sessionData.itemStates[itemKey] = {
        done: false,
        remarks: '',
        attachments: [],
        updatedAt: null,
      };
    } else if (!Array.isArray(state.sessionData.itemStates[itemKey].attachments)) {
      state.sessionData.itemStates[itemKey].attachments = [];
    }
    return state.sessionData.itemStates[itemKey];
  }

  function clearAttachmentUrlsForItem(itemKey) {
    for (const [storedKey, url] of state.attachmentUrlMap.entries()) {
      if (storedKey.startsWith(`${itemKey}::`)) {
        URL.revokeObjectURL(url);
        state.attachmentUrlMap.delete(storedKey);
      }
    }
  }

  function clearAllAttachmentUrls() {
    for (const url of state.attachmentUrlMap.values()) {
      URL.revokeObjectURL(url);
    }
    state.attachmentUrlMap.clear();
  }

  function openDatabase() {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Nie udało się otworzyć bazy IndexedDB.'));
    });
    return dbPromise;
  }

  function buildAttachmentKey(sessionId, itemKey, fileKey) {
    return `${sessionId}::${itemKey}::${fileKey}`;
  }

  async function storeAttachment(sessionId, itemKey, fileKey, file) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      const payload = {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        blob: file,
      };
      store.put(payload, buildAttachmentKey(sessionId, itemKey, fileKey));
    });
  }

  async function fetchAttachment(sessionId, itemKey, fileKey) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(buildAttachmentKey(sessionId, itemKey, fileKey));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteAttachmentFromStore(sessionId, itemKey, fileKey) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      store.delete(buildAttachmentKey(sessionId, itemKey, fileKey));
    });
  }

  async function deleteAllAttachmentsForItem(sessionId, itemKey) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const prefix = `${sessionId}::${itemKey}::`;
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          return;
        }
        if (String(cursor.key).startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteAllAttachmentsForSession(sessionId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const prefix = `${sessionId}::`;
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          return;
        }
        if (String(cursor.key).startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function handleAttachmentUpload(itemKey, fileList) {
    if (!fileList || !fileList.length || !state.sessionId) {
      return;
    }
    const itemState = ensureItemState(itemKey);
    if (!itemState) {
      return;
    }
    const files = Array.from(fileList);
    for (const file of files) {
      const fileKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await storeAttachment(state.sessionId, itemKey, fileKey, file);
      itemState.attachments.push({
        key: fileKey,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });
    }
    itemState.updatedAt = new Date().toISOString();
    scheduleSave();
  }

  async function removeAttachment(itemKey, fileKey) {
    if (!state.sessionId) {
      return false;
    }
    const itemState = ensureItemState(itemKey);
    if (!itemState || !Array.isArray(itemState.attachments)) {
      return false;
    }
    const index = itemState.attachments.findIndex((meta) => meta.key === fileKey);
    if (index === -1) {
      return false;
    }
    itemState.attachments.splice(index, 1);
    try {
      await deleteAttachmentFromStore(state.sessionId, itemKey, fileKey);
    } catch (error) {
      console.error('Nie udało się usunąć pliku z pamięci.', error);
    }
    const urlKey = `${itemKey}::${fileKey}`;
    const existingUrl = state.attachmentUrlMap.get(urlKey);
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
      state.attachmentUrlMap.delete(urlKey);
    }
    itemState.updatedAt = new Date().toISOString();
    scheduleSave();
    return true;
  }

  function formatItemStatus(itemState) {
    if (!itemState) {
      return 'Nie rozpoczęto';
    }
    if (itemState.done) {
      return itemState.updatedAt ? `Zrealizowano ${formatDateLabel(itemState.updatedAt)}` : 'Zrealizowano';
    }
    if (itemState.remarks && itemState.remarks.trim()) {
      return 'W toku / dodano uwagi';
    }
    return 'Nie rozpoczęto';
  }

  function updateItemStatusElement(wrapper, itemState) {
    const statusEl = wrapper.querySelector('[data-role="item-status"]');
    if (statusEl) {
      statusEl.textContent = formatItemStatus(itemState);
    }
  }

  function updateProgressIndicator() {
    if (!dom.progressIndicator) {
      return;
    }
    if (!state.selectedFacility) {
      dom.progressIndicator.textContent = 'Wybierz obiekt, aby rozpocząć raport.';
      return;
    }
    const total = state.checklistItems.length;
    if (!total) {
      dom.progressIndicator.textContent = 'Brak zdefiniowanej listy kontrolnej dla tego obiektu.';
      return;
    }
    let done = 0;
    for (const item of state.checklistItems) {
      const key = String(item.id);
      const entry = ensureItemState(key);
      if (entry?.done) {
        done += 1;
      }
    }
    const percent = Math.round((done / total) * 100);
    dom.progressIndicator.textContent = `Postęp: ${done}/${total} (${percent}%)`;
  }

  function generateReportText() {
    const lines = [];
    lines.push('Raport przekazania / zdania obiektu');
    lines.push(`ID raportu: ${state.sessionId}`);
    if (state.selectedFacility) {
      lines.push(`Świetlica: ${state.selectedFacility.name || '—'}`);
      const address = describeFacility(state.selectedFacility);
      if (address) {
        lines.push(`Adres: ${address}`);
      }
    }
    if (state.sessionData.bookingReference) {
      lines.push(`Rezerwacja / umowa: ${state.sessionData.bookingReference}`);
    }
    if (state.sessionData.eventDate) {
      const dateLine = [`Data: ${state.sessionData.eventDate}`];
      if (state.sessionData.eventStart) {
        dateLine.push(`start ${state.sessionData.eventStart}`);
      }
      if (state.sessionData.eventEnd) {
        dateLine.push(`koniec ${state.sessionData.eventEnd}`);
      }
      lines.push(dateLine.join(' • '));
    }
    if (state.sessionData.contactName) {
      lines.push(`Osoba przekazująca/odbierająca: ${state.sessionData.contactName}`);
    }
    if (state.sessionData.contactPhone) {
      lines.push(`Telefon kontaktowy: ${state.sessionData.contactPhone}`);
    }
    if (state.sessionData.eventNotes) {
      lines.push(`Notatki organizacyjne: ${state.sessionData.eventNotes}`);
    }
    lines.push('');

    const phases = [
      { key: 'handover', title: 'Odbiór obiektu' },
      { key: 'return', title: 'Zdanie obiektu' },
    ];
    for (const phase of phases) {
      lines.push(phase.title);
      const items = state.checklistItems.filter((item) => (item.phase || 'handover') === phase.key);
      if (!items.length) {
        lines.push('  — brak elementów —');
        lines.push('');
        continue;
      }
      for (const item of items) {
        const key = String(item.id);
        const entry = ensureItemState(key);
        const statusMark = entry?.done ? '[✔]' : '[ ]';
        lines.push(`  ${statusMark} ${item.title || 'Bez nazwy'}`);
        if (item.description) {
          lines.push(`      Opis: ${item.description}`);
        }
        if (entry?.remarks) {
          lines.push(`      Uwagi: ${entry.remarks}`);
        }
        if (entry?.attachments?.length) {
          lines.push(`      Zdjęcia: ${entry.attachments.length} szt.`);
        }
      }
      lines.push('');
    }
    if (state.sessionData.generalRemarks) {
      lines.push('Uwagi dodatkowe:');
      lines.push(state.sessionData.generalRemarks);
      lines.push('');
    }
    if (state.sessionData.caretakerEmail) {
      lines.push(`Adres do wysyłki: ${state.sessionData.caretakerEmail}`);
    }
    return lines.join('\n');
  }

  function updateReportPreview() {
    if (!dom.reportPreview) {
      return;
    }
    dom.reportPreview.value = generateReportText();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function generateReportHtml() {
    const created = state.sessionData?.createdAt ? new Date(state.sessionData.createdAt) : new Date();
    const updated = state.sessionData?.updatedAt ? new Date(state.sessionData.updatedAt) : new Date();
    const headerRows = [];
    headerRows.push(`<tr><th>Raport</th><td>${state.sessionId}</td></tr>`);
    if (state.selectedFacility) {
      headerRows.push(`<tr><th>Świetlica</th><td>${state.selectedFacility.name || '—'}</td></tr>`);
      const meta = describeFacility(state.selectedFacility);
      if (meta) {
        headerRows.push(`<tr><th>Adres</th><td>${meta}</td></tr>`);
      }
    }
    if (state.sessionData.bookingReference) {
      headerRows.push(`<tr><th>Rezerwacja / umowa</th><td>${state.sessionData.bookingReference}</td></tr>`);
    }
    if (state.sessionData.eventDate) {
      const slot = [state.sessionData.eventDate];
      if (state.sessionData.eventStart) {
        slot.push(`start ${state.sessionData.eventStart}`);
      }
      if (state.sessionData.eventEnd) {
        slot.push(`koniec ${state.sessionData.eventEnd}`);
      }
      headerRows.push(`<tr><th>Termin</th><td>${slot.join(' • ')}</td></tr>`);
    }
    if (state.sessionData.contactName) {
      headerRows.push(`<tr><th>Osoba</th><td>${state.sessionData.contactName}</td></tr>`);
    }
    if (state.sessionData.contactPhone) {
      headerRows.push(`<tr><th>Telefon</th><td>${state.sessionData.contactPhone}</td></tr>`);
    }
    if (state.sessionData.caretakerEmail) {
      headerRows.push(`<tr><th>E-mail opiekuna</th><td>${state.sessionData.caretakerEmail}</td></tr>`);
    }
    if (state.sessionData.eventNotes) {
      headerRows.push(`<tr><th>Notatki organizacyjne</th><td>${state.sessionData.eventNotes}</td></tr>`);
    }
    headerRows.push(`<tr><th>Utworzono</th><td>${created.toLocaleString('pl-PL')}</td></tr>`);
    headerRows.push(`<tr><th>Ostatnia aktualizacja</th><td>${updated.toLocaleString('pl-PL')}</td></tr>`);

    const sections = [];
    const phases = [
      { key: 'handover', title: 'Odbiór obiektu' },
      { key: 'return', title: 'Zdanie obiektu' },
    ];
    for (const phase of phases) {
      const items = state.checklistItems.filter((item) => (item.phase || 'handover') === phase.key);
      const rows = [];
      if (!items.length) {
        rows.push('<li>Brak elementów w tej sekcji.</li>');
      }
      for (const item of items) {
        const key = String(item.id);
        const entry = ensureItemState(key);
        const remarks = entry?.remarks ? `<p class="remarks"><strong>Uwagi:</strong> ${entry.remarks}</p>` : '';
        const description = item.description ? `<p class="details">${item.description}</p>` : '';
        const status = entry?.done ? 'Wykonano' : 'Do realizacji';
        let attachmentsHtml = '';
        if (entry?.attachments?.length) {
          const parts = [];
          for (const meta of entry.attachments) {
            const stored = await fetchAttachment(state.sessionId, key, meta.key);
            if (stored?.blob) {
              try {
                const dataUrl = await blobToDataUrl(stored.blob);
                parts.push(
                  `<figure class="photo"><img src="${dataUrl}" alt="${meta.name || 'Załącznik'}" /><figcaption>${meta.name || 'Załącznik'}</figcaption></figure>`,
                );
              } catch (error) {
                console.error('Nie udało się osadzić zdjęcia w raporcie.', error);
              }
            }
          }
          if (parts.length) {
            attachmentsHtml = `<div class="photos">${parts.join('')}</div>`;
          }
        }
        rows.push(
          `<li><div class="item-header"><span class="item-title">${item.title || 'Bez nazwy'}</span><span class="item-status">${status}</span></div>${description}${remarks}${attachmentsHtml}</li>`,
        );
      }
      sections.push(`<section><h3>${phase.title}</h3><ul>${rows.join('')}</ul></section>`);
    }
    let generalHtml = '';
    if (state.sessionData.generalRemarks) {
      generalHtml = `<section><h3>Uwagi dodatkowe</h3><p>${state.sessionData.generalRemarks}</p></section>`;
    }

    return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>Raport przekazania obiektu</title>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; line-height: 1.5; padding: 32px; background: #f5f5f5; color: #1f2937; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    h3 { font-size: 1.15rem; margin: 1.5rem 0 0.75rem; }
    table.meta { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
    table.meta th { text-align: left; width: 220px; padding: 6px 12px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    table.meta td { padding: 6px 12px; border-bottom: 1px solid #e5e7eb; }
    section { background: #fff; padding: 20px; border-radius: 16px; box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08); margin-bottom: 1.5rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { border-bottom: 1px solid #e5e7eb; padding: 16px 0; }
    li:last-child { border-bottom: none; }
    .item-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .item-title { font-weight: 600; }
    .item-status { font-size: 0.875rem; color: #2563eb; }
    .details { margin: 6px 0; color: #4b5563; }
    .remarks { margin: 6px 0; background: #fff7ed; padding: 10px 12px; border-radius: 12px; }
    .photos { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; }
    .photo { width: 160px; }
    .photo img { width: 100%; border-radius: 12px; border: 1px solid #e5e7eb; }
    .photo figcaption { font-size: 0.75rem; color: #6b7280; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Raport przekazania / zdania obiektu</h1>
  <table class="meta">${headerRows.join('')}</table>
  ${sections.join('\n')} ${generalHtml}
</body>
</html>`;
  }

  async function renderAttachmentsForItem(itemKey, listEl) {
    if (!listEl) {
      return;
    }
    clearAttachmentUrlsForItem(itemKey);
    const itemState = ensureItemState(itemKey);
    const attachments = itemState?.attachments || [];
    if (!attachments.length) {
      listEl.innerHTML = '<p class="text-xs text-gray-500">Brak zdjęć.</p>';
      return;
    }
    listEl.innerHTML = '';
    for (const meta of attachments) {
      const card = document.createElement('div');
      card.className = 'border rounded-xl p-2 flex items-start gap-2 bg-gray-50';
      card.dataset.attachment = meta.key;

      const preview = document.createElement('img');
      preview.className = 'w-20 h-20 object-cover rounded-lg bg-white border';
      preview.alt = meta.name || 'Załącznik';
      card.appendChild(preview);

      const info = document.createElement('div');
      info.className = 'flex-1 min-w-0';
      const nameEl = document.createElement('div');
      nameEl.className = 'text-sm font-medium truncate';
      nameEl.textContent = meta.name || 'bez nazwy';
      info.appendChild(nameEl);
      const sizeEl = document.createElement('div');
      sizeEl.className = 'text-xs text-gray-500';
      sizeEl.textContent = `${formatBytes(meta.size || 0)} • ${meta.type || 'obraz'}`;
      info.appendChild(sizeEl);

      const actions = document.createElement('div');
      actions.className = 'mt-1 flex items-center gap-3 text-xs';
      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'text-blue-600 hover:underline';
      downloadBtn.textContent = 'Pobierz';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'text-red-600 hover:underline';
      removeBtn.textContent = 'Usuń';
      actions.appendChild(downloadBtn);
      actions.appendChild(removeBtn);
      info.appendChild(actions);

      card.appendChild(info);
      listEl.appendChild(card);

      try {
        const stored = await fetchAttachment(state.sessionId, itemKey, meta.key);
        if (stored?.blob) {
          const url = URL.createObjectURL(stored.blob);
          state.attachmentUrlMap.set(`${itemKey}::${meta.key}`, url);
          preview.src = url;
          downloadBtn.addEventListener('click', () => {
            const link = document.createElement('a');
            link.href = url;
            link.download = meta.name || 'zalacznik';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          });
        } else {
          preview.replaceWith(document.createTextNode('Brak pliku'));
        }
      } catch (error) {
        console.error('Nie udało się pobrać załącznika.', error);
      }

      removeBtn.addEventListener('click', async () => {
        const removed = await removeAttachment(itemKey, meta.key);
        if (removed) {
          await renderAttachmentsForItem(itemKey, listEl);
          updateReportPreview();
          updateProgressIndicator();
        }
      });
    }
  }

  function applySessionToInputs() {
    if (!state.sessionData) {
      return;
    }
    if (dom.sessionIdDisplay) {
      dom.sessionIdDisplay.textContent = state.sessionId;
    }
    if (dom.caretakerEmail) {
      dom.caretakerEmail.value = state.sessionData.caretakerEmail || '';
    }
    if (dom.bookingReference) {
      dom.bookingReference.value = state.sessionData.bookingReference || '';
    }
    if (dom.contactName) {
      dom.contactName.value = state.sessionData.contactName || '';
    }
    if (dom.contactPhone) {
      dom.contactPhone.value = state.sessionData.contactPhone || '';
    }
    if (dom.eventDate) {
      dom.eventDate.value = state.sessionData.eventDate || '';
    }
    if (dom.eventStart) {
      dom.eventStart.value = state.sessionData.eventStart || '';
    }
    if (dom.eventEnd) {
      dom.eventEnd.value = state.sessionData.eventEnd || '';
    }
    if (dom.eventNotes) {
      dom.eventNotes.value = state.sessionData.eventNotes || '';
    }
    if (dom.generalRemarks) {
      dom.generalRemarks.value = state.sessionData.generalRemarks || '';
    }
  }

  function attachInputListeners() {
    dom.caretakerEmail?.addEventListener('input', () => {
      state.sessionData.caretakerEmail = dom.caretakerEmail.value.trim();
      scheduleSave();
      updateReportPreview();
    });
    dom.bookingReference?.addEventListener('input', () => {
      state.sessionData.bookingReference = dom.bookingReference.value.trim();
      scheduleSave();
      updateReportPreview();
    });
    dom.contactName?.addEventListener('input', () => {
      state.sessionData.contactName = dom.contactName.value.trim();
      scheduleSave();
      updateReportPreview();
    });
    dom.contactPhone?.addEventListener('input', () => {
      state.sessionData.contactPhone = dom.contactPhone.value.trim();
      scheduleSave();
      updateReportPreview();
    });
    dom.eventDate?.addEventListener('input', () => {
      state.sessionData.eventDate = dom.eventDate.value;
      scheduleSave();
      updateReportPreview();
    });
    dom.eventStart?.addEventListener('input', () => {
      state.sessionData.eventStart = dom.eventStart.value;
      scheduleSave();
      updateReportPreview();
    });
    dom.eventEnd?.addEventListener('input', () => {
      state.sessionData.eventEnd = dom.eventEnd.value;
      scheduleSave();
      updateReportPreview();
    });
    dom.eventNotes?.addEventListener('input', () => {
      state.sessionData.eventNotes = dom.eventNotes.value.trim();
      scheduleSave();
      updateReportPreview();
    });
    dom.generalRemarks?.addEventListener('input', () => {
      state.sessionData.generalRemarks = dom.generalRemarks.value;
      scheduleSave();
      updateReportPreview();
    });
    dom.copyReport?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(dom.reportPreview?.value || '');
        setStatus(dom.reportActionMessage, 'Raport skopiowano do schowka.', 'success');
      } catch (error) {
        console.error(error);
        setStatus(dom.reportActionMessage, 'Nie udało się skopiować raportu.', 'error');
      }
    });
    dom.downloadReport?.addEventListener('click', async () => {
      try {
        const html = await generateReportHtml();
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `raport-obiekt-${state.sessionId}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setStatus(dom.reportActionMessage, 'Pobrano raport w formacie HTML.', 'success');
      } catch (error) {
        console.error(error);
        setStatus(dom.reportActionMessage, 'Nie udało się wygenerować pliku HTML.', 'error');
      }
    });
    dom.sendEmail?.addEventListener('click', () => {
      const recipient = state.sessionData.caretakerEmail || '';
      const subjectParts = ['Raport obiektu'];
      if (state.selectedFacility?.name) {
        subjectParts.push(state.selectedFacility.name);
      }
      if (state.sessionData.eventDate) {
        subjectParts.push(state.sessionData.eventDate);
      }
      const subject = encodeURIComponent(subjectParts.join(' – '));
      const body = encodeURIComponent(`${dom.reportPreview?.value || ''}\n\n--\nRaport wygenerowany w trybie LIVE. Pamiętaj o dołączeniu zdjęć.`);
      window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${body}`;
      setStatus(dom.reportActionMessage, 'Otworzono domyślny klient poczty. Dodaj zdjęcia jako załączniki.', 'info');
    });
    dom.facilitySelect?.addEventListener('change', (event) => {
      void handleFacilityChange(event.target.value);
    });
  }

  function renderFacilityOptions() {
    if (!dom.facilitySelect) {
      return;
    }
    const previousValue = dom.facilitySelect.value;
    dom.facilitySelect.innerHTML = '<option value="">— wybierz obiekt —</option>';
    const sorted = [...state.facilities].sort((a, b) => {
      const left = (a.name || '').toLocaleLowerCase('pl');
      const right = (b.name || '').toLocaleLowerCase('pl');
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });
    for (const facility of sorted) {
      const option = document.createElement('option');
      option.value = String(facility.id);
      option.textContent = facility.name || `ID ${facility.id}`;
      dom.facilitySelect.appendChild(option);
    }
    if (previousValue) {
      dom.facilitySelect.value = previousValue;
    }
  }

  async function loadFacilities() {
    try {
      const { data, error } = await supa.from('facilities').select('*').order('name');
      if (error) {
        throw error;
      }
      state.facilities = data || [];
      renderFacilityOptions();
      if (state.sessionData.facilityId) {
        const existing = state.facilities.find((item) => String(item.id) === String(state.sessionData.facilityId));
        if (existing) {
          if (dom.facilitySelect) {
            dom.facilitySelect.value = String(existing.id);
          }
          state.selectedFacility = existing;
          updateFacilityMeta(existing);
          await loadChecklistForFacility(existing.id);
          await renderChecklist();
          updateProgressIndicator();
          updateReportPreview();
          return;
        }
      }
      if (!state.facilities.length) {
        setStatus(dom.checklistMessage, 'Brak dostępnych obiektów.', 'error');
      } else {
        setStatus(dom.checklistMessage, 'Wybierz obiekt, aby rozpocząć raport.', 'info');
      }
    } catch (error) {
      console.error(error);
      setStatus(dom.checklistMessage, 'Nie udało się pobrać listy obiektów.', 'error');
    }
  }

  async function loadChecklistForFacility(facilityId) {
    state.checklistItems = [];
    if (!facilityId) {
      return;
    }
    try {
      const { data, error } = await supa
        .from('facility_checklist_items')
        .select('*')
        .eq('facility_id', facilityId)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true });
      if (error) {
        throw error;
      }
      state.checklistItems = (data || []).map((row, index) => ({
        id: row.id,
        phase: row.phase || 'handover',
        title: row.title || '',
        description: row.description || '',
        is_required: row.is_required !== false,
        order: typeof row.order_index === 'number' ? row.order_index : index,
      }));
      await reconcileItemStates();
      setStatus(
        dom.checklistMessage,
        state.checklistItems.length ? '' : 'Brak elementów w tej liście kontrolnej.',
        'info',
      );
    } catch (error) {
      console.error(error);
      setStatus(dom.checklistMessage, error?.message || 'Nie udało się pobrać listy kontrolnej.', 'error');
    }
  }

  async function reconcileItemStates() {
    if (!state.sessionData) {
      return;
    }
    const validKeys = new Set();
    for (const item of state.checklistItems) {
      const key = String(item.id);
      validKeys.add(key);
      ensureItemState(key);
    }
    const storedKeys = Object.keys(state.sessionData.itemStates || {});
    for (const key of storedKeys) {
      if (!validKeys.has(key)) {
        delete state.sessionData.itemStates[key];
        await deleteAllAttachmentsForItem(state.sessionId, key);
        clearAttachmentUrlsForItem(key);
      }
    }
  }

  async function renderChecklist() {
    if (!dom.handoverList || !dom.returnList) {
      return;
    }
    dom.handoverList.innerHTML = '';
    dom.returnList.innerHTML = '';
    if (!state.selectedFacility) {
      const placeholder = '<p class="text-sm text-gray-500">Wybierz obiekt, aby rozpocząć.</p>';
      dom.handoverList.innerHTML = placeholder;
      dom.returnList.innerHTML = placeholder;
      updateProgressIndicator();
      return;
    }
    if (!state.checklistItems.length) {
      const empty = '<p class="text-sm text-gray-500">Brak elementów do potwierdzenia.</p>';
      dom.handoverList.innerHTML = empty;
      dom.returnList.innerHTML = empty;
      updateProgressIndicator();
      return;
    }
    await Promise.all([
      renderChecklistGroup('handover', dom.handoverList),
      renderChecklistGroup('return', dom.returnList),
    ]);
    updateProgressIndicator();
    updateReportPreview();
  }

  async function renderChecklistGroup(phase, container) {
    container.innerHTML = '';
    const items = state.checklistItems.filter((item) => (item.phase || 'handover') === phase);
    if (!items.length) {
      container.innerHTML = '<p class="text-sm text-gray-500">Brak elementów w tej sekcji.</p>';
      return;
    }
    let index = 1;
    for (const item of items) {
      const card = createChecklistCard(item, index);
      container.appendChild(card);
      const itemKey = String(item.id);
      const itemState = ensureItemState(itemKey);
      const checkbox = card.querySelector('[data-role="done"]');
      const remarks = card.querySelector('[data-role="remarks"]');
      const addBtn = card.querySelector('[data-role="add-attachment"]');
      const fileInput = card.querySelector('[data-role="file-input"]');
      const attachmentList = card.querySelector('[data-role="attachment-list"]');

      if (checkbox) {
        checkbox.checked = !!itemState?.done;
        checkbox.addEventListener('change', () => {
          const entry = ensureItemState(itemKey);
          entry.done = checkbox.checked;
          entry.updatedAt = new Date().toISOString();
          updateItemStatusElement(card, entry);
          scheduleSave();
          updateProgressIndicator();
          updateReportPreview();
        });
      }
      if (remarks) {
        remarks.value = itemState?.remarks || '';
        remarks.addEventListener('input', () => {
          const entry = ensureItemState(itemKey);
          entry.remarks = remarks.value;
          entry.updatedAt = new Date().toISOString();
          updateItemStatusElement(card, entry);
          scheduleSave();
          updateReportPreview();
        });
      }
      if (addBtn && fileInput) {
        addBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (event) => {
          await handleAttachmentUpload(itemKey, event.target.files);
          event.target.value = '';
          await renderAttachmentsForItem(itemKey, attachmentList);
          updateItemStatusElement(card, ensureItemState(itemKey));
          updateReportPreview();
          updateProgressIndicator();
        });
      }
      await renderAttachmentsForItem(itemKey, attachmentList);
      updateItemStatusElement(card, itemState);
      index += 1;
    }
  }

  function createChecklistCard(item, index) {
    const itemKey = String(item.id);
    const wrapper = document.createElement('article');
    wrapper.className = 'border rounded-2xl bg-white shadow-sm p-4 space-y-3';
    wrapper.dataset.item = itemKey;

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-3 flex-wrap';

    const label = document.createElement('label');
    label.className = 'flex items-start gap-3 text-sm flex-1';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.role = 'done';
    checkbox.className = 'mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500';
    label.appendChild(checkbox);
    const textContainer = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'font-semibold text-base';
    title.textContent = `${index}. ${item.title || 'Bez nazwy'}`;
    textContainer.appendChild(title);
    if (item.description) {
      const description = document.createElement('div');
      description.className = 'text-sm text-gray-600 mt-1';
      description.textContent = item.description;
      textContainer.appendChild(description);
    }
    if (item.is_required !== false) {
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center text-xs mt-2 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200';
      badge.textContent = 'Wymagane';
      textContainer.appendChild(badge);
    }
    label.appendChild(textContainer);
    header.appendChild(label);

    const status = document.createElement('span');
    status.className = 'text-xs text-gray-400';
    status.dataset.role = 'item-status';
    status.textContent = 'Nie rozpoczęto';
    header.appendChild(status);
    wrapper.appendChild(header);

    const remarksBlock = document.createElement('div');
    const remarksLabel = document.createElement('label');
    remarksLabel.className = 'block text-sm font-medium text-gray-700';
    remarksLabel.textContent = 'Uwagi / opis wykonania';
    remarksBlock.appendChild(remarksLabel);
    const remarksTextarea = document.createElement('textarea');
    remarksTextarea.dataset.role = 'remarks';
    remarksTextarea.rows = 3;
    remarksTextarea.className = 'mt-1 w-full border rounded-xl px-3 py-2 text-sm';
    remarksTextarea.placeholder = 'Dodaj opis wykonania, zgłoszenia lub problemy...';
    remarksBlock.appendChild(remarksTextarea);
    wrapper.appendChild(remarksBlock);

    const attachmentsSection = document.createElement('div');
    attachmentsSection.className = 'space-y-2';
    const attachmentsHeader = document.createElement('div');
    attachmentsHeader.className = 'flex items-center justify-between gap-2';
    const attachmentsTitle = document.createElement('div');
    attachmentsTitle.className = 'text-sm font-medium text-gray-700';
    attachmentsTitle.textContent = 'Zdjęcia / załączniki';
    attachmentsHeader.appendChild(attachmentsTitle);
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.dataset.role = 'add-attachment';
    addButton.className = 'text-sm text-blue-600 hover:underline flex items-center gap-1';
    addButton.innerHTML = '➕ Dodaj zdjęcia';
    attachmentsHeader.appendChild(addButton);
    attachmentsSection.appendChild(attachmentsHeader);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.dataset.role = 'file-input';
    fileInput.className = 'hidden';
    attachmentsSection.appendChild(fileInput);

    const attachmentList = document.createElement('div');
    attachmentList.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';
    attachmentList.dataset.role = 'attachment-list';
    attachmentsSection.appendChild(attachmentList);
    wrapper.appendChild(attachmentsSection);

    return wrapper;
  }

  async function handleFacilityChange(value) {
    const facility = state.facilities.find((item) => String(item.id) === String(value)) || null;
    if (!facility) {
      state.selectedFacility = null;
      state.sessionData.facilityId = null;
      state.sessionData.facilityName = '';
      updateFacilityMeta(null);
      state.checklistItems = [];
      await renderChecklist();
      updateProgressIndicator();
      updateReportPreview();
      scheduleSave();
      return;
    }
    const previousId = state.sessionData.facilityId;
    if (previousId && previousId !== String(facility.id)) {
      const hasProgress = Object.values(state.sessionData.itemStates || {}).some((entry) => {
        if (!entry) return false;
        return entry.done || (entry.remarks && entry.remarks.trim()) || (entry.attachments && entry.attachments.length);
      });
      if (hasProgress) {
        const confirmed = window.confirm('Zmiana obiektu spowoduje usunięcie bieżącego raportu. Kontynuować?');
        if (!confirmed) {
          if (dom.facilitySelect) {
            dom.facilitySelect.value = previousId;
          }
          return;
        }
      }
      await deleteAllAttachmentsForSession(state.sessionId);
      clearAllAttachmentUrls();
      state.sessionData.itemStates = {};
      state.sessionData.generalRemarks = '';
      if (dom.generalRemarks) {
        dom.generalRemarks.value = '';
      }
    }
    state.selectedFacility = facility;
    state.sessionData.facilityId = String(facility.id);
    state.sessionData.facilityName = facility.name || '';
    updateFacilityMeta(facility);
    scheduleSave();
    await loadChecklistForFacility(facility.id);
    await renderChecklist();
    updateProgressIndicator();
    updateReportPreview();
  }

  async function bootstrap() {
    state.sessionId = ensureSessionId();
    const stored = loadSession(state.sessionId);
    state.sessionData = normalizeSessionData(state.sessionId, stored);
    applySessionToInputs();
    updateReportPreview();
    setStatus(dom.saveStatus, stored ? 'Przywrócono zapisane dane raportu.' : 'Nowy raport został utworzony.', 'info');
    attachInputListeners();
    setStatus(dom.checklistMessage, 'Wybierz obiekt, aby rozpocząć raport.', 'info');
    await renderChecklist();
    updateProgressIndicator();
    await loadFacilities();
  }

  void bootstrap();
}
