function setMessage(element, text, tone = 'info') {
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

function toggleFormDisabled(form, disabled) {
  if (!form) {
    return;
  }
  const elements = form.querySelectorAll('input, textarea, select, button');
  elements.forEach((element) => {
    element.disabled = disabled;
  });
}

function parseInteger(value, { label, allowNegative = false } = {}) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, '');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” wymaga liczby całkowitej.`);
  }
  if (!allowNegative && parsed < 0) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” nie może być liczbą ujemną.`);
  }
  return parsed;
}

function parseDecimal(value, { label, precision = null, allowNegative = true } = {}) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” wymaga liczby.`);
  }
  if (!allowNegative && parsed < 0) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” nie może być liczbą ujemną.`);
  }
  if (precision !== null && Number.isFinite(precision)) {
    const factor = 10 ** precision;
    return Math.round(parsed * factor) / factor;
  }
  return parsed;
}

function normalizeTextarea(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\r\n/g, '\n');
  const trimmed = normalized.trim();
  return trimmed ? trimmed : null;
}

function normalizeImageList(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const parts = value
    .split(/[\n;,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) {
    return null;
  }
  return parts.join(';');
}

const FIELD_CONFIG = [
  { name: 'name', label: 'Nazwa świetlicy', type: 'text', required: true },
  { name: 'postal_code', label: 'Kod pocztowy', type: 'text' },
  { name: 'city', label: 'Miejscowość', type: 'text' },
  { name: 'address_line1', label: 'Adres — linia 1', type: 'text' },
  { name: 'address_line2', label: 'Adres — linia 2', type: 'text' },
  { name: 'capacity', label: 'Pojemność', type: 'integer' },
  { name: 'price_per_hour', label: 'Cena za godzinę', type: 'decimal', precision: 2, allowNegative: false },
  { name: 'price_per_day', label: 'Cena za dobę', type: 'decimal', precision: 2, allowNegative: false },
  { name: 'lat', label: 'Szerokość geograficzna', type: 'decimal', precision: 6 },
  { name: 'lng', label: 'Długość geograficzna', type: 'decimal', precision: 6 },
  { name: 'description', label: 'Opis', type: 'textarea' },
  { name: 'image_urls', label: 'Adresy URL zdjęć', type: 'imageList' },
];

function collectPayload(form) {
  const formData = new FormData(form);
  const payload = {};

  for (const field of FIELD_CONFIG) {
    const raw = formData.get(field.name);
    if (raw === null) {
      continue;
    }
    if (field.type === 'textarea') {
      const normalized = normalizeTextarea(String(raw));
      if (normalized !== null) {
        payload[field.name] = normalized;
      } else if (field.required) {
        throw new Error(`Pole „${field.label}” jest wymagane.`);
      }
      continue;
    }
    if (field.type === 'imageList') {
      const normalized = normalizeImageList(String(raw));
      if (normalized !== null) {
        payload[field.name] = normalized;
      }
      continue;
    }
    const value = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!value) {
      if (field.required) {
        throw new Error(`Pole „${field.label}” jest wymagane.`);
      }
      continue;
    }
    if (field.type === 'integer') {
      const parsed = parseInteger(value, { label: field.label, allowNegative: field.allowNegative === true });
      if (parsed !== null) {
        payload[field.name] = parsed;
      }
      continue;
    }
    if (field.type === 'decimal') {
      const parsed = parseDecimal(value, {
        label: field.label,
        precision: field.precision ?? null,
        allowNegative: field.allowNegative !== undefined ? field.allowNegative : true,
      });
      if (parsed !== null) {
        payload[field.name] = parsed;
      }
      continue;
    }
    // default text field
    payload[field.name] = value;
  }

  if (!payload.name || !payload.name.trim()) {
    throw new Error('Uzupełnij nazwę świetlicy.');
  }

  return payload;
}

export function initFacilityForm({
  session = null,
  supabase: suppliedSupabase,
  form = document.getElementById('addFacilityForm'),
  submitButton = document.getElementById('addFacilitySubmit'),
  messageElement = document.getElementById('addFacilityMessage'),
  onFacilityCreated,
  caretakerId: suppliedCaretakerId,
} = {}) {
  const supabase = suppliedSupabase || session?.supabase || null;
  const caretakerId =
    suppliedCaretakerId !== undefined ? suppliedCaretakerId : session?.caretakerId ?? null;
  if (!form) {
    return { destroy() {}, reset() {} };
  }

  if (!supabase) {
    setMessage(messageElement, 'Brak konfiguracji Supabase. Uzupełnij dane połączenia.', 'error');
    toggleFormDisabled(form, true);
    return { destroy() {}, reset() {} };
  }

  const state = { isSaving: false };

  function focusFirstField() {
    const firstInput = form.querySelector('input[name="name"]');
    firstInput?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.isSaving) {
      return;
    }
    let payload;
    try {
      payload = collectPayload(form);
    } catch (validationError) {
      setMessage(messageElement, validationError.message, 'error');
      return;
    }

    state.isSaving = true;
    toggleFormDisabled(form, true);
    setMessage(messageElement, 'Zapisywanie nowej świetlicy...', 'info');

    try {
      const { data, error } = await supabase.from('facilities').insert(payload);
      if (error) {
        throw error;
      }
      const insertedFacility = Array.isArray(data) ? data[0] : data || null;
      form.reset();
      focusFirstField();

      let assignmentMessage = '';
      if (caretakerId && insertedFacility?.id) {
        const shouldAssign = window.confirm('Potwierdź przypisanie do opiekuna.');
        if (shouldAssign) {
          try {
            const { error: assignError } = await supabase.from('facility_caretakers').insert([
              {
                caretaker_id: caretakerId,
                facility_id: insertedFacility.id,
              },
            ]);
            if (assignError) {
              throw assignError;
            }
            assignmentMessage = ' Świetlica została przypisana do Twojego konta.';
          } catch (assignError) {
            console.error('Nie udało się przypisać świetlicy do opiekuna:', assignError);
            assignmentMessage =
              ' Nie udało się automatycznie przypisać świetlicy do opiekuna. Możesz spróbować ponownie później w panelu.';
          }
        }
      }

      setMessage(
        messageElement,
        `Świetlica została dodana. Możesz teraz uzupełnić jej szczegóły.${assignmentMessage}`,
        'success',
      );
      if (typeof onFacilityCreated === 'function') {
        try {
          await onFacilityCreated(insertedFacility);
        } catch (callbackError) {
          console.error('Błąd podczas odświeżania listy świetlic:', callbackError);
        }
      }
      document.dispatchEvent(
        new CustomEvent('facilities:changed', {
          detail: { action: 'insert', facility: insertedFacility },
        }),
      );
    } catch (error) {
      console.error('Nie udało się dodać świetlicy:', error);
      setMessage(messageElement, error?.message || 'Nie udało się dodać świetlicy.', 'error');
    } finally {
      state.isSaving = false;
      toggleFormDisabled(form, false);
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  }

  form.addEventListener('submit', handleSubmit);

  return {
    reset() {
      form.reset();
      focusFirstField();
      setMessage(messageElement, '', 'info');
    },
    destroy() {
      form.removeEventListener('submit', handleSubmit);
    },
  };
}

