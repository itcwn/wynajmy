export const INSTRUCTION_FIELDS = [
  'caretaker_instructions',
  'caretaker_notes',
  'instructions',
  'instructions_text',
  'instructions_markdown',
  'booking_instructions',
  'guardian_instructions',
  'guardian_notes',
  'manager_instructions',
  'facility_instructions',
];

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

export function findInstructionInfo(facility) {
  if (!facility || typeof facility !== 'object') {
    return { field: null, text: '' };
  }
  if (facility.__instructionsColumn) {
    const rememberedValue = toText(facility[facility.__instructionsColumn]);
    if (rememberedValue.trim()) {
      return {
        field: facility.__instructionsColumn,
        text: rememberedValue,
      };
    }
  }
  for (const field of INSTRUCTION_FIELDS) {
    const value = facility[field];
    if (typeof value === 'string') {
      if (value.trim()) {
        facility.__instructionsColumn = field;
        return { field, text: value };
      }
    } else if (value !== null && value !== undefined) {
      const coerced = toText(value);
      if (coerced.trim()) {
        facility.__instructionsColumn = field;
        return { field, text: coerced };
      }
    }
  }
  return {
    field: facility.__instructionsColumn || null,
    text: facility.__instructionsColumn ? toText(facility[facility.__instructionsColumn]) : '',
  };
}

export function getInstructionText(facility) {
  return findInstructionInfo(facility).text;
}

export function rememberInstructionField(facility, field) {
  if (!facility || !field) {
    return;
  }
  facility.__instructionsColumn = field;
}

export function assignInstructionValue(facility, field, value) {
  if (!facility) {
    return;
  }
  const targetField = field || facility.__instructionsColumn;
  if (targetField) {
    facility[targetField] = value;
    facility.__instructionsColumn = targetField;
  }
}
