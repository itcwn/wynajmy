export function createMonthModal({ state, supabase, renderDay, setDayPickerFromCurrent }) {
  let fcInstance = null;
  let listenersAttached = false;

  function closeFcModal() {
    const modal = document.getElementById('fcModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  function ensureCalendar() {
    if (fcInstance) {
      return fcInstance;
    }
    const container = document.getElementById('fullCalendar');
    if (!container) {
      return null;
    }
    fcInstance = new FullCalendar.Calendar(container, {
      initialDate: state.currentDate,
      locale: 'pl',
      firstDay: 1,
      height: 'auto',
      fixedWeekCount: false,
      headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
      buttonText: { today: 'Dziś' },
      events: async (info, success, failure) => {
        try {
          const { data, error } = await supabase
            .from('public_bookings')
            .select('*')
            .eq('facility_id', state.selectedFacility.id)
            .gte('start_time', new Date(info.startStr).toISOString())
            .lte('end_time', new Date(info.endStr).toISOString())
            .order('start_time');
          if (error) throw error;
          const events = (data || []).map((b) => {
            const status = (b.status || '').toLowerCase();
            const color = status === 'active' ? '#ef4444' : '#f59e0b';
            return {
              id: b.id,
              title: b.title || 'Rezerwacja',
              start: b.start_time,
              end: b.end_time,
              color,
              extendedProps: {
                status,
                renter: b.renter_name || '',
                notes: b.notes || '',
              },
            };
          });
          success(events);
        } catch (err) {
          console.error(err);
          failure(err);
        }
      },
      dateClick: (arg) => {
        state.currentDate = new Date(`${arg.dateStr}T00:00:00`);
        setDayPickerFromCurrent();
        void renderDay();
        closeFcModal();
      },
      eventClick: (info) => {
        const ev = info.event;
        const s = ev.start
          ? new Date(ev.start).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })
          : '';
        const e = ev.end
          ? new Date(ev.end).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })
          : '';
        alert(
          `${ev.title}\n` +
            (s ? `Od: ${s}\n` : '') +
            (e ? `Do: ${e}\n` : '') +
            (ev.extendedProps?.renter ? `Najemca: ${ev.extendedProps.renter}\n` : '') +
            (ev.extendedProps?.status ? `Status: ${ev.extendedProps.status}\n` : '') +
            (ev.extendedProps?.notes ? `Uwagi: ${ev.extendedProps.notes}` : '')
        );
      },
    });
    fcInstance.render();
    return fcInstance;
  }

  function openFcModal() {
    if (!state.selectedFacility) {
      return;
    }
    const modal = document.getElementById('fcModal');
    if (!modal) {
      return;
    }
    modal.classList.remove('hidden');
    const calendar = ensureCalendar();
    if (calendar) {
      calendar.gotoDate(state.currentDate);
      calendar.refetchEvents();
    }
  }

  function attachMonthModalListeners() {
    if (listenersAttached) {
      return;
    }
    listenersAttached = true;
    const openBtn = document.getElementById('openMonthPreview');
    if (openBtn) {
      openBtn.addEventListener('click', openFcModal);
    }
    const closeBtn = document.getElementById('closeFcModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeFcModal);
    }
    const modal = document.getElementById('fcModal');
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          closeFcModal();
        }
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !document.getElementById('fcModal')?.classList.contains('hidden')) {
        closeFcModal();
      }
    });
  }

  return { attachMonthModalListeners, closeFcModal, openFcModal };
}
