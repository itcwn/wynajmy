export function createBookingWizard({ state, domUtils }) {
  const { $ } = domUtils;
  let currentStep = 1;
  state.bookingWizardStep = state.bookingWizardStep || currentStep;

  function getSelectorsCard() {
    return $('#selectors');
  }

  function getBookingCard() {
    return $('#booking');
  }

  function getDayPicker() {
    return $('#dayPicker');
  }

  function getValidationMessage() {
    return $('#stepValidationMessage');
  }

  function updateDots(step) {
    document.querySelectorAll('.wizard-step-dot').forEach((dot) => {
      const targetStep = Number.parseInt(dot.dataset.wizardDot || '0', 10);
      dot.classList.remove('is-active', 'is-complete');
      if (!Number.isFinite(targetStep) || targetStep <= 0) {
        return;
      }
      if (targetStep < step) {
        dot.classList.add('is-complete');
      } else if (targetStep === step) {
        dot.classList.add('is-active');
      }
    });
  }

  function clearValidation() {
    const msg = getValidationMessage();
    if (msg) {
      msg.classList.add('hidden');
      msg.textContent = '';
    }
    const picker = getDayPicker();
    if (picker) {
      picker.classList.remove('border-red-300', 'ring-2', 'ring-red-300');
    }
  }

  function showValidation(message) {
    const msg = getValidationMessage();
    if (msg) {
      msg.textContent = message;
      msg.classList.remove('hidden');
    }
    const picker = getDayPicker();
    if (picker) {
      picker.classList.add('border-red-300', 'ring-2', 'ring-red-300');
    }
  }

  function validateBeforeStepTwo() {
    const picker = getDayPicker();
    if (!picker || !picker.value) {
      showValidation('Wybierz termin rezerwacji, aby przejść dalej.');
      return false;
    }
    clearValidation();
    return true;
  }

  function setStep(step, { focusForm = true } = {}) {
    currentStep = step;
    state.bookingWizardStep = step;
    const selectorsCard = getSelectorsCard();
    const bookingCard = getBookingCard();
    if (step <= 1) {
      if (bookingCard) {
        bookingCard.classList.add('hidden');
      }
      if (selectorsCard) {
        selectorsCard.classList.remove('hidden');
      }
    } else {
      if (bookingCard) {
        bookingCard.classList.remove('hidden');
        if (focusForm) {
          const nameInput = bookingCard.querySelector('input[name="renter_name"]');
          if (nameInput) {
            nameInput.focus({ preventScroll: false });
          }
        }
        bookingCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    updateDots(step);
  }

  function goToStep(step, options) {
    if (step === 2 && !validateBeforeStepTwo()) {
      return false;
    }
    setStep(step, options);
    return true;
  }

  function reset() {
    clearValidation();
    setStep(1, { focusForm: false });
  }

  function init() {
    const continueBtn = $('#goToBookingStep');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        void goToStep(2);
      });
    }
    const backBtn = $('#backToDates');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        reset();
        const selectorsCard = getSelectorsCard();
        selectorsCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const picker = getDayPicker();
    if (picker) {
      picker.addEventListener('input', () => {
        if (picker.value) {
          clearValidation();
        }
      });
    }
    updateDots(currentStep);
  }

  return {
    init,
    goToStep,
    reset,
    showForm: (options) => goToStep(2, options),
  };
}
