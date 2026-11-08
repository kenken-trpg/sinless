// Link the visible caption of a standard form group to its single native field.
// Compound rows supply explicit, contextual names in their templates.
let sequence = 0;
const editors = new WeakSet();
export function associateFieldLabels(root, schema = null) {
  for (const field of root.querySelectorAll('input:not([type="hidden"]),select,textarea')) {
    if (!field.id) field.id = `${root.id || 'sinless'}-field-${++sequence}`;
  }
  for (const group of root.querySelectorAll('.form-group')) {
    const fields = group.querySelectorAll('input:not([type="hidden"]),select,textarea');
    if (fields.length !== 1) continue;
    const label = [...group.querySelectorAll('label')].find(l => l.closest('.form-group') === group);
    if (label && !label.control && !label.htmlFor) label.htmlFor = fields[0].id;
  }
  for (const editor of root.querySelectorAll('prose-mirror[name]')) {
    if (!editor.id) editor.id = `${root.id || 'sinless'}-editor-${++sequence}`;
    let field = schema;
    for (const part of editor.getAttribute('name').replace(/^system\./, '').split('.')) field = field?.fields?.[part];
    if (!field?.label || editors.has(editor)) continue;
    const name = game.i18n.localize(field.label);
    editor.setAttribute('role', 'group');
    editor.setAttribute('aria-label', name);
    const labelEditor = () => {
      for (const input of editor.querySelectorAll('[contenteditable="true"]')) {
        if (!input.id) input.id = `${root.id || 'sinless'}-field-${++sequence}`;
        input.setAttribute('role', 'textbox');
        input.setAttribute('aria-label', name);
        input.setAttribute('aria-multiline', 'true');
      }
      const button = editor.querySelector('button.toggle');
      if (button) {
        button.setAttribute('aria-label', game.i18n.format('SINLESS.Accessibility.edit', { name }));
      }
    };
    labelEditor();
    editor.addEventListener('open', () => { labelEditor(); editor.focus(); });
    editor.addEventListener('close', () => editor.querySelector('button.toggle')?.focus());
    // The editable surface is inserted when the user opens the rich text editor.
    new MutationObserver(labelEditor).observe(editor, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'class'] });
    editors.add(editor);
  }
}
