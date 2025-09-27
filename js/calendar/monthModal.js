export function createMonthModal({ state, supabase, renderDay, setDayPickerFromCurrent }) {
  let fcInstance = null;
  let listenersAttached = false;

  function isAllDayRange(startDate, endDate) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      return false;
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      return false;
    }
    const startIsMidnight = startDate.getHours() === 0 && startDate.getMinutes() === 0;
    const endIsBeforeMidnight = endDate.getHours() === 23 && endDate.getMinutes() >= 59;
    const endIsMidnightNextDay = endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate > startDate;
    const msInDay = 24 * 60 * 60 * 1000;
    const duration = endDate.getTime() - startDate.getTime();
    const almostDay = Math.abs(duration - msInDay) <= 60 * 1000 || Math.abs(duration - (msInDay - 1000)) <= 60 * 1000;
    return startIsMidnight && (endIsBeforeMidnight || (endIsMidnightNextDay && almostDay));
  }

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
        const startDate = ev.start ? new Date(ev.start) : null;
        const endDate = ev.end ? new Date(ev.end) : null;
        const isAllDay = startDate && endDate ? isAllDayRange(startDate, endDate) : false;
        const startLabel = startDate
          ? (isAllDay
            ? startDate.toLocaleDateString('pl-PL', { dateStyle: 'medium' })
            : startDate.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }))
          : '';
        const endLabel = endDate
          ? (isAllDay
            ? endDate.toLocaleDateString('pl-PL', { dateStyle: 'medium' })
            : endDate.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }))
          : '';
        const sameDayRange = isAllDay && startLabel && endLabel && startLabel === endLabel;
        alert(
          `${ev.title}\n`
          + (startLabel
            ? (isAllDay
              ? (sameDayRange ? `Dzień: ${startLabel}\n` : `Od: ${startLabel}\n`)
              : `Od: ${startLabel}\n`)
            : '')
          + (endLabel && (!isAllDay || !sameDayRange)
            ? `Do: ${endLabel}\n`
            : '')
          + (isAllDay ? 'Rodzaj: rezerwacja dobowa\n' : '')
          + (ev.extendedProps?.renter ? `Najemca: ${ev.extendedProps.renter}\n` : '')
          + (ev.extendedProps?.status ? `Status: ${ev.extendedProps.status}\n` : '')
          + (ev.extendedProps?.notes ? `Uwagi: ${ev.extendedProps.notes}` : '')
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
