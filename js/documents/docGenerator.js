export function createDocGenerator({ state, supabase, domUtils, formatUtils }) {
  const { $ } = domUtils;
  const { escapeHtml, formatDate, formatTime } = formatUtils;

  async function loadTemplatesForFacility(facilityId = state.selectedFacility?.id) {
    if (!facilityId) {
      state.templates = [];
      return state.templates;
    }
    const { data: local } = await supabase
      .from('document_templates')
      .select('*')
      .eq('is_active', true)
      .eq('facility_id', facilityId)
      .order('name');
    const { data: global } = await supabase
      .from('document_templates')
      .select('*')
      .eq('is_active', true)
      .is('facility_id', null)
      .order('name');
    const localTemplates = local || [];
    const globalTemplates = (global || []).filter((tpl) => !localTemplates.some((loc) => loc.code === tpl.code));
    state.templates = [...localTemplates, ...globalTemplates];
    return state.templates;
  }

  function getBookingContext(bookingRow) {
    if (bookingRow) {
      return bookingRow;
    }
    if (state.lastBooking) {
      return state.lastBooking;
    }
    const form = $('#bookingForm');
    if (!form) {
      return {};
    }
    return {
      title: form.title?.value?.trim() || '',
      start_time: form.start_time?.value ? new Date(form.start_time.value).toISOString() : null,
      end_time: form.end_time?.value ? new Date(form.end_time.value).toISOString() : null,
      renter_name: form.renter_name?.value?.trim() || '',
      renter_email: form.renter_email?.value?.trim() || '',
      notes: form.notes?.value?.trim() || '',
    };
  }

  function getFacilityContext() {
    const facility = state.selectedFacility || {};
    const address = `${facility.address_line1 || ''}${facility.address_line2 ? `, ${facility.address_line2}` : ''}, ${facility.postal_code || ''} ${facility.city || ''}`.trim();
    return {
      name: facility.name || '',
      address,
      city: facility.city || '',
      postal_code: facility.postal_code || '',
      capacity: facility.capacity || '',
      price_per_hour: facility.price_per_hour || '',
      price_per_day: facility.price_per_day || '',
    };
  }

  function applyTemplate(templateHtml, bookingRow) {
    const booking = getBookingContext(bookingRow);
    const facility = getFacilityContext();
    let html = templateHtml;
    const replacements = {
      '{{booking.title}}': booking.title || '',
      '{{booking.renter_name}}': booking.renter_name || '',
      '{{booking.renter_email}}': booking.renter_email || '',
      '{{booking.renter_phone}}': booking.renter_phone || '',
      '{{booking.notes}}': booking.notes || '',
      '{{facility.name}}': facility.name || '',
      '{{facility.address}}': facility.address || '',
      '{{facility.city}}': facility.city || '',
      '{{facility.postal_code}}': facility.postal_code || '',
      '{{facility.capacity}}': facility.capacity || '',
      '{{facility.price_per_hour}}': facility.price_per_hour || '',
      '{{facility.price_per_day}}': facility.price_per_day || '',
    };
    Object.entries(replacements).forEach(([key, value]) => {
      html = html.split(key).join(escapeHtml(String(value ?? '')));
    });
    html = html.replace(/\{\{\s*date\s+booking\.start_time\s*\}\}/g, formatDate(booking.start_time));
    html = html.replace(/\{\{\s*date\s+booking\.end_time\s*\}\}/g, formatDate(booking.end_time));
    html = html.replace(/\{\{\s*time\s+booking\.start_time\s*\}\}/g, formatTime(booking.start_time));
    html = html.replace(/\{\{\s*time\s+booking\.end_time\s*\}\}/g, formatTime(booking.end_time));
    html = html.replace(/\{\{\s*date\s+booking\.request_date\s*\}\}/g, formatDate(booking.request_date));
    html = html.replace(/\{\{booking\.extra\.([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
      const val = state.docFormValues?.[key];
      return val == null ? '' : escapeHtml(String(val));
    });
    const style = `<style id="print-styles">
    body{font-family:system-ui, sans-serif; padding:24px}
    .doc table{width:100%;border-collapse:collapse}
    .doc table td,.doc table th{border:1px solid #ccc;padding:6px}
    .signs{display:flex;gap:40px;justify-content:space-between;margin-top:30px}
    @page { size: A4; margin: 15mm }
  </style>`;
    return `<!doctype html><html><head><meta charset="utf-8" />${style}<title>Dokument</title></head><body>${html}</body></html>`;
  }

  function openPreviewWindow(html, print = false) {
    const w = window.open('', '_blank');
    if (!w) {
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    if (print) {
      w.print();
    }
  }

  async function showTemplateSelectorLive(bookingRow, mountEl) {
    if (!mountEl) {
      return;
    }
    state.docFormValues = {};
    state.docSelectedTemplate = null;

    mountEl.innerHTML = `
      <div class="p-4 border rounded bg-gray-50">
        <h3 class="font-bold mb-3">Wybierz szablon i uzupełnij pola, aby wygenerować/ wydrukować wniosek</h3>
        <div id="tplList" class="grid gap-2 mb-4"></div>
        <div id="tplFields"></div>
      </div>
    `;
    const list = mountEl.querySelector('#tplList');
    const fieldsWrap = mountEl.querySelector('#tplFields');
    const templates = await loadTemplatesForFacility(bookingRow?.facility_id ?? state.selectedFacility?.id);
    if (!templates.length) {
      list.innerHTML = '<div class="p-3 border rounded bg-white text-gray-600">Brak dostępnych szablonów dla tej świetlicy.</div>';
      return;
    }
    templates.forEach((tpl) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'text-left p-3 border rounded bg-white hover:bg-gray-100';
      btn.innerHTML = `
        <div class="font-semibold">${escapeHtml(tpl.name || '')}</div>
        <div class="text-xs text-gray-600">${tpl.facility_id ? 'szablon lokalny' : 'szablon ogólny'} • ${escapeHtml(tpl.code || '')}</div>
      `;
      btn.addEventListener('click', () => {
        list.querySelectorAll('button').forEach((el) => el.classList.remove('ring-2', 'ring-red-500'));
        btn.classList.add('ring-2', 'ring-red-500');
        state.docSelectedTemplate = tpl;
        renderLiveFields(tpl);
      });
      list.appendChild(btn);
    });

    function renderLiveFields(tpl) {
      fieldsWrap.innerHTML = '';
      const matches = [...tpl.html.matchAll(/\{\{booking\.extra\.([a-zA-Z0-9_]+)\}\}/g)];
      const keys = [...new Set(matches.map((m) => m[1]))];
      const head = document.createElement('div');
      head.className = 'mb-2 text-sm text-gray-700';
      head.textContent = keys.length
        ? 'Uzupełnij pola dla wybranego szablonu:'
        : 'Ten szablon nie ma dodatkowych pól do uzupełnienia.';
      fieldsWrap.appendChild(head);
      if (keys.length) {
        const table = document.createElement('table');
        table.className = 'table-auto w-full border rounded bg-white';
        table.innerHTML = `
          <thead>
            <tr class="bg-gray-100">
              <th class="border p-2 text-left w-1/3">Pole</th>
              <th class="border p-2 text-left">Wartość</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        keys.forEach((key) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td class="border p-2 align-top"><code>${escapeHtml(key)}</code></td>
            <td class="border p-2">
              <input type="text" class="w-full border rounded px-2 py-1" data-extra="${escapeHtml(key)}" value="${escapeHtml(state.docFormValues[key] ?? '')}">
            </td>
          `;
          tbody.appendChild(row);
        });
        fieldsWrap.appendChild(table);
        fieldsWrap.querySelectorAll('input[data-extra]').forEach((input) => {
          input.addEventListener('input', (event) => {
            const target = event.target;
            state.docFormValues[target.dataset.extra] = target.value;
          });
        });
      }
      const actions = document.createElement('div');
      actions.className = 'p-3 flex gap-2';
      actions.innerHTML = `
        <button type="button" id="previewDoc" class="px-3 py-2 rounded border">👁️ Podgląd</button>
        <button type="button" id="printDoc" class="px-3 py-2 rounded border">🖨️ Drukuj</button>
      `;
      fieldsWrap.appendChild(actions);
      fieldsWrap.querySelector('#previewDoc')?.addEventListener('click', () => {
        const html = applyTemplate(tpl.html, bookingRow);
        openPreviewWindow(html, false);
      });
      fieldsWrap.querySelector('#printDoc')?.addEventListener('click', () => {
        const html = applyTemplate(tpl.html, bookingRow);
        openPreviewWindow(html, true);
      });
    }
  }

  return { loadTemplatesForFacility, showTemplateSelectorLive };
}
