export const socketConnectionErrorMessage = (reason: unknown, socketUrl: string): string => {
  const detail = reason instanceof Error && reason.message ? ` (${reason.message})` : "";
  return `Could not connect to the FE Arena server at ${socketUrl}${detail}. Start the backend with “cd backend && npm run dev” and check that VITE_SOCKET_URL matches its address.`;
};

export const socketDisconnectedMessage = (socketUrl: string): string =>
  `Connection to the FE Arena server at ${socketUrl} was lost. FE Arena will retry automatically; check the backend if it does not reconnect.`;
