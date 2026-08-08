export const isCodingCapabilityAvailable = () =>
  typeof window !== "undefined" &&
  window.crossOriginIsolated === true &&
  typeof Worker === "function" &&
  typeof WebAssembly === "object" &&
  typeof SharedArrayBuffer === "function";

export const CODING_CAPABILITY_MESSAGE =
  "Browser C rounds need a supported browser with cross-origin isolation. Keep the site's COOP/COEP headers enabled, then reload this page.";
