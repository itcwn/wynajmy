import { getTenantId } from '../state/tenant.js';

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

function buildClientPriorityList(session) {
  const clients = [];
  if (session?.supabase) {
    clients.push(session.supabase);
  }
  if (session?.baseSupabase && session.baseSupabase !== session.supabase) {
    clients.push(session.baseSupabase);
  }
  return clients;
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return String(value);
  } catch (error) {
    console.warn('Nie udało się znormalizować wartości pola formularza konta najemcy:', error);
    return '';
  }
}

function readFormValues(form) {
  if (!form) {
    return null;
  }
  const data = new FormData(form);
  const payload = {};
  for (const [key, rawValue] of data.entries()) {
    const value = normalizeString(rawValue).trim();
    if (value) {
      payload[key] = value;
    } else {
      payload[key] = null;
    }
  }
  if (payload.billing_country_code) {
    payload.billing_country_code = payload.billing_country_code.toUpperCase();
  }
  return payload;
}

function fillForm(form, tenant) {
  if (!form || !tenant) {
    return;
  }
  const entries = {
    name: tenant.name ?? '',
    billing_name: tenant.billing_name ?? '',
    billing_tax_id: tenant.billing_tax_id ?? '',
    billing_address_line1: tenant.billing_address_line1 ?? '',
    billing_address_line2: tenant.billing_address_line2 ?? '',
    billing_postal_code: tenant.billing_postal_code ?? '',
    billing_city: tenant.billing_city ?? '',
    billing_country_code: tenant.billing_country_code ?? 'PL',
    contact_person: tenant.contact_person ?? '',
    contact_email: tenant.contact_email ?? '',
    contact_phone: tenant.contact_phone ?? '',
    notes: tenant.notes ?? '',
  };
  for (const [name, value] of Object.entries(entries)) {
    const field = form.elements.namedItem(name);
    if (!field) {
      continue;
    }
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.value = normalizeString(value);
    }
  }
}

function toggleFormDisabled(form, disabled) {
  if (!form) {
    return;
  }
  const elements = Array.from(form.elements || []);
  for (const element of elements) {
    if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      if (element.dataset.tenantAccountModalClose !== undefined) {
        continue;
      }
      element.disabled = disabled;
    }
  }
}

function focusFirstField(form) {
  if (!form) {
    return;
  }
  const elements = Array.from(form.elements || []);
  for (const element of elements) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (!element.disabled && element.type !== 'hidden') {
        element.focus();
        break;
      }
    }
  }
}

