export const PASSWORD_MIN_LENGTH = 8;

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export type EventValidation = {
  title?: string;
  venue?: string;
  time?: string;
};

export function validateEventInput(input: {
  title: string;
  venue: string;
  start: Date;
  end: Date;
}): EventValidation {
  const errors: EventValidation = {};
  if (!input.title.trim()) {
    errors.title = 'Event title is required.';
  } else if (input.title.trim().length < 3) {
    errors.title = 'Use at least 3 characters for the event title.';
  }
  if (!input.venue.trim()) {
    errors.venue = 'Venue is required.';
  }
  if (input.start.getTime() >= input.end.getTime()) {
    errors.time = 'End time must be after the start time.';
  }
  return errors;
}

export function hasValidationErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean);
}
