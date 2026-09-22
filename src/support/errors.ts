/** Turns an unknown thrown value into a message that is safe to show a user. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Compile-time exhaustiveness check for discriminated unions. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
