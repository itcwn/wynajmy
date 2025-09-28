const SUPPORTED_EVENTS = new Set([
  'booking_created',
  'booking_status_decided',
  'booking_cancelled_by_renter',
]);

function normalizePayload(eventType, options = {}) {
  const payload = { eventType };
  if (options.bookingId) {
    payload.bookingId = String(options.bookingId);
  }
  if (options.cancelToken) {
    payload.cancelToken = String(options.cancelToken);
  }
  if (options.metadata && typeof options.metadata === 'object') {
    payload.metadata = options.metadata;
  }
  return payload;
}

export async function triggerBookingNotification(
  supabase,
  eventType,
  options = {},
) {
  if (!SUPPORTED_EVENTS.has(eventType)) {
    console.warn('Nieznany typ zdarzenia powiadomienia:', eventType);
    return { error: new Error('UNSUPPORTED_EVENT') };
  }
  if (!supabase || !supabase.functions || typeof supabase.functions.invoke !== 'function') {
    console.warn('Brak wsparcia Supabase Functions w bieżącej instancji klienta.');
    return { error: new Error('FUNCTIONS_NOT_AVAILABLE') };
  }
  try {
    const { data, error } = await supabase.functions.invoke(
      'send-booking-notifications',
      {
        body: normalizePayload(eventType, options),
      },
    );
    if (error) {
      throw error;
    }
    return { data: data ?? null };
  } catch (error) {
    console.warn('Nie udało się wysłać powiadomienia e-mail.', error);
    return { error };
  }
}

export const BOOKING_NOTIFICATION_EVENTS = Object.freeze({
  CREATED: 'booking_created',
  STATUS_DECIDED: 'booking_status_decided',
  CANCELLED_BY_RENTER: 'booking_cancelled_by_renter',
});
