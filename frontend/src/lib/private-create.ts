export const isPrivateCreateResponseForActiveRequest = (
  activeRequestId: string | null,
  responseRequestId: unknown,
): boolean =>
  typeof responseRequestId === "string" && activeRequestId !== null && activeRequestId === responseRequestId;
