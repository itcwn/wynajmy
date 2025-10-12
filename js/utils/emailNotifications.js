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
  if (!supabase || typeof supabase.rpc !== 'function') {
    console.warn('Brak klienta Supabase lub metody RPC do obsługi kolejki powiadomień.');
    return { error: new Error('RPC_NOT_AVAILABLE') };
  }
  try {
    const normalized = normalizePayload(eventType, options);
    const { data, error } = await supabase.rpc('enqueue_booking_notification', {
      p_event_type: normalized.eventType,
      p_booking_id: normalized.bookingId ?? null,
      p_cancel_token: normalized.cancelToken ?? null,
      p_metadata: normalized.metadata ?? null,
    });
    if (error) {
      throw error;
    }
    return { data: data ?? null };
  } catch (error) {
    console.warn('Nie udało się dodać powiadomienia e-mail do kolejki.', error);
    return { error };
  }
}

export const BOOKING_NOTIFICATION_EVENTS = Object.freeze({
  CREATED: 'booking_created',
  STATUS_DECIDED: 'booking_status_decided',
  CANCELLED_BY_RENTER: 'booking_cancelled_by_renter',
});
