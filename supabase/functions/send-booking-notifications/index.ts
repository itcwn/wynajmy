import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2';

type NotificationEvent =
  | 'booking_created'
  | 'booking_status_decided'
  | 'booking_cancelled_by_renter';

type BookingPayload = {
  booking: {
    id: string;
    facility_id: string;
    title: string | null;
    start_time: string;
    end_time: string;
    status: string;
    renter_name: string | null;
    renter_email: string | null;
    notes: string | null;
    cancel_token: string | null;
    created_at: string;
    updated_at: string;
  };
  facility: {
    id: string;
    name: string | null;
    city: string | null;
    postal_code: string | null;
    address_line1: string | null;
    address_line2: string | null;
    rental_rules_url: string | null;
    price_list_url: string | null;
    caretaker_instructions: string | null;
  } | null;
  caretakers: Array<{
    id: string;
    first_name: string | null;
    last_name_or_company: string | null;
    email: string | null;
    phone: string | null;
    login: string | null;
  }>;
};

type EventRequest = {
  eventType: NotificationEvent;
  bookingId?: string | null;
  cancelToken?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MessagePlan = {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string | null;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
const senderEmail = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'onboarding@resend.dev';
const senderName = Deno.env.get('NOTIFY_FROM_NAME') ?? 'System rezerwacji świetlic';
const appBaseUrlRaw = Deno.env.get('APP_BASE_URL') ?? '';
const caretakerPanelPath = Deno.env.get('CARETAKER_PANEL_PATH') ?? '/caretakerPanel.html';
const bookingPagePath = Deno.env.get('BOOKING_PAGE_PATH') ?? '/';
const checklistPath = Deno.env.get('CHECKLIST_PATH') ?? '/checklistReport.html';
const defaultTimeZone = Deno.env.get('BOOKING_TIMEZONE') ?? 'Europe/Warsaw';
const dryRun = (Deno.env.get('NOTIFY_DRY_RUN') ?? '').toLowerCase() === 'true';

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

if (!resendApiKey) {
  console.warn('Missing RESEND_API_KEY. Outgoing e-mails will fail without configuration.');
}

if (!Deno.env.get('NOTIFY_FROM_EMAIL')) {
  console.warn('Missing NOTIFY_FROM_EMAIL. Using default onboarding@resend.dev sender address.');
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

function buildFromHeader(): string {
  if (senderName) {
    return `${senderName} <${senderEmail}>`;
  }
  return senderEmail;
}

function sanitizeUrl(base: string, path: string, search = ''): string | null {
  if (!base) {
    return null;
  }
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);
  if (search) {
    url.search = search;
  }
  return url.toString();
}

function formatAddress(facility: BookingPayload['facility']): string {
  if (!facility) {
    return '';
  }
  const segments: string[] = [];
  if (facility.address_line1) {
    segments.push(facility.address_line1);
  }
  if (facility.address_line2) {
    segments.push(facility.address_line2);
  }
  const cityParts: string[] = [];
  if (facility.postal_code) {
    cityParts.push(facility.postal_code);
  }
  if (facility.city) {
    cityParts.push(facility.city);
  }
  if (cityParts.length) {
    segments.push(cityParts.join(' '));
  }
  return segments.join(', ');
}

function getCaretakerEmails(payload: BookingPayload): string[] {
  return payload.caretakers
    .map((caretaker) => caretaker.email?.trim())
    .filter((email): email is string => Boolean(email));
}

function formatCaretakerNames(payload: BookingPayload): string {
  const names = payload.caretakers
    .map((caretaker) => {
      const first = caretaker.first_name?.trim();
      const last = caretaker.last_name_or_company?.trim();
      if (first && last) {
        return `${first} ${last}`;
      }
      return first || last || caretaker.email || '';
    })
    .filter(Boolean);
  return names.join(', ');
}

function formatDateRange(startIso: string, endIso: string, timeZone: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} – ${endIso}`;
  }
  const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'full',
    timeZone,
  });
  const timeFormatter = new Intl.DateTimeFormat('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);
  if (startDate === endDate) {
    return `${startDate}, ${startTime} – ${endTime}`;
  }
  return `${startDate} ${startTime} – ${endDate} ${endTime}`;
}

function buildLinks(payload: BookingPayload) {
  const base = appBaseUrlRaw.replace(/\/+$/, '');
  const bookingToken = payload.booking.cancel_token ?? '';
  const bookingId = payload.booking.id;
  const bookingSearch = bookingToken ? `booking=${bookingToken}` : '';
  const checklistSearch = `booking=${bookingId}`;
  return {
    publicBookingUrl: bookingSearch ? sanitizeUrl(base, bookingPagePath, bookingSearch) : null,
    caretakerPanelUrl: sanitizeUrl(base, caretakerPanelPath),
    checklistUrl: sanitizeUrl(base, checklistPath, checklistSearch),
  };
}

function buildCommonLines(payload: BookingPayload, timeZone: string): string[] {
  const lines: string[] = [];
  const { booking, facility } = payload;
  const dateLabel = formatDateRange(booking.start_time, booking.end_time, timeZone);
  lines.push(`Obiekt: ${facility?.name ?? '—'}`);
  const address = formatAddress(facility);
  if (address) {
    lines.push(`Adres: ${address}`);
  }
  lines.push(`Termin: ${dateLabel}`);
  if (booking.renter_name) {
    lines.push(`Rezerwujący: ${booking.renter_name}${booking.renter_email ? ` (${booking.renter_email})` : ''}`);
  } else if (booking.renter_email) {
    lines.push(`Kontakt rezerwującego: ${booking.renter_email}`);
  }
  if (booking.notes) {
    lines.push('Uwagi rezerwującego:');
    lines.push(booking.notes);
  }
  return lines;
}

// Teksty wiadomości dla opiekunów – w razie potrzeby można dostosować poniższe linie/układ.
function buildCaretakerMessage(payload: BookingPayload, event: NotificationEvent, timeZone: string, metadata: Record<string, unknown> | null, links: ReturnType<typeof buildLinks>): MessagePlan | null {
  const caretakers = getCaretakerEmails(payload);
  if (!caretakers.length) {
    return null;
  }
  const lines = buildCommonLines(payload, timeZone);
  const caretakerNames = formatCaretakerNames(payload);
  if (caretakerNames) {
    lines.unshift(`Opiekunowie obiektu: ${caretakerNames}`);
  }
  if (links.caretakerPanelUrl) {
    lines.push(`Panel opiekuna: ${links.caretakerPanelUrl}`);
  }
  if (links.publicBookingUrl) {
    lines.push(`Podgląd zgłoszenia (strona główna z automatycznym wczytaniem): ${links.publicBookingUrl}`);
  }
  if (links.checklistUrl) {
    lines.push(`Raport przekazania/zdania obiektu: ${links.checklistUrl}`);
  }
  if (payload.facility?.caretaker_instructions) {
    lines.push('Instrukcje opiekuna (widoczne publicznie):');
    lines.push(payload.facility.caretaker_instructions);
  }

  if (event === 'booking_status_decided') {
    const status = String(metadata?.status ?? payload.booking.status ?? '').toLowerCase();
    if (status === 'active') {
      lines.unshift('Status: rezerwacja zaakceptowana.');
    } else if (status === 'rejected' || status === 'declined' || status === 'cancelled') {
      lines.unshift('Status: rezerwacja odrzucona/anulowana.');
    }
    const comment = typeof metadata?.comment === 'string' ? metadata.comment.trim() : '';
    if (comment) {
      lines.push('Komentarz opiekuna:');
      lines.push(comment);
    }
  } else if (event === 'booking_cancelled_by_renter') {
    lines.unshift('Status: rezerwacja anulowana przez mieszkańca.');
  } else {
    lines.unshift('Status: nowe zgłoszenie rezerwacji oczekuje na decyzję.');
  }

  const subjectBase = payload.facility?.name ?? 'świetlica';
  let subject = `Rezerwacja – ${subjectBase}`;
  if (event === 'booking_created') {
    subject = `Nowa rezerwacja oczekuje na decyzję – ${subjectBase}`;
  } else if (event === 'booking_status_decided') {
    const status = String(metadata?.status ?? payload.booking.status ?? '').toLowerCase();
    subject = status === 'active'
      ? `Rezerwacja potwierdzona – ${subjectBase}`
      : `Rezerwacja odrzucona/anulowana – ${subjectBase}`;
  } else if (event === 'booking_cancelled_by_renter') {
    subject = `Rezerwacja anulowana przez mieszkańca – ${subjectBase}`;
  }

  return {
    to: caretakers,
    subject,
    text: lines.join('\n\n'),
    replyTo: caretakers[0] ?? null,
  };
}

// Teksty wiadomości dla rezerwującego – można je edytować według potrzeb projektu.
function buildRenterMessage(payload: BookingPayload, event: NotificationEvent, timeZone: string, metadata: Record<string, unknown> | null, links: ReturnType<typeof buildLinks>): MessagePlan | null {
  const renterEmail = payload.booking.renter_email?.trim();
  if (!renterEmail) {
    return null;
  }
  const caretakerEmails = getCaretakerEmails(payload);
  const caretakerNames = formatCaretakerNames(payload);
  const lines = buildCommonLines(payload, timeZone);
  const facilityName = payload.facility?.name ?? 'świetlica';
  if (event === 'booking_created') {
    lines.unshift('Twoje zgłoszenie zostało zapisane i oczekuje na potwierdzenie opiekuna obiektu.');
    if (caretakerNames || caretakerEmails.length) {
      lines.push(`Opiekun odpowiedzialny za obiekt: ${caretakerNames || caretakerEmails.join(', ')}`);
    }
    if (links.publicBookingUrl) {
      lines.push(`Podgląd zgłoszenia i anulowanie (strona główna): ${links.publicBookingUrl}`);
    }
    if (links.checklistUrl) {
      lines.push(`Formularz przekazania/zdania obiektu: ${links.checklistUrl}`);
    }
  } else if (event === 'booking_status_decided') {
    const status = String(metadata?.status ?? payload.booking.status ?? '').toLowerCase();
    if (status === 'active') {
      lines.unshift('Opiekun zaakceptował Twoją rezerwację.');
      if (links.checklistUrl) {
        lines.push(`Przygotuj raport przekazania/zdania obiektu: ${links.checklistUrl}`);
      }
    } else {
      lines.unshift('Niestety opiekun odrzucił Twoją rezerwację.');
    }
    const comment = typeof metadata?.comment === 'string' ? metadata.comment.trim() : '';
    if (comment) {
      lines.push('Komentarz od opiekuna:');
      lines.push(comment);
    }
    if (links.publicBookingUrl) {
      lines.push(`Szczegóły rezerwacji: ${links.publicBookingUrl}`);
    }
  } else if (event === 'booking_cancelled_by_renter') {
    lines.unshift('Potwierdzamy anulowanie rezerwacji.');
    if (links.publicBookingUrl) {
      lines.push(`Zapis zmian możesz sprawdzić tutaj: ${links.publicBookingUrl}`);
    }
  }
  if (payload.facility?.caretaker_instructions) {
    lines.push('Instrukcje obiektu:');
    lines.push(payload.facility.caretaker_instructions);
  }

  const subject = (() => {
    if (event === 'booking_created') {
      return `Potwierdzenie zgłoszenia rezerwacji – ${facilityName}`;
    }
    if (event === 'booking_status_decided') {
      const status = String(metadata?.status ?? payload.booking.status ?? '').toLowerCase();
      return status === 'active'
        ? `Rezerwacja zaakceptowana – ${facilityName}`
        : `Rezerwacja odrzucona – ${facilityName}`;
    }
    return `Potwierdzenie anulowania rezerwacji – ${facilityName}`;
  })();

  return {
    to: [renterEmail],
    subject,
    text: lines.join('\n\n'),
    replyTo: caretakerEmails[0] ?? senderEmail,
  };
}

function buildMessages(payload: BookingPayload, event: NotificationEvent, metadata: Record<string, unknown> | null): MessagePlan[] {
  const timeZone = typeof metadata?.timeZone === 'string' && metadata.timeZone
    ? metadata.timeZone
    : defaultTimeZone;
  const links = buildLinks(payload);
  const plans: MessagePlan[] = [];
  const caretakerMessage = buildCaretakerMessage(payload, event, timeZone, metadata, links);
  if (caretakerMessage) {
    plans.push(caretakerMessage);
  }
  const renterMessage = buildRenterMessage(payload, event, timeZone, metadata, links);
  if (renterMessage) {
    plans.push(renterMessage);
  }
  return plans;
}

async function fetchBookingPayload(request: EventRequest): Promise<BookingPayload | null> {
  const { bookingId, cancelToken } = request;
  if (!bookingId && !cancelToken) {
    return null;
  }
  const { data, error } = await supabaseAdmin.rpc('get_booking_notification_payload', {
    p_booking_id: bookingId ?? null,
    p_cancel_token: cancelToken ?? null,
  });
  if (error) {
    throw new Error(`Failed to load booking payload: ${error.message}`);
  }
  return (data ?? null) as BookingPayload | null;
}

async function sendMessages(event: NotificationEvent, plans: MessagePlan[]) {
  if (!plans.length) {
    return { sent: 0 };
  }
  if (dryRun) {
    console.log('[DRY RUN] Powiadomienia e-mail', event, plans);
    return { sent: plans.length, dryRun: true };
  }
  if (!resendApiKey) {
    throw new Error('Resend API key is missing. Configure RESEND_API_KEY.');
  }
  let sentCount = 0;
  for (const plan of plans) {
    if (!plan.to.length) {
      continue;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: buildFromHeader(),
        to: plan.to,
        subject: plan.subject,
        text: plan.text,
        html: plan.text.replace(/\n/g, '<br>'),
        ...(plan.replyTo ? { reply_to: plan.replyTo } : {}),
        headers: {
          'X-Booking-Event': event,
        },
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Resend API error (${response.status}): ${errorBody}`);
    }
    sentCount += 1;
  }
  return { sent: sentCount };
}

async function handleRequest(request: Request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 });
  }
  let payload: EventRequest;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (!payload || typeof payload.eventType !== 'string') {
    return jsonResponse({ error: 'eventType is required' }, { status: 400 });
  }
  const event = payload.eventType as NotificationEvent;
  if (!['booking_created', 'booking_status_decided', 'booking_cancelled_by_renter'].includes(event)) {
    return jsonResponse({ error: 'Unsupported event type' }, { status: 400 });
  }
  try {
    const bookingPayload = await fetchBookingPayload(payload);
    if (!bookingPayload) {
      return jsonResponse({ error: 'Booking not found' }, { status: 404 });
    }
    const metadata = payload.metadata && typeof payload.metadata === 'object'
      ? payload.metadata as Record<string, unknown>
      : null;
    const plans = buildMessages(bookingPayload, event, metadata);
    if (!plans.length) {
      return jsonResponse({ ok: true, message: 'No recipients for notification.' });
    }
    const result = await sendMessages(event, plans);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    console.error('Błąd wysyłki powiadomień:', error);
    return jsonResponse({ error: (error as Error).message }, { status: 500 });
  }
}

Deno.serve(handleRequest);
