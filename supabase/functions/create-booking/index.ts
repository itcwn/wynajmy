import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2';

type CreateBookingPayload = {
  facility_id: string;
  title?: string | null;
  event_type_id?: string | null;
  start_time: string;
  end_time: string;
  renter_name: string;
  renter_email: string;
  notes?: string | null;
};

type FacilityRow = {
  id: string;
  tenant_id: string;
};

type BookingRow = {
  id: string;
  cancel_token: string | null;
  renter_email: string | null;
  renter_name: string | null;
  notes: string | null;
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase configuration for create-booking function.');
}

const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function extractIp(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  let value = raw.trim();
  if (!value) {
    return null;
  }
  if (value.includes(',')) {
    value = value.split(',')[0]?.trim() ?? '';
  }
  const forwardedMatch = value.match(/for="?([^;"\s]+)/i);
  if (forwardedMatch) {
    value = forwardedMatch[1];
  }
  value = value.replace(/^for=/i, '');
  value = value.replace(/^"|"$/g, '');
  value = value.replace(/^[\[]|[\]]$/g, '');
  if (value.includes(':')) {
    const ipv6WithPort = value.match(/^([0-9a-fA-F:]+):(\d+)$/);
    if (ipv6WithPort) {
      value = ipv6WithPort[1];
    } else if (value.includes('.') && value.split(':').length === 2) {
      value = value.split(':')[0] ?? value;
    }
  }
  const percentIndex = value.indexOf('%');
  if (percentIndex > 0) {
    value = value.slice(0, percentIndex);
  }
  return value.trim() || null;
}

function getClientIp(request: Request): string | null {
  const headerOrder = [
    'x-forwarded-for',
    'forwarded',
    'cf-connecting-ip',
    'x-client-ip',
    'x-real-ip',
    'fly-client-ip',
  ];
  for (const headerName of headerOrder) {
    const candidate = extractIp(request.headers.get(headerName));
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized : null;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

async function fetchFacility(facilityId: string): Promise<FacilityRow | null> {
  const { data, error } = await supabaseService
    .from('facilities')
    .select('id, tenant_id')
    .eq('id', facilityId)
    .maybeSingle();
  if (error) {
    console.error('create-booking: error fetching facility', error);
    return null;
  }
  return data ?? null;
}

function createTenantClient(tenantId: string) {
  return createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false },
    global: {
      headers: {
        'x-tenant-id': tenantId,
      },
    },
  });
}

async function hasRecentRequest(client: ReturnType<typeof createTenantClient>, requestIp: string): Promise<boolean> {
  const windowStartIso = new Date(Date.now() - FIVE_MINUTES_MS).toISOString();
  const { data, error } = await client
    .from('booking_request_throttle')
    .select('id', { count: 'exact', head: false })
    .eq('request_ip', requestIp)
    .gte('created_at', windowStartIso)
    .limit(1);
  if (error) {
    console.error('create-booking: throttle check failed', error);
    throw new Error('Nie udało się zweryfikować limitu prób. Spróbuj ponownie później.');
  }
  return Array.isArray(data) && data.length > 0;
}

async function insertBooking(client: ReturnType<typeof createTenantClient>, payload: CreateBookingPayload): Promise<BookingRow> {
  const { data, error } = await client
    .from('bookings')
    .insert({
      facility_id: payload.facility_id,
      title: normalizeString(payload.title) || 'Rezerwacja',
      event_type_id: payload.event_type_id ? payload.event_type_id : null,
      start_time: payload.start_time,
      end_time: payload.end_time,
      renter_name: normalizeString(payload.renter_name),
      renter_email: normalizeString(payload.renter_email),
      notes: normalizeNullableString(payload.notes),
      is_public: true,
      status: 'pending',
    })
    .select('id, cancel_token, renter_email, renter_name, notes')
    .single();
  if (error || !data) {
    console.error('create-booking: insert failed', error);
    throw new Error(error?.message || 'Nie udało się zapisać rezerwacji.');
  }
  return data;
}

async function recordThrottleEntry(client: ReturnType<typeof createTenantClient>, requestIp: string, bookingId: string, userAgent: string | null) {
  const { error } = await client
    .from('booking_request_throttle')
    .insert({
      booking_id: bookingId,
      request_ip: requestIp,
      user_agent: userAgent,
    });
  if (error) {
    console.warn('create-booking: throttle log failed', error);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Metoda niedozwolona.' }, { status: 405 });
  }

  let payload: CreateBookingPayload;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('create-booking: invalid json body', error);
    return jsonResponse({ error: 'Nieprawidłowe dane żądania.' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return jsonResponse({ error: 'Nieprawidłowe dane żądania.' }, { status: 400 });
  }

  const facilityId = normalizeString(payload.facility_id);
  if (!isUuid(facilityId)) {
    return jsonResponse({ error: 'Nieprawidłowy identyfikator obiektu.' }, { status: 400 });
  }

  const renterName = normalizeString(payload.renter_name);
  const renterEmail = normalizeString(payload.renter_email);
  if (!renterName || !renterEmail) {
    return jsonResponse({ error: 'Imię i nazwisko oraz adres e-mail są wymagane.' }, { status: 400 });
  }

  const startDate = parseIsoDate(payload.start_time);
  const endDate = parseIsoDate(payload.end_time);
  if (!startDate || !endDate || endDate <= startDate) {
    return jsonResponse({ error: 'Nieprawidłowy przedział czasowy rezerwacji.' }, { status: 400 });
  }

  if (payload.event_type_id && !isUuid(payload.event_type_id)) {
    return jsonResponse({ error: 'Nieprawidłowy identyfikator rodzaju wydarzenia.' }, { status: 400 });
  }

  const requestIp = getClientIp(request);
  if (!requestIp) {
    return jsonResponse({ error: 'Nie udało się ustalić adresu IP.' }, { status: 400 });
  }

  const facility = await fetchFacility(facilityId);
  if (!facility) {
    return jsonResponse({ error: 'Nie znaleziono wskazanego obiektu.' }, { status: 404 });
  }

  const tenantClient = createTenantClient(facility.tenant_id);

  try {
    const throttled = await hasRecentRequest(tenantClient, requestIp);
    if (throttled) {
      return jsonResponse({ error: 'Zbyt wiele prób z tego adresu IP. Poczekaj 5 minut przed kolejną rezerwacją.' }, { status: 429 });
    }
  } catch (error) {
    console.error('create-booking: throttle check error', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Nie udało się zweryfikować limitu prób.' }, { status: 503 });
  }

  try {
    const booking = await insertBooking(tenantClient, { ...payload, facility_id: facilityId });
    const userAgent = normalizeNullableString(request.headers.get('user-agent'));
    await recordThrottleEntry(tenantClient, requestIp, booking.id, userAgent);
    return jsonResponse({ booking });
  } catch (error) {
    console.error('create-booking: booking insert error', error);
    const message = error instanceof Error ? error.message : 'Nie udało się zapisać rezerwacji.';
    return jsonResponse({ error: message }, { status: 400 });
  }
});
