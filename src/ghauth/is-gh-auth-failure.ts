const AUTH_FAILED = /HTTP 401|401 Unauthorized|Bad credentials/;

export const isGhAuthFailure = (text: string): boolean => AUTH_FAILED.test(text);
