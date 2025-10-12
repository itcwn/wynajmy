import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2';

type QueueEvent = {
  id: string;
  event_type: string;
  booking_id: string | null;
  cancel_token: string | null;
  metadata: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
};

type DispatchResult = {
  id: string;
  status: 'succeeded' | 'failed' | 'exhausted';
  error?: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const notificationFunctionName =
  Deno.env.get('BOOKING_NOTIFICATION_FUNCTION') ?? 'send-booking-notifications';
const functionsBaseUrl =
  Deno.env.get('SUPABASE_FUNCTIONS_URL') ?? (supabaseUrl ? `${supabaseUrl}/functions/v1` : null);
const configuredBatchSize = Number(Deno.env.get('BOOKING_NOTIFICATION_BATCH') ?? '10');
const defaultBatchSize = Number.isFinite(configuredBatchSize) && configuredBatchSize > 0 ? configuredBatchSize : 10;

if (!supabaseUrl || !serviceRoleKey || !functionsBaseUrl) {
  throw new Error(
    'Missing Supabase configuration. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and optionally SUPABASE_FUNCTIONS_URL.',
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function resolveBatchSize(request: Request): number {
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    if (!limit) {
      return defaultBatchSize;
    }
    const parsed = Number.parseInt(limit, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return defaultBatchSize;
    }
    return Math.min(parsed, 50);
  } catch (_error) {
    return defaultBatchSize;
  }
}

async function dequeueEvents(limit: number): Promise<QueueEvent[]> {
  const { data, error } = await supabaseAdmin.rpc('dequeue_booking_notification_events', {
    p_limit: limit,
  });
  if (error) {
    throw error;
  }
  return (data as QueueEvent[]) ?? [];
}

async function invokeNotificationFunction(event: QueueEvent): Promise<void> {
  const url = `${functionsBaseUrl.replace(/\/$/, '')}/${notificationFunctionName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      eventType: event.event_type,
      bookingId: event.booking_id,
      cancelToken: event.cancel_token,
      metadata: event.metadata ?? null,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`send-booking-notifications responded with ${response.status}: ${text}`);
  }
}

async function markSuccess(eventId: string): Promise<void> {
  await supabaseAdmin
    .from('booking_notification_events')
    .update({
      status: 'succeeded',
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', eventId);
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function markFailure(event: QueueEvent, error: unknown): Promise<'failed' | 'exhausted'> {
  const message = normalizeErrorMessage(error).slice(0, 1000);
  const remainingAttempts = (event.max_attempts ?? 5) - (event.attempts ?? 0);
  const status = remainingAttempts > 0 ? 'failed' : 'exhausted';
  await supabaseAdmin
    .from('booking_notification_events')
    .update({
      status,
      last_error: message,
    })
    .eq('id', event.id);
  return status;
}

Deno.serve(async (request: Request) => {
  try {
    const limit = resolveBatchSize(request);
    const events = await dequeueEvents(limit);
    if (!events.length) {
      return jsonResponse({ ok: true, processed: [], message: 'No events to process.' });
    }

    const results: DispatchResult[] = [];

    for (const event of events) {
      try {
        await invokeNotificationFunction(event);
        await markSuccess(event.id);
        results.push({ id: event.id, status: 'succeeded' });
      } catch (error) {
        console.error('Failed to process notification event', event.id, error);
        const status = await markFailure(event, error);
        const entry: DispatchResult = {
          id: event.id,
          status,
          error: normalizeErrorMessage(error),
        };
        results.push(entry);
      }
    }

    return jsonResponse({ ok: true, processed: results });
  } catch (error) {
    console.error('Notification dispatcher error', error);
    return jsonResponse({
      ok: false,
      error: normalizeErrorMessage(error),
    }, { status: 500 });
  }
});
