export const copyTextWithFallback = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the accessible selection-based clipboard fallback.
  }
  if (typeof document === "undefined" || !document.body) return false;
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.setAttribute("aria-hidden", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    input.remove();
  }
  return copied;
};
