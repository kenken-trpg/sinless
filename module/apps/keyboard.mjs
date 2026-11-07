// Keyboard access to the links that act as buttons in Sinless windows.
// The templates use <a data-action> without href for small controls (item rows, −/+ steppers,
// track boxes). Browsers skip such links when tabbing and ignore Enter on them, so each render
// makes them focusable buttons, and Enter or Space clicks them.
// A click that updates the document re-renders the sheet and replaces the element; focus then
// returns to the control with the same data attributes.

/** Links without href that run an application action. */
export const CLICKABLE = "a[data-action]:not([href])";

/** Where to put focus back after the next render: the application and the control's selector. */
let pending = null;
let lastFocused = null;
const dialogOrigins = new Map();

/** Make the action links in a rendered Sinless window focusable buttons. */
export function makeFocusable(element) {
  for (const a of element.querySelectorAll(CLICKABLE)) {
    if (!a.hasAttribute("tabindex")) a.tabIndex = 0;
    if (!a.hasAttribute("role")) a.setAttribute("role", "button");
  }
}

/** A selector matching `el` by its data attributes, within its item or effect row. */
export function controlSelector(el) {
  const own = [...el.attributes]
    .filter(a => a.name.startsWith("data-") && !a.name.startsWith("data-tooltip"))
    .map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
  const row = el.parentElement?.closest("[data-item-id], [data-effect-id]");
  const tag = el.localName;
  if (!row) return `${tag}${own}`;
  const key = row.hasAttribute("data-item-id") ? "data-item-id" : "data-effect-id";
  return `[${key}="${CSS.escape(row.getAttribute(key))}"] ${tag}${own}`;
}

function onKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const el = event.target;
  if (!(el instanceof HTMLElement) || !el.matches(CLICKABLE) || !el.closest(".application.sinless")) return;
  event.preventDefault();
  if (event.repeat) return;
  const appId = el.closest(".application")?.id;
  pending = { appId, selector: controlSelector(el), until: Date.now() + 3000 };
  el.click();
}

/** Focus moving to another window (a dialog the click opened) cancels the pending return. */
function onFocusIn(event) {
  const target = event.target;
  const dialog = target.closest?.("dialog.application");
  if (dialog && !dialogOrigins.has(dialog.id) && lastFocused?.isConnected
      && !dialog.contains(lastFocused) && lastFocused.closest(".application.sinless, dialog.application")) {
    dialogOrigins.set(dialog.id, { root: dialog, origin: lastFocused,
      appId: lastFocused.closest('.application')?.id,
      selector: lastFocused.matches('[data-action]') ? controlSelector(lastFocused) : null });
  }
  lastFocused = target;
  if (pending && !event.target.closest?.(`#${CSS.escape(pending.appId)}`)) pending = null;
}

function onClose(app) {
  const entry = dialogOrigins.get(app.id);
  if (!entry) return;
  const { root, origin, appId, selector } = entry;
  dialogOrigins.delete(app.id);
  requestAnimationFrame(() => {
    const active = document.activeElement;
    const target = origin.isConnected ? origin : selector && document.getElementById(appId)?.querySelector(selector);
    if (target && (active === document.body || !active || root.contains(active)
        || active.closest?.('.application')?.id === appId)) target.focus();
  });
}

function onRender(app, element) {
  const root = element instanceof HTMLElement ? element : app.element;
  if (!root?.classList.contains("sinless")) return;
  makeFocusable(root);
  if (!pending || pending.appId !== root.id) return;
  const { selector, until } = pending;
  pending = null;
  if (Date.now() > until || root.contains(document.activeElement)) return;
  root.querySelector(selector)?.focus();
}

export function registerKeyboard() {
  Hooks.on("renderApplicationV2", onRender);
  Hooks.on("closeApplicationV2", onClose);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("focusin", onFocusIn);
  // A link used as a button inside a label must not activate the label's input.
  document.addEventListener("click", event => {
    if (event.target.closest?.(CLICKABLE)?.closest('.application.sinless')) event.preventDefault();
  });
}
