// Buttons in the token controls that open a Sinless window (help, chase, operation).
// Foundry ignores tool clicks while no canvas is ready: no scene is viewed, or the client
// disabled the game canvas. These windows do not need the canvas, so in that case the
// buttons handle the click themselves.

/** Button name → function that opens its window. */
const BUTTONS = new Map();

/**
 * Add a button to the token controls.
 * @param {string} name  Tool name, unique among the token tools.
 * @param {object} o
 * @param {string} o.title     Localization key of the tooltip.
 * @param {string} o.icon      Font Awesome classes.
 * @param {() => unknown} o.open  Opens the window.
 * @param {boolean} [o.gmOnly]  Show the button to the GM only.
 */
export function addControlButton(name, { title, icon, open, gmOnly = false }) {
  if (!BUTTONS.size) Hooks.on("renderSceneControls", bindWithoutCanvas);
  BUTTONS.set(name, open);
  Hooks.on("getSceneControlButtons", controls => {
    if (gmOnly && !game.user.isGM) return;
    const tokens = controls.tokens ?? controls.token;
    if (!tokens?.tools) return;
    tokens.tools[name] = {
      name, title, icon,
      order: Object.keys(tokens.tools).length,
      button: true,
      visible: true,
      onChange: () => open()
    };
  });
}

/** Open the window on click when Foundry will not, because no canvas is ready. */
function bindWithoutCanvas(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  for (const [name, open] of BUTTONS) {
    const button = root?.querySelector(`button.tool[data-tool="${name}"]`);
    if (!button || button.dataset.sinlessBound) continue;
    button.dataset.sinlessBound = "true";
    button.addEventListener("click", () => {
      if (!canvas?.ready) open();
    });
  }
}
