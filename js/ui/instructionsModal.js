import { getInstructionText } from '../utils/instructions.js';

export function createInstructionsModal({ state, domUtils }) {
  const { $ } = domUtils;
  let listenersAttached = false;

  function getModal() {
    return $('#instructionsModal');
  }

  function getTrigger() {
    return $('#openFacilityInstructions');
  }

  function getContent() {
    return $('#instructionsContent');
  }

  function getEditLink() {
    return $('#editInstructionsLink');
  }

  function closeModal() {
    const modal = getModal();
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  function updateTriggerState(facility) {
    const trigger = getTrigger();
    if (!trigger) {
      return;
    }
    if (facility) {
      trigger.disabled = false;
      trigger.setAttribute('aria-disabled', 'false');
      const text = (getInstructionText(facility) || '').trim();
      trigger.title = text
        ? 'Zobacz instrukcję od opiekuna'
        : 'Dodaj instrukcję od opiekuna';
      trigger.dataset.hasInstructions = text ? '1' : '0';
      if (text) {
        trigger.classList.add('bg-amber-500', 'text-white');
        trigger.classList.remove('bg-white', 'text-amber-700', 'border', 'border-amber-300');
      } else {
        trigger.classList.add('bg-white', 'text-amber-700', 'border', 'border-amber-300');
        trigger.classList.remove('bg-amber-500', 'text-white');
      }
    } else {
      trigger.disabled = true;
      trigger.setAttribute('aria-disabled', 'true');
      trigger.title = 'Wybierz obiekt, aby zobaczyć instrukcję';
      trigger.dataset.hasInstructions = '0';
      trigger.classList.add('bg-amber-500', 'text-white');
      trigger.classList.remove('bg-white', 'text-amber-700', 'border', 'border-amber-300');
    }
  }

  function updateEditLink(facility) {
    const editLink = getEditLink();
    if (!editLink) {
      return;
    }
    if (facility && facility.id !== undefined && facility.id !== null) {
      editLink.href = `./caretakerFacilityEdit.html?facility=${encodeURIComponent(facility.id)}`;
      editLink.classList.remove('pointer-events-none', 'opacity-50');
    } else {
      editLink.href = './caretakerPanel.html';
      editLink.classList.add('pointer-events-none', 'opacity-50');
    }
  }

  function updateContent(facility = state.selectedFacility) {
    const content = getContent();
    updateTriggerState(facility);
    updateEditLink(facility);
    if (!content) {
      return;
    }
    if (!facility) {
      content.textContent = 'Najpierw wybierz obiekt z listy obok.';
      content.classList.add('text-gray-500');
      return;
    }
    const text = (getInstructionText(facility) || '').trim();
    if (text) {
      content.textContent = text;
      content.classList.remove('text-gray-500');
    } else {
      content.textContent = 'Brak instrukcji dodanych przez opiekuna dla tego obiektu.';
      content.classList.add('text-gray-500');
    }
  }

  function openModal() {
    if (!state.selectedFacility) {
      return;
    }
    const modal = getModal();
    if (!modal) {
      return;
    }
    updateContent(state.selectedFacility);
    modal.classList.remove('hidden');
  }

  function attachListeners() {
    if (listenersAttached) {
      return;
    }
    listenersAttached = true;
    updateContent(state.selectedFacility);
    const trigger = getTrigger();
    if (trigger) {
      trigger.addEventListener('click', openModal);
    }
    const closeBtn = $('#closeInstructionsModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
    const modal = getModal();
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          closeModal();
        }
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !getModal()?.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  return {
    attachListeners,
    closeModal,
    openModal,
    updateContent,
  };
}
