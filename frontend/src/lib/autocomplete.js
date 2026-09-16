/**
 * Autocomplete helper — Tab/Enter to complete first prefix match.
 *
 * Usage:
 *   onKeyDown={(e) => {
 *     if (tryAutocomplete(e, options, (v) => setValue(v))) {
 *       // completed; caller may skip further processing.
 *       // For Enter, we return true after preventDefault, so caller should NOT re-run
 *       // its own Enter handler this key press (call return).
 *     } else {
 *       // fall through to normal handler
 *     }
 *   }}
 *
 * @param {KeyboardEvent} e - React SyntheticEvent
 * @param {Array<string|{value:string}>} options - dataset to search
 * @param {(v:string)=>void} setValue - state setter
 * @returns {boolean} true if a completion occurred (already updated state)
 */
export function tryAutocomplete(e, options, setValue) {
  if (e.key !== "Tab" && e.key !== "Enter") return false;
  const raw = String(e.target.value || "").trim();
  if (!raw) return false;
  const val = raw.toLowerCase();
  const list = options || [];
  const match = list.find((o) => {
    const s = typeof o === "string" ? o : (o?.value || "");
    return s && s.toLowerCase().startsWith(val);
  });
  if (!match) return false;
  const matchVal = typeof match === "string" ? match : match.value;
  // Already exact — don't override, just let default handling proceed.
  if (matchVal.toLowerCase() === val) return false;
  // Update state to full match.
  setValue(matchVal);
  // For Tab: don't preventDefault → native focus moves to next field.
  // For Enter: preventDefault → caller likely wants to advance manually.
  if (e.key === "Enter") e.preventDefault();
  return true;
}