export function initTenantAccountModal({ session } = {}) {
  const openButton = document.getElementById('openTenantAccountModal');
  const modal = document.getElementById('tenantAccountModal');
  const form = document.getElementById('tenantAccountForm');
  const statusElement = document.getElementById('tenantAccountStatus');
  const submitButton = document.getElementById('tenantAccountSubmit');
  const closeButtons = Array.from(document.querySelectorAll('[data-tenant-account-modal-close]'));
  const modalClassList = modal?.classList || null;
  const bodyClassList = document.body?.classList || null;
  const clients = buildClientPriorityList(session);

  let lastFocusedElement = null;
  let escapeListenerAttached = false;
  let isSubmitting = false;

  function isModalOpen() {
    return Boolean(modalClassList) && modalClassList.contains('flex');
  }

  function trapBodyScroll(shouldTrap) {
    if (!bodyClassList) {
      return;
    }
    if (shouldTrap) {
      bodyClassList.add('overflow-hidden');
    } else {
      bodyClassList.remove('overflow-hidden');
    }
  }

  function handleEscape(event) {
    if (event.key !== 'Escape' || !isModalOpen()) {
      return;
    }
    event.preventDefault();
    closeModal({ restoreFocus: true });
  }

  function attachEscapeListener() {
    if (escapeListenerAttached) {
      return;
    }
    document.addEventListener('keydown', handleEscape);
    escapeListenerAttached = true;
  }

  function detachEscapeListener() {
    if (!escapeListenerAttached) {
      return;
    }
    document.removeEventListener('keydown', handleEscape);
    escapeListenerAttached = false;
  }

  function openModal() {
    if (!modal || !modalClassList || isModalOpen()) {
      return;
    }
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalClassList.remove('hidden');
    modalClassList.add('flex');
    trapBodyScroll(true);
    setStatus(statusElement, 'Ładowanie danych konta...');
    toggleFormDisabled(form, true);
    attachEscapeListener();
    void loadTenantData();
  }

  function closeModal({ restoreFocus = true } = {}) {
    if (!modal || !modalClassList || !isModalOpen()) {
      return;
    }
    modalClassList.add('hidden');
    modalClassList.remove('flex');
    trapBodyScroll(false);
    detachEscapeListener();
    setStatus(statusElement, '');
    toggleFormDisabled(form, false);
    if (restoreFocus && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  async function loadTenantData() {
    const tenantId = getTenantId();
    if (!tenantId) {
      setStatus(statusElement, 'Brak przypisanego klienta do tego konta.', 'error');
      toggleFormDisabled(form, true);
      return;
    }
    if (!clients.length) {
      setStatus(statusElement, 'Brak połączenia z bazą danych. Spróbuj ponownie później.', 'error');
      toggleFormDisabled(form, true);
      return;
    }
    for (const client of clients) {
      try {
        const { data, error } = await client
          .from('tenants')
          .select(
            'id,name,billing_name,billing_tax_id,billing_address_line1,billing_address_line2,billing_postal_code,billing_city,billing_country_code,contact_person,contact_email,contact_phone,notes',
          )
          .eq('id', tenantId)
          .maybeSingle();
        if (error) {
          throw error;
        }
        if (data) {
          fillForm(form, data);
          toggleFormDisabled(form, false);
          setStatus(statusElement, 'Zaktualizuj dane i zapisz zmiany.');
          focusFirstField(form);
          return;
        }
      } catch (error) {
        console.warn('Nie udało się pobrać danych konta najemcy:', error);
      }
    }
    setStatus(statusElement, 'Nie udało się pobrać danych konta. Spróbuj ponownie później.', 'error');
    toggleFormDisabled(form, false);
    focusFirstField(form);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    if (!form) {
      return;
    }
    const tenantId = getTenantId();
    if (!tenantId) {
      setStatus(statusElement, 'Brak powiązanego klienta. Nie można zapisać zmian.', 'error');
      return;
    }
    if (!clients.length) {
      setStatus(statusElement, 'Brak połączenia z bazą danych. Spróbuj ponownie później.', 'error');
      return;
    }
    const payload = readFormValues(form);
    if (!payload) {
      setStatus(statusElement, 'Nie udało się odczytać danych formularza.', 'error');
      return;
    }
    isSubmitting = true;
    toggleFormDisabled(form, true);
    if (submitButton) {
      submitButton.disabled = true;
    }
    setStatus(statusElement, 'Zapisywanie zmian w koncie...');

    let lastError = null;
    try {
      for (const client of clients) {
        try {
          const { data, error } = await client
            .from('tenants')
            .update(payload)
            .eq('id', tenantId)
            .select()
            .maybeSingle();
          if (error) {
            throw error;
          }
          fillForm(form, data || payload);
          setStatus(statusElement, 'Dane konta zostały zapisane.', 'success');
          return;
        } catch (error) {
          lastError = error;
          console.warn('Nie udało się zapisać danych konta najemcy:', error);
        }
      }

      if (lastError) {
        setStatus(statusElement, 'Nie udało się zapisać zmian. Sprawdź dane i spróbuj ponownie.', 'error');
      }
    } finally {
      isSubmitting = false;
      toggleFormDisabled(form, false);
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  }

  function handleCloseButton(event) {
    event.preventDefault();
    closeModal({ restoreFocus: true });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      void handleSubmit(event);
    });
  }

  closeButtons.forEach((button) => {
    button.addEventListener('click', handleCloseButton);
  });

  if (openButton) {
    openButton.addEventListener('click', () => {
      openModal();
    });
  }

  return {
    open: openModal,
    close: closeModal,
    refresh: loadTenantData,
  };
}

export default initTenantAccountModal;
