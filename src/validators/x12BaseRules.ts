export interface ValidationError {
  /** Stable identifier for the rule that produced this error. */
  ruleId: string;
  /** Plain-English explanation, suitable for display in the batch import validation table. */
  message: string;
  /** Segment or field this error relates to, e.g. "BHT06" or "2010BA NM1". */
  field?: string;
}

export function requireField(value: string | undefined | null, ruleId: string, field: string, message: string): ValidationError[] {
  if (value === undefined || value === null || value.trim() === '') {
    return [{ ruleId, field, message }];
  }
  return [];
}

export function requireOneOf(
  value: string | undefined,
  allowed: readonly string[],
  ruleId: string,
  field: string,
  message: string,
): ValidationError[] {
  if (value === undefined || !allowed.includes(value)) {
    return [{ ruleId, field, message }];
  }
  return [];
}

export function requirePattern(
  value: string | undefined,
  pattern: RegExp,
  ruleId: string,
  field: string,
  message: string,
): ValidationError[] {
  if (value === undefined || !pattern.test(value)) {
    return [{ ruleId, field, message }];
  }
  return [];
}
