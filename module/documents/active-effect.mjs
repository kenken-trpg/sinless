/**
 * Effects carried by items only apply while the item is in use:
 * armor must be equipped and physical gear must be carried.
 */
export class SinlessActiveEffect extends ActiveEffect {
  /** @override */
  get isSuppressed() {
    const item = this.parent;
    if (item instanceof Item && item.parent instanceof Actor) {
      const sys = item.system;
      if (item.type === "armor" && sys.equipped === false) return true;
      if (sys.carried === false) return true;
    }
    return super.isSuppressed;
  }
}
