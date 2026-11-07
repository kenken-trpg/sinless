// In-game help: pages written per language in help/<lang>/ (index.json lists them),
// shown in a window and importable by the GM as a journal entry.
import { SYSTEM_ID } from "../config.mjs";
import { addControlButton } from "./control-button.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** Languages with a help/<lang>/ folder. English is the fallback. */
export const HELP_LANGUAGES = ["en", "ja"];

const cache = new Map();

async function fetchText(path) {
  const res = await fetch(foundry.utils.getRoute(`systems/${SYSTEM_ID}/help/${path}`));
  if (!res.ok) throw new Error(`${SYSTEM_ID} | help/${path}: HTTP ${res.status}`);
  return res.text();
}

/** The help in one language: { lang, language, title, pages: [{ id, title, content }] }. */
export function loadHelp(lang) {
  if (!HELP_LANGUAGES.includes(lang)) lang = "en";
  if (!cache.has(lang)) {
    const loading = (async () => {
      const index = JSON.parse(await fetchText(`${lang}/index.json`));
      const pages = await Promise.all(index.pages.map(async p => ({ ...p, content: await fetchText(`${lang}/${p.id}.html`) })));
      return { lang, language: index.language, title: index.title, pages };
    })();
    loading.catch(() => cache.delete(lang));
    cache.set(lang, loading);
  }
  return cache.get(lang);
}

/** The help language for this client: the Foundry language when help exists for it. */
export function helpLanguage() {
  return HELP_LANGUAGES.includes(game.i18n.lang) ? game.i18n.lang : "en";
}

/** The journal entry imported for a language, if any. */
export function helpJournal(lang) {
  return game.journal.find(j => j.getFlag(SYSTEM_ID, "help") === lang) ?? null;
}

/**
 * Import the help as a journal entry readable by everyone (GM only). Importing again
 * replaces the help pages and keeps pages the GM added.
 */
export async function importHelpJournal(lang = helpLanguage()) {
  if (!game.user.isGM) return null;
  const help = await loadHelp(lang);
  const pages = help.pages.map((p, i) => ({
    name: p.title,
    type: "text",
    sort: (i + 1) * CONST.SORT_INTEGER_DENSITY,
    text: { content: p.content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
    flags: { [SYSTEM_ID]: { helpPage: p.id } }
  }));
  const flags = { [SYSTEM_ID]: { help: help.lang, helpVersion: game.system.version } };
  const existing = helpJournal(help.lang);
  if (!existing) {
    const entry = await JournalEntry.create({
      name: help.title, pages, flags, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
    });
    ui.notifications.info(game.i18n.format("SINLESS.Help.imported", { name: entry.name }));
    return entry;
  }
  const ok = await DialogV2.confirm({
    window: { title: "SINLESS.Help.import" },
    content: `<p>${foundry.utils.escapeHTML(game.i18n.format("SINLESS.Help.replaceConfirm", { name: existing.name }))}</p>`,
    rejectClose: false
  });
  if (!ok) return null;
  const old = existing.pages.filter(p => p.getFlag(SYSTEM_ID, "helpPage")).map(p => p.id);
  if (old.length) await existing.deleteEmbeddedDocuments("JournalEntryPage", old);
  await existing.createEmbeddedDocuments("JournalEntryPage", pages);
  await existing.update({ flags });
  ui.notifications.info(game.i18n.format("SINLESS.Help.updated", { name: existing.name }));
  return existing;
}

/** Window showing the help pages, with a language switch and the GM's import button. */
export class HelpApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: "sinless-help",
    classes: ["sinless", "sinless-help"],
    window: { title: "SINLESS.Help.title", icon: "fa-solid fa-circle-question", resizable: true },
    position: { width: 760, height: 640 },
    actions: {
      page: HelpApp.#onPage,
      importJournal: HelpApp.#onImport
    }
  };

  static PARTS = { main: { template: `systems/${SYSTEM_ID}/templates/apps/help.hbs`, scrollable: [".help-content"] } };

  lang = helpLanguage();
  page = null;

  /** Open the help, optionally at a page id. */
  static open(page = null) {
    HelpApp.#instance ??= new HelpApp();
    if (page) HelpApp.#instance.page = page;
    return HelpApp.#instance.render({ force: true });
  }

  async _prepareContext() {
    const help = await loadHelp(this.lang);
    const page = help.pages.find(p => p.id === this.page) ?? help.pages[0];
    this.page = page.id;
    const languages = await Promise.all(HELP_LANGUAGES.map(async code => {
      const h = await loadHelp(code).catch(() => null);
      return h ? { code, name: h.language, selected: code === help.lang } : null;
    }));
    return {
      pages: help.pages.map(p => ({ id: p.id, title: p.title, active: p.id === page.id })),
      page,
      languages: languages.filter(Boolean),
      isGM: game.user.isGM,
      imported: !!helpJournal(help.lang)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("select[name=lang]")?.addEventListener("change", ev => {
      this.lang = ev.target.value;
      this.render();
    });
  }

  static #onPage(event, target) {
    this.page = target.dataset.page;
    return this.render();
  }

  static async #onImport() {
    const entry = await importHelpJournal(this.lang);
    if (entry) this.render();
    return entry;
  }
}

/** Help button in the token controls, for every user. */
export function registerHelp() {
  addControlButton("sinlessHelp", { title: "SINLESS.Help.title", icon: "fa-solid fa-circle-question", open: () => HelpApp.open() });
}
