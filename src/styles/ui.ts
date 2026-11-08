// Shared Material-style class strings, so every component reads from the
// same small vocabulary instead of hand-rolling Tailwind utility soup.

export const card = 'rounded-2xl border border-google-gray-200 bg-white p-5 shadow-sm space-y-4';

export const cardTitle =
  'flex items-center gap-2 text-base font-medium text-google-gray-900 pb-3 mb-1 border-b border-google-gray-100';

/** Use when the title row also needs a trailing action (e.g. "+ Add") - apply to the row, and cardTitleText to the <h3>. */
export const cardTitleRow = 'flex items-center justify-between gap-2 pb-3 mb-1 border-b border-google-gray-100';
export const cardTitleText = 'flex items-center gap-2 text-base font-medium text-google-gray-900';

export const fieldLabel = 'block text-xs font-medium text-google-gray-700 mb-1.5';

export const fieldInput =
  'w-full rounded-lg border border-google-gray-300 bg-white px-3 py-2 text-sm text-google-gray-900 placeholder-google-gray-500 transition-shadow focus:border-google-blue-600 focus:ring-[3px] focus:ring-google-blue-100';

export const monoTextarea =
  'w-full rounded-lg border border-google-gray-300 bg-white p-3 font-mono text-xs text-google-gray-900 placeholder-google-gray-500 transition-shadow focus:border-google-blue-600 focus:ring-[3px] focus:ring-google-blue-100';

export const subheading = 'text-xs font-medium uppercase tracking-wide text-google-gray-600 pt-1';

export const checkboxInput = 'h-4 w-4 rounded border-google-gray-400 text-google-blue-600 focus:ring-google-blue-200';
export const checkboxLabel = 'flex items-center gap-2 text-sm text-google-gray-700';

export const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-google-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-google-blue-700 hover:shadow disabled:cursor-not-allowed disabled:bg-google-gray-300 disabled:text-google-gray-500 disabled:shadow-none';

export const outlinedButton =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-google-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-google-gray-700 transition-colors hover:bg-google-gray-50';

export const textButton =
  'rounded-full px-2.5 py-1 text-sm font-medium text-google-blue-700 transition-colors hover:bg-google-blue-50';

export const dangerTextButton =
  'rounded-full px-2.5 py-1 text-xs font-medium text-google-red-600 transition-colors hover:bg-google-red-50';

export const chip = 'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors';
export const chipInactive = `${chip} border-google-gray-300 text-google-gray-700 hover:bg-google-gray-100`;
export const chipActive = `${chip} border-google-blue-200 bg-google-blue-50 text-google-blue-700`;

export const statusPillSuccess = 'inline-flex items-center gap-1 rounded-full bg-google-green-50 px-2 py-0.5 text-xs font-medium text-google-green-600';
export const statusPillError = 'inline-flex items-center gap-1 rounded-full bg-google-red-50 px-2 py-0.5 text-xs font-medium text-google-red-600';
export const statusPillWarning = 'inline-flex items-center gap-1 rounded-full bg-google-amber-50 px-2 py-0.5 text-xs font-medium text-google-amber-700';
