export class TarotError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'TarotError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function requireStringId(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TarotError('INVALID_REQUEST', `${field} must be a non-empty string.`, 400);
  }
  return value;
}

export function validatePositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new TarotError('INVALID_POSITIONS', 'positions must be a non-empty array.', 400);
  }
  if (positions.length > 128) {
    throw new TarotError('INVALID_POSITIONS', 'Too many positions in one draw.', 400);
  }

  const normalized = positions.map((value, index) => requireStringId(value, `positions[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new TarotError('INVALID_POSITIONS', 'position IDs must be unique within one draw.', 400);
  }
  return normalized;
}

/** Optional shuffle flag: omission preserves the legacy 80-card contract. */
export function validateIncludeCustom(value = true) {
  if (typeof value !== 'boolean') {
    throw new TarotError('INVALID_DECK_OPTIONS', 'include_custom must be boolean.', 400);
  }
  return value;
}

/** Reject malformed shuffle contracts before mutating any persisted session. */
export function validateShuffleOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TarotError('INVALID_DECK_OPTIONS', 'Shuffle settings must be an object.', 400);
  }
  const includeCustom = validateIncludeCustom(options.include_custom);
  const deckId = options.deck_id ?? 'B';
  if (deckId !== 'A' && deckId !== 'B') {
    throw new TarotError('INVALID_DECK_OPTIONS', 'deck_id must be A or B.', 400);
  }
  const includeTitle = options.include_title === undefined ? includeCustom : options.include_title;
  const includeSecondary = options.include_secondary === undefined ? includeCustom : options.include_secondary;
  if (typeof includeTitle !== 'boolean' || typeof includeSecondary !== 'boolean') {
    throw new TarotError('INVALID_DECK_OPTIONS', 'include_title and include_secondary must be boolean.', 400);
  }
  return { includeCustom: includeTitle && includeSecondary, includeTitle, includeSecondary, deckId };
}
