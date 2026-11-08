// Keyboard access to the links that act as buttons in Sinless windows.
// The templates use <a data-action> without href for small controls (item rows, −/+ steppers,
// track boxes). Browsers skip such links when tabbing and ignore Enter on them, so each render
// makes them focusable buttons, and Enter or Space clicks them.
// A click that updates the document re-renders the sheet and replaces the element; focus then
// returns to the control with the same data attributes.

/** Links without href that run an application action. */
import { associateFieldLabels } from './accessibility.mjs';
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
  const name = el.hasAttribute('name') ? `[name="${CSS.escape(el.getAttribute('name'))}"]` : '';
  if (!row) return `${tag}${own}${name}`;
  const key = row.hasAttribute("data-item-id") ? "data-item-id" : "data-effect-id";
  return `[${key}="${CSS.escape(row.getAttribute(key))}"] ${tag}${own}`;
}

function rememberControl(el) {
  const root = el.closest('.application.sinless');
  const appId = root.id;
  const controls = [...root.querySelectorAll('[data-action],input[name],select[name],textarea[name]')]
    .filter(e => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);
  const index = controls.indexOf(el);
  pending = { appId, origin: el, selector: controlSelector(el), until: Date.now() + 3000,
    fallback: [...controls.slice(index + 1), ...controls.slice(0, index).reverse()].map(controlSelector),
    existing: new Set(foundry.applications.instances.keys()) };
}

function onKeydown(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement) || !el.closest('.application.sinless')) return;
  // A new keyboard navigation supersedes a previous action's delayed renders.
  if (event.key === 'Tab') pending = null;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (!el.matches(`${CLICKABLE},button[data-action]`)) return;
  if (el.matches(CLICKABLE)) event.preventDefault();
  if (event.repeat) return;
  rememberControl(el);
  if (el.matches(CLICKABLE)) el.click();
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
  associateFieldLabels(root, app.document?.system?.schema);
  if (pending && pending.appId !== root.id && Date.now() <= pending.until && app.document
      && (!pending.existing.has(app.id) || app.document.parent?.sheet?.id === pending.appId)) {
    const { origin, appId, selector } = pending;
    pending = null;
    dialogOrigins.set(app.id, { root, origin, appId, selector });
    root.querySelector('input[name="name"], input:not([type="hidden"]):not(:disabled), button')?.focus();
    return;
  }
  if (!pending || pending.appId !== root.id) return;
  const { selector, until, fallback } = pending;
  if (Date.now() > until) { pending = null; return; }
  if (root.contains(document.activeElement)) return;
  // A setting change can render twice (heat, then operation state). Keep the
  // return target until navigation supersedes it or the short deadline expires.
  const target = [selector, ...fallback].map(s => root.querySelector(s))
    .find(e => e && !e.disabled && e.tabIndex >= 0 && e.getClientRects().length);
  target?.focus();
}

export function registerKeyboard() {
  Hooks.on("renderApplicationV2", onRender);
  Hooks.on("closeApplicationV2", onClose);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener('change', event => {
    const el = event.target;
    if (el instanceof HTMLElement && el === document.activeElement
        && el.matches('input[name],select[name],textarea[name]') && el.closest('.application.sinless')) rememberControl(el);
  }, true);
  document.addEventListener('pointerdown', () => { pending = null; }, true);
  // A link used as a button inside a label must not activate the label's input.
  document.addEventListener("click", event => {
    if (event.target.closest?.(CLICKABLE)?.closest('.application.sinless')) event.preventDefault();
  });
}
