export const socketConnectionErrorMessage = (reason: unknown, _socketUrl: string): string => {
  void _socketUrl;
  const detail = reason instanceof Error && reason.message ? ` (${reason.message})` : "";
  return `Could not connect to the FE Arena server${detail}. Please try again shortly.`;
};

export const socketDisconnectedMessage = (_socketUrl: string): string => {
  void _socketUrl;
  return "Connection to the FE Arena server was lost. FE Arena will retry automatically.";
};
