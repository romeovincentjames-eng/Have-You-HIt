export const ADULT_CONFIRMATION = "confirmed_18_plus";

export type AgeVerificationMethod = "id_barcode" | "id_image_and_birthdate";

export type AgeVerificationResult = {
  verifiedAt: string;
  method: AgeVerificationMethod;
};

function isValidDate(date: Date, year: number, month: number, day: number) {
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function makeDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  return isValidDate(date, year, month, day) ? date : null;
}

function plausibleYear(year: number) {
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear;
}

export function parseDateInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, y, m, d] = match;
  return makeDate(Number(y), Number(m), Number(d));
}

export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCompactDate(value: string) {
  if (!/^\d{8}$/.test(value)) return null;

  const yyyymmdd = {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(4, 6)),
    day: Number(value.slice(6, 8)),
  };

  if (plausibleYear(yyyymmdd.year)) {
    const date = makeDate(yyyymmdd.year, yyyymmdd.month, yyyymmdd.day);
    if (date) return date;
  }

  const mmddyyyy = {
    month: Number(value.slice(0, 2)),
    day: Number(value.slice(2, 4)),
    year: Number(value.slice(4, 8)),
  };

  if (plausibleYear(mmddyyyy.year)) {
    return makeDate(mmddyyyy.year, mmddyyyy.month, mmddyyyy.day);
  }

  return null;
}

export function parseAamvaBirthDate(rawValue: string) {
  const normalized = rawValue.replace(/\r/g, "\n");
  const match = normalized.match(/DBB(\d{8})/);
  return match ? parseCompactDate(match[1]) : null;
}

export function getAge(dateOfBirth: Date, today = new Date()) {
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const birthdayThisYear = new Date(
    today.getFullYear(),
    dateOfBirth.getMonth(),
    dateOfBirth.getDate(),
  );

  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age;
}

export function isAtLeast18(dateOfBirth: Date) {
  return getAge(dateOfBirth) >= 18;
}
