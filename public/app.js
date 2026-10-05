const $ = (selector) => document.querySelector(selector);
const IMAGE_PAGE_SIZE = 50;
const state = {
  csrfToken: null, projects: [], projectId: null, data: null, runtime: null, imageRuntime: null, dispatch: null, skills: null,
  sourceId: null, activeSetId: null, renderedSetId: null, studioFilters: {}, imagePage: 1, studioPage: 1, view: 'create', memoryView: 'facts', submitting: false, epoch: 0, contextEpoch: 0, editorEpoch: 0, pollTimer: null,
};
const runLabels = { running: 'Running', archiving: 'Archival needs recovery', succeeded: 'Saved', failed: 'Run failed', result_unknown: 'External result unknown', waiting_quota: 'Waiting for quota', waiting_auth: 'Waiting for sign-in', cancelled: 'Cancelled' };
const kindLabels = { brand: 'Brand fact', confirmed_brand: 'Confirmed brand fact', reference: 'Reference', evidence: 'Research source', insight: 'Insight', concept: 'Previous idea', source_concept: 'Selected source version', related_concept: 'Related previous idea', feedback: 'Feedback', favorite: 'Favorite idea', brief: 'Creative brief', asset: 'Selected work image', reference_asset: 'Selected image reference' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(label, className, action) {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function readable(value) {
  if (value === undefined || value === null) return 'Unknown';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function dateLabel(value) {
  if (!value) return 'Time unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unknown';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function notify(message, error = false) {
  const node = $('#notice');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.hidden = false;
}

function hideNotice() { $('#notice').hidden = true; }
function projectPath(projectId = state.projectId) { return `/api/projects/${encodeURIComponent(projectId)}`; }
function errorMessage(error) { return error?.message || 'The action did not finish. Please try again.'; }
function isArchived() { return Boolean(state.data?.project.archived); }
function projectButton(label, className, handler) {
  const node = button(label, className, handler);
  node.disabled = isArchived();
  return node;
}

function fillOptions(select, records, emptyLabel, value = select.value) {
  select.replaceChildren();
  if (emptyLabel !== null) { const option = el('option', '', emptyLabel); option.value = ''; select.append(option); }
  for (const record of records) { const option = el('option', '', record.label); option.value = record.value; select.append(option); }
  if ([...select.options].some((option) => option.value === value)) select.value = value;
}

async function api(path, body) {
  const options = { credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.headers['X-CSRF-Token'] = state.csrfToken;
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Check the local service.'); }
  if (!response.ok) {
    const error = new Error(data.error?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

async function action(node, work) {
  const epoch = state.epoch;
  node.disabled = true;
  hideNotice();
  try { await work(); } catch (error) { if (epoch === state.epoch) notify(errorMessage(error), true); }
  finally { if (node.isConnected) node.disabled = Boolean(isArchived() && node.closest('#knowledge-form')); }
}

function emptyState(title, copy) {
  const node = el('div', 'empty-state');
  const symbol = el('div', 'empty-symbol', '↳');
  symbol.setAttribute('aria-hidden', 'true');
  node.append(symbol, el('h3', '', title), el('p', '', copy));
  return node;
}

function switchView(view) {
  state.view = view;
  for (const node of document.querySelectorAll('.view')) node.hidden = node.id !== `view-${view}`;
  for (const node of document.querySelectorAll('[data-view]')) {
    const active = node.dataset.view === view;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  }
  renderCurrentView();
  renderGenerationState();
}

function switchMemoryView(view) {
  state.memoryView = view;
  for (const node of document.querySelectorAll('.memory-view')) node.hidden = node.id !== `memory-${view}`;
  for (const node of document.querySelectorAll('[data-memory-view]')) {
    const active = node.dataset.memoryView === view;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  }
  if (state.view === 'memory') renderCurrentView();
}

function renderCurrentView() {
  if (!state.data) return;
  if (state.view === 'create') renderConcepts();
  else if (state.view === 'sets') renderSets();
  else if (state.view === 'runs') renderRuns();
  else if (state.view === 'skills') renderSkills();
  else if (state.view === 'memory') {
    if (state.memoryView === 'facts') renderKnowledge();
    else if (state.memoryView === 'research') renderEvidence();
    else if (state.memoryView === 'insights') renderInsights();
    else if (state.memoryView === 'images') renderImages();
  }
}

function openEditor(title, description, saveLabel, onSave, { allowArchived = false } = {}) {
  const epoch = ++state.editorEpoch, projectId = state.projectId;
  $('#editor-title').textContent = title;
  $('#editor-eyebrow').textContent = state.data?.project.name || 'LOCAL WORKSPACE';
  const content = $('#editor-content');
  content.replaceChildren(el('p', 'section-description editor-description', description));
  const form = el('form', 'editor-form');
  const fields = el('div', 'editor-fields');
  const errorBox = el('p', 'notice error');
  errorBox.hidden = true; errorBox.setAttribute('role', 'alert');
  const footer = el('div', 'editor-actions');
  const cancel = button('Cancel', 'button secondary', () => $('#editor-dialog').close());
  const submit = el('button', 'button primary', saveLabel); submit.type = 'submit'; submit.disabled = isArchived() && !allowArchived;
  footer.append(cancel, submit); form.append(fields, errorBox, footer); content.append(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || (isArchived() && !allowArchived) || projectId !== state.projectId || submit.disabled) return;
    submit.disabled = true; submit.textContent = 'Saving…'; errorBox.hidden = true;
    try {
      await onSave(form, projectId);
      if (epoch === state.editorEpoch) $('#editor-dialog').close();
    } catch (error) {
      if (epoch === state.editorEpoch) { errorBox.textContent = errorMessage(error); errorBox.hidden = false; }
    } finally { submit.disabled = isArchived() && !allowArchived; submit.textContent = saveLabel; }
  });
  $('#editor-dialog').showModal();
  return { form, fields, submit };
}

function addField(container, labelText, name, value = '', options = {}) {
  const label = el('label', '', labelText);
  let input;
  if (options.options) {
    input = el('select');
    fillOptions(input, options.options.map((option) => typeof option === 'string' ? { value: option, label: option } : option), null, value);
  } else {
    input = el(options.multiline ? 'textarea' : 'input');
    if (options.multiline) input.rows = options.rows || 3;
    else input.type = options.type || 'text';
    input.value = value ?? '';
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.placeholder) input.placeholder = options.placeholder;
  }
  input.name = name; input.id = `editor-field-${name}`; input.required = Boolean(options.required);
  if (options.min !== undefined) input.min = options.min;
  if (options.max !== undefined) input.max = options.max;
  label.htmlFor = input.id; label.append(input);
  if (options.hint) label.append(el('span', 'field-hint', options.hint));
  container.append(label);
  return input;
}

function addChoices(container, label, name, records, selected = []) {
  const fieldset = el('fieldset', 'record-choices');
  fieldset.append(el('legend', '', label));
  if (!records.length) fieldset.append(el('p', 'field-hint', 'No saved records are available yet.'));
  for (const record of records) {
    const row = el('label', 'record-choice');
    const input = el('input'); input.type = 'checkbox'; input.name = name; input.value = record.id; input.checked = selected.includes(record.id);
    row.append(input, el('span', '', record.title || record.name)); fieldset.append(row);
  }
  container.append(fieldset);
  return fieldset;
}

function formValues(form) { return Object.fromEntries(new FormData(form)); }
function chosenValues(form, name) { return new FormData(form).getAll(name); }
function lines(value) { return value.split('\n').map((line) => line.trim()).filter(Boolean); }

function sourceLink(url, label = url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    const link = el('a', 'source-link', label); link.href = parsed.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  } catch { return el('span', 'knowledge-source', url || 'No source URL'); }
}

function editIdea(concept = null) {
  const editor = openEditor(concept ? 'Create a new idea version' : 'Add your own idea', concept ? 'Your saved version stays intact. This edit creates a new version linked to it.' : 'Save a thought without running a model. You can develop it, favorite it, or add it to a creative set later.', concept ? 'Save new version' : 'Save idea', async (form, projectId) => {
    const values = formValues(form);
    await api(`${projectPath(projectId)}/concepts`, { ...values, assumptions: lines(values.assumptions), insightVersionIds: chosenValues(form, 'insightVersionIds'), evidenceVersionIds: chosenValues(form, 'evidenceVersionIds'), ...(concept ? { parentId: concept.id } : {}) });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify(concept ? 'A new version is saved. The original is unchanged.' : 'Your idea is saved to this project.');
  });
  const fields = editor.fields;
  addField(fields, 'Title', 'title', concept?.title, { required: true, maxLength: 160 });
  addField(fields, 'Creation goal (optional)', 'goal', concept?.creationContext?.goal, { multiline: true, maxLength: 2000 });
  addField(fields, 'Creative angle', 'angle', concept?.angle, { required: true, maxLength: 500 });
  addField(fields, 'Theme', 'theme', concept?.theme, { maxLength: 200 });
  addField(fields, 'Underlying insight', 'insight', concept?.insight, { multiline: true, maxLength: 2000 });
  addField(fields, 'Draft copy', 'body', concept?.body, { required: true, multiline: true, rows: 6, maxLength: 8000 });
  addField(fields, 'Visual direction', 'visualDirection', concept?.visualDirection, { required: true, multiline: true, maxLength: 2000, hint: 'A written suggestion; saving does not generate an image.' });
  addField(fields, 'Why this idea', 'rationale', concept?.rationale, { required: true, multiline: true, maxLength: 2000 });
  addField(fields, 'Assumptions to validate', 'assumptions', concept?.assumptions?.join('\n'), { multiline: true, maxLength: 6000, hint: 'One assumption per line. Leave empty if there are none.' });
  addChoices(fields, 'Insights used for this version (optional)', 'insightVersionIds', state.data.insights, concept?.creationContext?.insightVersionIds || []);
  addChoices(fields, 'Sources used for this version (optional)', 'evidenceVersionIds', state.data.evidence, concept?.creationContext?.evidenceVersionIds || []);
  fields.append(el('p', 'field-hint', 'Saving records the current brand versions for future change checks. Only the sources you select are recorded as used; revising an idea preserves its origin.'));
}

function editEvidence(record = null) {
  const editor = openEditor(record ? 'Revise this source record' : 'Add a research source', 'Record what you read and keep interpretation separate from observation. Saving a source does not confirm a brand fact or run external research.', record ? 'Save new version' : 'Save source', async (form, projectId) => {
    const values = formValues(form);
    if (values.url) {
      const url = new URL(values.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an http or https source URL without credentials.');
    }
    if (!values.retrievedAt) delete values.retrievedAt;
    else values.retrievedAt = new Date(values.retrievedAt).toISOString();
    await api(`${projectPath(projectId)}/evidence`, { ...values, ...(record ? { previousId: record.id, expiresAt: record.expiresAt || null } : {}) });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify('Source record saved with its observation and interpretation.');
  });
  const fields = editor.fields;
  addField(fields, 'Source title', 'title', record?.title, { required: true, maxLength: 160 });
  addField(fields, 'Source URL', 'url', record?.url, { type: 'url', maxLength: 2000, hint: 'Optional for manually supplied observations.' });
  addField(fields, 'Observation — what the source says', 'observation', record?.observation, { required: true, multiline: true, rows: 5, maxLength: 12000 });
  addField(fields, 'Interpretation or inference', 'inference', record?.inference, { multiline: true, maxLength: 4000, hint: 'Your interpretation stays distinct from source evidence.' });
  addField(fields, 'Topics', 'tags', record?.tags?.join(', '), { maxLength: 400, placeholder: 'audience, problem, theme' });
  addField(fields, 'Accessed at', 'retrievedAt', '', { type: 'datetime-local', hint: 'Optional. Leave empty to use the save time.' });
}

function readSourceUrl() {
  const editor = openEditor('Read one source URL', 'This explicitly requests one public web source and saves a bounded excerpt as evidence. It does not crawl the site, confirm brand facts, or start idea generation.', 'Read and save source', async (form, projectId) => {
    await api(`${projectPath(projectId)}/research`, formValues(form));
    await refreshProject(projectId);
    if (projectId === state.projectId) notify('Source fetched and saved. Review its excerpt and any truncation note before using it.');
  });
  addField(editor.fields, 'Public source URL', 'url', '', { required: true, type: 'url', maxLength: 2000 });
  addField(editor.fields, 'Topics', 'tags', '', { maxLength: 400 });
}

function renderEvidence() {
  const list = $('#evidence-list');
  const selected = [...list.querySelectorAll('input:checked')].map((input) => input.value);
  list.replaceChildren();
  if (!state.data.evidence.length) list.append(emptyState('Keep useful evidence close', 'Add sources you have read. Their observations can inform insights and future creative work.'));
  for (const record of [...state.data.evidence].reverse()) {
    const card = el('article', 'record-card');
    const top = el('div', 'card-topline');
    const choice = el('label', 'filter-label');
    const input = el('input'); input.type = 'checkbox'; input.value = record.id; input.checked = selected.includes(record.id); input.disabled = isArchived();
    input.setAttribute('aria-label', `Select source: ${record.title}`); input.addEventListener('change', updateEvidenceSelection);
    choice.append(input, el('span', '', 'Use for synthesis'));
    top.append(choice, el('span', 'card-meta', dateLabel(record.retrievedAt || record.createdAt)));
    card.append(top, el('h3', '', record.title), sourceLink(record.url));
    card.append(el('p', 'field-hint', record.accessStatus === 'retrieved' ? `Retrieved source${record.excerptTruncated ? ' · Excerpt truncated' : ''}` : 'User-supplied source record'));
    addDetail(card, 'Observation', record.observation); addDetail(card, 'Interpretation', record.inference); tags(card, record.tags);
    if (record.previousId) card.append(el('p', 'knowledge-source', 'Revised record · Earlier versions are preserved.'));
    card.append(projectButton('Revise source', 'text-button', () => editEvidence(record)));
    list.append(card);
  }
  updateEvidenceSelection();
}

function updateEvidenceSelection() {
  const count = $('#evidence-list').querySelectorAll('input:checked').length;
  $('#evidence-selection-count').textContent = count ? `${count} source${count === 1 ? '' : 's'} selected` : 'No sources selected';
  $('#synthesize-insights').disabled = !count || !canRun();
  $('#synthesize-insights').title = !state.runtime?.available ? 'Connect the runtime to synthesize selected sources.' : '';
}

function synthesizeInsights() {
  const selected = [...$('#evidence-list').querySelectorAll('input:checked')].map((input) => input.value);
  if (!selected.length) return;
  if (selected.length > 12) { notify('Select at most 12 source versions for one synthesis.', true); return; }
  const editor = openEditor('Synthesize selected sources', `This explicitly runs one synthesis using ${selected.length} selected source records. It does not browse or start new research. Results remain insights or hypotheses, not confirmed brand facts.`, 'Synthesize insights', async (form) => {
    const values = formValues(form);
    await submitRun({ taskType: 'synthesize_insights', goal: values.goal, language: values.language, evidenceIds: selected });
  });
  addField(editor.fields, 'What do you want to understand?', 'goal', '', { required: true, multiline: true, maxLength: 2000, placeholder: 'For example: What prevents this audience from trying our product?' });
  addField(editor.fields, 'Output language', 'language', 'English', { options: ['English', 'Chinese'] });
  const selectedList = el('div', 'selected-source-summary');
  for (const id of selected) selectedList.append(el('p', 'field-hint', state.data.evidence.find((record) => record.id === id).title));
  editor.fields.append(selectedList);
}

function editInsight(record = null) {
  const editor = openEditor(record ? 'Revise this insight' : 'Add an insight', 'Keep its audience, supporting sources, and counterexamples visible. A hypothesis does not become a brand fact when saved.', record ? 'Save new version' : 'Save insight', async (form, projectId) => {
    const values = formValues(form), evidenceIds = chosenValues(form, 'evidenceIds');
    if (evidenceIds.length > 12) throw new Error('Select at most 12 supporting source versions.');
    const hypothesis = form.elements.hypothesis.checked;
    if (!evidenceIds.length && !hypothesis) throw new Error('An insight without selected evidence must remain a hypothesis.');
    await api(`${projectPath(projectId)}/insights`, { title: values.title, audience: values.audience, content: values.content, counterexamples: values.counterexamples, tags: values.tags, hypothesis, evidenceIds, ...(record ? { previousId: record.id } : {}) });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify('Insight saved. Its evidence, scope, and earlier versions remain traceable.');
  });
  const fields = editor.fields;
  addField(fields, 'Title', 'title', record?.title, { required: true, maxLength: 160 });
  addField(fields, 'Audience and applicable situation', 'audience', record?.audience, { required: true, maxLength: 500 });
  addField(fields, 'Insight', 'content', record?.content, { required: true, multiline: true, rows: 5, maxLength: 4000 });
  addField(fields, 'Counterexamples and limits', 'counterexamples', record?.counterexamples, { multiline: true, maxLength: 2000 });
  const label = el('label', 'record-choice'); const hypothesis = el('input'); hypothesis.type = 'checkbox'; hypothesis.name = 'hypothesis'; hypothesis.checked = record?.hypothesis !== false;
  label.append(hypothesis, el('span', '', 'This is a hypothesis to validate')); fields.append(label);
  addChoices(fields, 'Supporting source versions', 'evidenceIds', state.data.evidence, record?.evidenceIds || []);
  addField(fields, 'Topics', 'tags', record?.tags?.join(', '), { maxLength: 400 });
}

function renderInsights() {
  const list = $('#insights-list'); list.replaceChildren();
  if (!state.data.insights.length) list.append(emptyState('Give evidence a useful interpretation', 'Write an insight yourself, or explicitly synthesize selected records from Research sources.'));
  for (const record of [...state.data.insights].reverse()) {
    const card = el('article', 'record-card');
    const top = el('div', 'card-topline');
    top.append(el('span', `badge${record.hypothesis ? ' draft' : ''}`, record.hypothesis ? 'Hypothesis' : 'Evidence-linked insight'), el('span', 'card-meta', dateLabel(record.createdAt)));
    card.append(top, el('h3', '', record.title)); addDetail(card, 'Audience and situation', record.audience); addDetail(card, 'Insight', record.content); addDetail(card, 'Counterexamples and limits', record.counterexamples);
    const sources = el('details', 'card-details'); sources.append(el('summary', '', `Supporting sources · ${record.evidenceIds.length}`));
    for (const id of record.evidenceIds) {
      const evidence = state.data.evidence.find((item) => item.id === id);
      sources.append(evidence ? sourceLink(evidence.url, evidence.title) : el('p', 'field-hint', `Source unavailable: ${id}`));
    }
    card.append(sources); tags(card, record.tags);
    if (record.previousId) card.append(el('p', 'knowledge-source', 'New version · Historical references remain unchanged.'));
    card.append(projectButton('Revise insight', 'text-button', () => editInsight(record))); list.append(card);
  }
}

function editSet(set = null, preselectedConceptIds = []) {
  const brief = set ? state.data.briefs.find((record) => record.id === set.currentBriefId) : null;
  if (set && !brief) { notify('The current brief is unavailable. Refresh this project before editing.', true); return; }
  const editor = openEditor(set ? 'Revise the creative brief' : 'Create a creative set', set ? 'This saves a new brief version. Earlier work keeps its original snapshot; review it against the new brief before using it.' : 'Choose a Paid or Organic brief, then select the ideas you want to develop. Leave optional fields empty when they do not apply.', set ? 'Save new brief' : 'Create set', async (form, projectId) => {
    const values = formValues(form);
    const nextBrief = Object.fromEntries(['goal', 'audience', 'objective', 'offer', 'proof', 'cta', 'theme', 'caption', 'language', 'prohibitedClaims', 'style'].map((name) => [name, values[name]]));
    nextBrief.assetIds = chosenValues(form, 'assetIds');
    if (nextBrief.assetIds.length > 7) throw new Error('Choose at most seven brief images, leaving room for the work image during review.');
    const saved = set
      ? await api(`${projectPath(projectId)}/sets/${encodeURIComponent(set.id)}/briefs`, nextBrief)
      : await api(`${projectPath(projectId)}/sets`, { name: values.name, mode: values.mode, brief: nextBrief, conceptIds: chosenValues(form, 'conceptIds') });
    if (projectId === state.projectId) state.activeSetId = set?.id || saved.id || saved.set?.id;
    await refreshProject(projectId);
    if (projectId === state.projectId) { switchView('sets'); notify(set ? 'New brief version saved. Earlier snapshots are preserved.' : 'Creative set created. Only the ideas you selected are referenced.'); }
  });
  const fields = editor.fields;
  let mode;
  if (!set) {
    addField(fields, 'Set name', 'name', '', { required: true, maxLength: 120, placeholder: 'For example: October weekend stories' });
    mode = addField(fields, 'Brief type', 'mode', 'organic', { options: [{ value: 'organic', label: 'Organic — stories, education, and conversation' }, { value: 'paid', label: 'Paid — a focused offer and action' }] });
  } else fields.append(el('p', 'badge', set.mode === 'paid' ? 'Paid creative set' : 'Organic creative set'));
  addField(fields, 'Creative goal', 'goal', brief?.goal, { required: true, multiline: true, maxLength: 2000 });
  addField(fields, 'Audience', 'audience', brief?.audience, { maxLength: 1000 });
  addField(fields, 'Objective or content purpose', 'objective', brief?.objective, { maxLength: 1000 });
  const paidFields = el('div', 'editor-field-group');
  addField(paidFields, 'Offer', 'offer', brief?.offer, { maxLength: 2000 });
  addField(paidFields, 'Proof and supporting facts', 'proof', brief?.proof, { multiline: true, maxLength: 2000, hint: 'Do not invent prices, guarantees, or performance claims.' });
  fields.append(paidFields);
  const organicFields = el('div', 'editor-field-group');
  addField(organicFields, 'Theme', 'theme', brief?.theme, { maxLength: 1000 });
  addField(organicFields, 'Caption direction', 'caption', brief?.caption, { multiline: true, maxLength: 2000 });
  fields.append(organicFields);
  addField(fields, 'Call to action', 'cta', brief?.cta, { maxLength: 1000 });
  addField(fields, 'Output language', 'language', brief?.language || 'English', { options: ['English', 'Chinese'] });
  addField(fields, 'Claims and promises to avoid', 'prohibitedClaims', brief?.prohibitedClaims, { multiline: true, maxLength: 2000 });
  addField(fields, 'Visual style', 'style', brief?.style, { multiline: true, maxLength: 2000 });
  addChoices(fields, 'Visual references (up to seven)', 'assetIds', state.data.assets, brief?.assetIds || []);
  fields.append(el('p', 'field-hint', 'Review uses these selected references plus the work image. Inputs are normalized to at most 1,024 × 1,024 pixels; original files are preserved.'));
  const showMode = () => {
    const value = set?.mode || mode.value;
    paidFields.hidden = value !== 'paid'; organicFields.hidden = value !== 'organic';
  };
  if (mode) mode.addEventListener('change', showMode);
  showMode();
  if (!set) addChoices(fields, 'Ideas to include (optional)', 'conceptIds', state.data.concepts.filter((idea) => !idea.archived).map((idea) => ({ ...idea, title: `${idea.title} · ${dateLabel(idea.createdAt)}` })), preselectedConceptIds);
}

function attachIdeaToSet(concept) {
  const availableSets = state.data.sets.filter((set) => !set.archived);
  if (!availableSets.length) { editSet(null, [concept.id]); return; }
  const editor = openEditor('Add this idea to a set', 'The set will reference this exact version. Your original idea and its other set references remain unchanged.', 'Add to set', async (form, projectId) => {
    const setId = formValues(form).setId;
    await api(`${projectPath(projectId)}/sets/${encodeURIComponent(setId)}/concepts`, { conceptIds: [concept.id] });
    if (projectId === state.projectId) state.activeSetId = setId;
    await refreshProject(projectId);
    if (projectId === state.projectId) notify('This idea version is now referenced by the selected set.');
  });
  editor.fields.append(el('p', 'source-strip', concept.title));
  addField(editor.fields, 'Creative set', 'setId', availableSets[0].id, { required: true, options: availableSets.map((set) => ({ value: set.id, label: `${set.name} · ${set.mode === 'paid' ? 'Paid' : 'Organic'}` })) });
}

function addSetIdeas(set) {
  const candidates = state.data.concepts.filter((idea) => !idea.archived && !set.conceptIds.includes(idea.id));
  const editor = openEditor('Add ideas to this set', 'Select saved versions to add. Ideas already in this set are preserved and excluded from this list.', 'Add selected ideas', async (form, projectId) => {
    const conceptIds = chosenValues(form, 'conceptIds');
    if (!conceptIds.length) throw new Error('Select at least one idea to add.');
    await api(`${projectPath(projectId)}/sets/${encodeURIComponent(set.id)}/concepts`, { conceptIds });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify('Selected idea versions added to this creative set.');
  });
  addChoices(editor.fields, 'Available idea versions', 'conceptIds', candidates.map((idea) => ({ ...idea, title: `${idea.title} · ${dateLabel(idea.createdAt)}` })));
}

function createForSet(set, brief) {
  state.sourceId = null; $('#source-strip').hidden = true;
  $('#creative-set').value = set.id; $('#creative-goal').value = brief.goal; $('#creative-language').value = brief.language;
  $('#creative-count').value = '6'; switchView('create'); $('#creative-goal').focus();
}

function renderSets() {
  const list = $('#sets-list'), detail = $('#set-detail'); list.replaceChildren(); detail.replaceChildren();
  if (!state.data.sets.length) {
    list.append(el('p', 'field-hint', 'No creative sets yet.'));
    detail.append(emptyState('Give selected ideas a shared brief', 'Create a Paid or Organic set. You can start with an empty set or attach existing idea versions.'));
    return;
  }
  if (!state.data.sets.some((set) => set.id === state.activeSetId)) state.activeSetId = state.data.sets.at(-1).id;
  for (const set of [...state.data.sets].reverse()) {
    const node = button('', 'set-list-button', () => { state.activeSetId = set.id; renderSets(); });
    node.classList.toggle('selected', state.activeSetId === set.id);
    if (state.activeSetId === set.id) node.setAttribute('aria-current', 'true');
    node.append(el('span', 'quiet-label', `${set.mode === 'paid' ? 'PAID' : 'ORGANIC'}${set.archived ? ' · ARCHIVED' : ''}`), el('strong', '', set.name), el('span', 'field-hint', `${set.conceptIds.length} idea versions`)); list.append(node);
  }
  const set = state.data.sets.find((item) => item.id === state.activeSetId);
  if (state.renderedSetId !== set.id) { state.studioPage = 1; state.renderedSetId = set.id; }
  const brief = state.data.briefs.find((record) => record.id === set.currentBriefId);
  if (!brief) { detail.append(el('p', 'notice error', 'The current brief is unavailable. Refresh the project before continuing.')); return; }
  const heading = el('div', 'view-toolbar'); const intro = el('div');
  intro.append(el('span', 'section-number', set.mode === 'paid' ? 'PAID CREATIVE SET' : 'ORGANIC CREATIVE SET'), el('h3', '', set.name));
  const revise = projectButton('Revise brief', 'button secondary', () => editSet(set)); revise.disabled ||= Boolean(set.archived);
  const archive = projectButton(set.archived ? 'Restore set' : 'Archive set', 'text-button', (event) => action(event.currentTarget, async () => {
    const projectId = state.projectId;
    await api(`${projectPath(projectId)}/sets/${encodeURIComponent(set.id)}/archive`, { archived: !set.archived });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify(set.archived ? 'Creative set restored.' : 'Creative set archived. Its brief, images, and selected ideas remain available.');
  }));
  heading.append(intro, revise, archive); detail.append(heading);
  if (set.archived) detail.append(el('p', 'notice', 'This set is archived. Restore it to revise its brief, select ideas, or produce new images.'));
  const briefCard = el('section', 'brief-card');
  addDetail(briefCard, 'Goal', brief.goal); addDetail(briefCard, 'Audience', brief.audience); addDetail(briefCard, 'Objective', brief.objective);
  if (set.mode === 'paid') { addDetail(briefCard, 'Offer', brief.offer); addDetail(briefCard, 'Proof', brief.proof); }
  else { addDetail(briefCard, 'Theme', brief.theme); addDetail(briefCard, 'Caption direction', brief.caption); }
  addDetail(briefCard, 'Call to action', brief.cta); addDetail(briefCard, 'Output language', brief.language);
  addDetail(briefCard, 'Claims to avoid', brief.prohibitedClaims); addDetail(briefCard, 'Visual style', brief.style);
  addDetail(briefCard, 'Selected visual references', (brief.assetIds || []).map((id) => state.data.assets.find((asset) => asset.id === id)?.name || id));
  const versions = state.data.briefs.filter((record) => record.setId === set.id);
  const history = el('details', 'card-details'); history.append(el('summary', '', `Brief history · ${versions.length} versions`));
  for (const version of [...versions].reverse()) {
    const row = el('div', 'brief-history-row'); row.append(el('span', 'card-meta', `${dateLabel(version.createdAt)}${version.id === brief.id ? ' · Current' : ''}`), el('p', 'detail-text', version.goal));
    const full = el('details', 'technical-details'); full.append(el('summary', '', 'View saved brief'), el('pre', '', JSON.stringify(version, null, 2))); row.append(full); history.append(row);
  }
  briefCard.append(history); detail.append(briefCard);
  const actions = el('div', 'view-toolbar set-ideas-toolbar');
  actions.append(el('h3', '', `Selected ideas · ${set.conceptIds.length}`), projectButton('Add saved ideas', 'button secondary', () => addSetIdeas(set)), projectButton('Develop ideas ↗', 'button primary', () => createForSet(set, brief)));
  if (set.archived) for (const node of actions.querySelectorAll('button')) node.disabled = true;
  detail.append(actions);
  if (!set.conceptIds.length) detail.append(el('p', 'field-hint', 'No ideas selected yet. Add saved versions or develop ideas using this brief.'));
  for (const id of set.conceptIds) {
    const idea = state.data.concepts.find((record) => record.id === id);
    if (!idea) { detail.append(el('p', 'notice error', `Referenced idea is unavailable: ${id}`)); continue; }
    const card = el('article', 'set-idea-card'); card.append(el('h3', '', idea.title), el('p', 'field-hint', idea.angle), el('p', 'work-body', idea.body));
    const selection = set.conceptSelections?.find((record) => record.conceptId === id);
    card.append(el('p', 'badge', selection?.decision === 'adopted' ? 'Selected in this set' : selection?.decision === 'rejected' ? 'Rejected in this set' : 'No decision in this set'));
    if (selection?.reason) card.append(el('p', 'field-hint', selection.reason));
    const decide = projectButton('Record set decision', 'text-button', () => recordSetDecision(idea, set));
    decide.disabled ||= Boolean(set.archived || idea.archived); card.append(decide);
    const continueButton = projectButton('Continue this version ↗', 'text-button', () => { continueConcept(idea); $('#creative-set').value = set.id; }); continueButton.disabled ||= Boolean(set.archived || idea.archived); card.append(continueButton);
    if (idea.archived) card.append(el('p', 'field-hint', 'This idea is archived. Its set reference is preserved.'));
    detail.append(card);
  }
  detail.append(renderStudio(set));
}

async function fileBase64(file, maximum) {
  if (file.size > maximum) throw new Error(`The selected file exceeds ${Math.floor(maximum / 1024 / 1024)} MiB.`);
  const bytes = new Uint8Array(await file.arrayBuffer()), chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(chunks.join(''));
}

function imagePreview(asset, className = 'asset-preview') {
  const image = el('img', className);
  image.src = `${projectPath()}/assets/${encodeURIComponent(asset.id)}/file`;
  image.alt = asset.name; image.loading = 'lazy'; image.decoding = 'async';
  image.addEventListener('error', () => { image.replaceWith(el('p', 'notice error', 'The archived image could not be loaded. Check the file and local service.')); });
  return image;
}

function assetFileLink(asset) {
  const link = el('a', 'text-button asset-file-link', 'Open saved PNG ↗');
  link.href = `${projectPath()}/assets/${encodeURIComponent(asset.id)}/file`;
  link.target = '_blank'; link.rel = 'noopener'; link.title = 'Inspect the saved image at full size in a new tab';
  return link;
}

function uploadImage(set = null) {
  const editor = openEditor(set ? 'Import an image into this project' : 'Import a reference image or logo', 'PNG, JPEG, or WebP, up to 20 MiB. The server decodes the image, removes metadata, and saves a verified PNG. Import does not generate an image.', 'Import image', async (form, projectId) => {
    const values = formValues(form), file = form.elements.image.files[0];
    if (!file) throw new Error('Choose an image file.');
    const base64 = await fileBase64(file, 20 * 1024 * 1024);
    const attach = set && form.elements.attachToSet.checked;
    await api(`${projectPath(projectId)}/images`, { name: values.name, source: values.source, role: values.role, base64, caption: values.caption, style: values.style, ...(attach ? { setId: set.id, conceptId: values.conceptId } : {}) });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify(attach ? 'Imported image saved as a new work version in this set.' : 'Image saved to the project library.');
  });
  const fields = editor.fields;
  const file = addField(fields, 'Image file', 'image', '', { type: 'file', required: true }); file.accept = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
  const name = addField(fields, 'Image name', 'name', '', { required: true, maxLength: 160 });
  const source = addField(fields, 'Source', 'source', '', { required: true, maxLength: 500, placeholder: 'For example: My original photo / Approved brand asset' });
  const role = addField(fields, 'Use as', 'role', 'reference', { options: [{ value: 'reference', label: 'Reference or work image' }, { value: 'logo', label: 'Logo' }] });
  if (set) {
    const label = el('label', 'record-choice'), attach = el('input'); attach.type = 'checkbox'; attach.name = 'attachToSet'; attach.checked = Boolean(set.conceptIds.length);
    label.append(attach, el('span', '', 'Attach as a work version in this creative set')); fields.append(label);
    const concept = addField(fields, 'Selected idea version', 'conceptId', set.conceptIds[0] || '', { required: attach.checked, options: set.conceptIds.map((id) => ({ value: id, label: state.data.concepts.find((idea) => idea.id === id)?.title || id })) });
    const update = () => { if (role.value === 'logo') attach.checked = false; attach.disabled = role.value === 'logo' || !set.conceptIds.length; concept.required = attach.checked; concept.parentElement.hidden = !attach.checked; };
    attach.addEventListener('change', update); role.addEventListener('change', update); update();
  }
  addField(fields, 'Caption', 'caption', '', { multiline: true, maxLength: 8000 });
  addField(fields, 'Style', 'style', '', { maxLength: 200 });
  file.addEventListener('change', () => {
    if (file.files[0] && !name.value) name.value = file.files[0].name.replace(/\.[^.]+$/, '').slice(0, 160);
    if (file.files[0] && !source.value) source.value = file.files[0].name.slice(0, 500);
  });
}

function assetTask(asset, taskType) {
  const extraction = taskType === 'extract_brand';
  const editor = openEditor(extraction ? 'Extract a brand draft from this image' : 'Review this image version', extraction ? 'Runs once on the selected image. Extracted brand information remains an unconfirmed draft until you review and confirm it.' : 'Runs one independent review of this image and caption. Unresolved blockers and anything the reviewer cannot judge prevent final adoption.', extraction ? 'Extract brand draft' : 'Run review', async (form) => {
    const values = formValues(form);
    await submitRun({ taskType, assetId: asset.id, goal: values.goal, language: values.language });
  });
  editor.fields.append(el('p', 'source-strip', asset.name));
  editor.fields.append(el('p', 'field-hint', 'The runtime receives a normalized image of up to 1,024 × 1,024 pixels. The original image is preserved. Small text and fine visual details may require your own inspection.'));
  addField(editor.fields, extraction ? 'Extraction goal' : 'Review goal', 'goal', extraction ? 'Extract visible brand and product information. Keep uncertain details explicitly unknown and do not infer unshown claims.' : 'Review the image and caption against confirmed brand facts and its creative brief. Check factual claims, copy, product appearance, and brand fit. Flag anything you cannot judge.', { required: true, multiline: true, rows: 4, maxLength: 2000 });
  addField(editor.fields, 'Output language', 'language', 'English', { options: ['English', 'Chinese'] });
  editor.submit.disabled = !canRun();
}

function runtimeButton(label, handler) {
  const node = projectButton(label, 'button secondary', handler); node.dataset.needsRuntime = 'true'; node.disabled = !canRun(); return node;
}

function renderImages() {
  const list = $('#image-library'); list.replaceChildren();
  fillOptions($('#image-style-filter'), [...new Set(state.data.assets.map((asset) => asset.style).filter(Boolean))].sort().map((style) => ({ value: style, label: style })), 'All styles');
  const assets = filterAssets(state.data.assets, { style: $('#image-style-filter').value, adoption: $('#image-adoption-filter').value }).reverse();
  state.imagePage = Math.min(state.imagePage, Math.max(1, Math.ceil(assets.length / IMAGE_PAGE_SIZE)));
  $('#image-filter-count').textContent = `${assets.length} of ${state.data.assets.length} images`;
  $('#image-pagination-container').replaceChildren(imagePagination('image-pagination', 'Project image pages', assets.length, state.imagePage, (page) => { state.imagePage = page; renderImages(); }));
  if (!assets.length) { list.append(state.data.assets.length ? emptyState('No images match these filters', 'Choose another style or decision to see more saved images.') : emptyState('Keep your visual references together', 'Import a logo, product photo, or reference image. Each file stays inside this project.')); return; }
  for (const asset of assets.slice((state.imagePage - 1) * IMAGE_PAGE_SIZE, state.imagePage * IMAGE_PAGE_SIZE)) {
    const card = el('article', 'record-card image-card'); card.dataset.assetId = asset.id; card.append(imagePreview(asset), el('h3', '', asset.name), el('p', 'card-meta', `${asset.width} × ${asset.height} · ${asset.role === 'logo' ? 'Logo' : asset.method === 'layered' ? 'Local composition' : 'Imported image'}`));
    addDetail(card, 'Source', asset.source); addDetail(card, 'Style', asset.style);
    const decision = assetDecision(asset); if (decision) card.append(el('span', 'badge', decision === 'adopted' ? 'Adopted by user' : 'Rejected by user'));
    const actions = el('div', 'asset-actions'); actions.append(assetFileLink(asset), runtimeButton('Extract brand draft', () => assetTask(asset, 'extract_brand')));
    if (asset.setId) actions.append(button('Open in set ↗', 'text-button', () => { state.activeSetId = asset.setId; switchView('sets'); }));
    card.append(actions); list.append(card);
  }
}

function imagePagination(id, label, total, page, onPage) {
  const pages = Math.max(1, Math.ceil(total / IMAGE_PAGE_SIZE));
  const nav = el('nav', 'asset-pagination'); nav.id = id; nav.setAttribute('aria-label', label);
  nav.dataset.page = String(page); nav.dataset.totalPages = String(pages); nav.dataset.totalResults = String(total);
  const start = total ? (page - 1) * IMAGE_PAGE_SIZE + 1 : 0, end = Math.min(page * IMAGE_PAGE_SIZE, total);
  const summary = el('span', 'asset-page-summary', `Images ${start.toLocaleString('en')}–${end.toLocaleString('en')} of ${total.toLocaleString('en')}`); summary.setAttribute('aria-live', 'polite');
  nav.append(summary);
  const controls = el('div', 'asset-page-controls');
  const changePage = (next) => {
    onPage(Math.min(pages, Math.max(1, next)));
    document.getElementById(id)?.querySelector('[data-page-select]')?.focus();
  };
  const previous = button('Previous', 'button secondary', () => changePage(page - 1)); previous.dataset.pageAction = 'previous'; previous.disabled = page <= 1;
  const next = button('Next', 'button secondary', () => changePage(page + 1)); next.dataset.pageAction = 'next'; next.disabled = page >= pages;
  const last = button('Last', 'button secondary', () => changePage(pages)); last.dataset.pageAction = 'last'; last.disabled = page >= pages;
  const pageLabel = el('label', 'asset-page-label', 'Page');
  const select = el('select'); select.dataset.pageSelect = 'true'; select.disabled = pages === 1;
  fillOptions(select, Array.from({ length: pages }, (_, index) => ({ value: String(index + 1), label: `${index + 1} of ${pages}` })), null, String(page));
  select.addEventListener('change', () => changePage(Number(select.value))); pageLabel.append(select);
  controls.append(previous, pageLabel, next, last); nav.append(controls);
  return nav;
}

function assetDecision(asset) {
  return state.data.selections.filter((item) => item.targetType === 'asset' && item.targetId === asset.id && ['adopted', 'rejected'].includes(item.decision)).at(-1)?.decision;
}

function filterAssets(assets, filters) {
  return assets.filter((asset) => (!filters.style || asset.style === filters.style) && (filters.adoption === 'all' || (filters.adoption === 'not_adopted' ? assetDecision(asset) !== 'adopted' : assetDecision(asset) === filters.adoption)));
}

function composeImage(set, existing = null) {
  const images = state.data.assets.filter((asset) => asset.role !== 'logo'), logos = state.data.assets.filter((asset) => asset.role === 'logo');
  if (!set.conceptIds.length || !images.length || !logos.length) { notify('Add an idea to this set, then import a visual and a logo before composing.', true); return; }
  const composition = existing?.composition;
  const editor = openEditor(existing ? 'Compose a new image version' : 'Compose an image locally', 'An editorial template places the selected visual, exact headline, logo, and optional call to action. No model call is made. Overflow and missing fonts are reported before success.', 'Create composition', async (form, projectId) => {
    const values = formValues(form);
    await api(`${projectPath(projectId)}/compose`, { ...values, setId: set.id, ...(existing ? { parentAssetId: existing.id } : {}) });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify('New composition saved. Review it before final adoption.');
  });
  const fields = editor.fields;
  addField(fields, 'Idea version', 'conceptId', existing?.conceptId || set.conceptIds[0], { required: true, options: (existing ? [existing.conceptId] : set.conceptIds).map((id) => ({ value: id, label: state.data.concepts.find((idea) => idea.id === id)?.title || id })) });
  addField(fields, 'Source visual', 'visualId', composition?.visualId || images[0].id, { required: true, options: images.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.width} × ${asset.height}` })) });
  addField(fields, 'Logo', 'logoId', composition?.logoId || logos[0].id, { required: true, options: logos.map((asset) => ({ value: asset.id, label: asset.name })) });
  addField(fields, 'Image name', 'name', existing?.name || '', { maxLength: 160 });
  addField(fields, 'Exact headline', 'headline', composition?.headline || '', { required: true, multiline: true, maxLength: 300 });
  addField(fields, 'Call to action', 'cta', composition?.cta || '', { maxLength: 100 });
  addField(fields, 'Aspect ratio', 'ratio', composition?.ratio || '4:5', { options: [{ value: '1:1', label: 'Square · 1:1' }, { value: '4:5', label: 'Portrait · 4:5' }, { value: '9:16', label: 'Tall · 9:16' }] });
  addField(fields, 'Font', 'font', composition?.font || 'Arial', { options: ['Arial', 'Georgia'] });
  addField(fields, 'Caption', 'caption', existing?.caption || '', { multiline: true, rows: 4, maxLength: 8000, hint: 'Leave empty to use the selected idea copy.' });
}

function editCaption(asset) {
  const editor = openEditor('Edit caption as a new version', 'The image stays the same. This saves a new caption version without image generation or research; its review and adoption are checked separately.', 'Save caption version', async (form, projectId) => {
    await api(`${projectPath(projectId)}/assets/${encodeURIComponent(asset.id)}/caption`, { caption: formValues(form).caption });
    await refreshProject(projectId); if (projectId === state.projectId) notify('New caption version saved. The earlier version is preserved.');
  });
  addField(editor.fields, 'Caption', 'caption', asset.caption, { required: true, multiline: true, rows: 7, maxLength: 8000 });
}

function resolveReview(review, issue) {
  const editor = openEditor('Resolve a review issue', 'Only resolve this after checking the image and the relevant evidence yourself. Your explanation is stored separately from the original review.', 'Record resolution', async (form, projectId) => {
    await api(`${projectPath(projectId)}/reviews/${encodeURIComponent(review.id)}/resolve`, { issueId: issue.id, reason: formValues(form).reason });
    await refreshProject(projectId); if (projectId === state.projectId) notify('Your resolution is saved alongside the unchanged review.');
  });
  editor.fields.append(el('p', 'source-strip', issue.explanation));
  addField(editor.fields, 'What did you check, and why is this resolved?', 'reason', '', { required: true, multiline: true, rows: 5, maxLength: 1500 });
}

function selectAsset(asset, decision) {
  const titles = { adopted: 'Adopt this image version', rejected: 'Reject this image version', published: 'Mark as published', unpublished: 'Mark as unpublished' };
  const editor = openEditor(titles[decision], decision === 'adopted' ? 'You make the final choice. The server checks the review, current brand facts, and current brief before recording adoption. Adoption does not publish the image.' : 'This records your decision for this specific version. It does not publish, unpublish, or delete anything on an external platform.', 'Save decision', async (form, projectId) => {
    await api(`${projectPath(projectId)}/selections`, { targetType: 'asset', targetId: asset.id, decision, reason: formValues(form).reason });
    await refreshProject(projectId); if (projectId === state.projectId) notify('Your decision is saved for this image version.');
  });
  editor.fields.append(el('p', 'source-strip', asset.name));
  addField(editor.fields, 'Reason or publication note', 'reason', '', { required: true, multiline: true, maxLength: 1500 });
}

function assetFeedback(asset) {
  const editor = openEditor('Leave feedback on this image', 'Feedback defaults to this image version. Choose a broader scope explicitly; feedback never confirms brand facts automatically.', 'Save feedback', async (form, projectId) => {
    const values = formValues(form);
    await api(`${projectPath(projectId)}/feedback`, { targetType: 'asset', targetId: asset.id, scope: values.scope, content: values.content, ...(values.scope === 'set' ? { setId: asset.setId } : {}), ...(values.scope === 'style' ? { style: values.style } : {}), tags: [] });
    await refreshProject(projectId); if (projectId === state.projectId) notify('Feedback saved with the scope you selected.');
  });
  const scope = addField(editor.fields, 'Apply to', 'scope', 'asset', { options: [{ value: 'asset', label: 'This image version (default)' }, ...(asset.setId ? [{ value: 'set', label: 'This creative set' }] : []), { value: 'style', label: 'A named visual style' }, { value: 'brand', label: 'Brand-level feedback, not a fact' }, { value: 'project', label: 'All future work in this project' }] });
  const style = addField(editor.fields, 'Style name', 'style', asset.style || '', { maxLength: 200 });
  const update = () => { style.parentElement.hidden = scope.value !== 'style'; style.required = scope.value === 'style'; }; scope.addEventListener('change', update); update();
  addField(editor.fields, 'Feedback', 'content', '', { required: true, multiline: true, rows: 5, maxLength: 1500 });
}

function reviewDetails(asset) {
  const details = el('details', 'asset-reviews');
  const reviews = state.data.reviews.filter((review) => review.assetId === asset.id);
  details.append(el('summary', '', `Reviews & decisions · ${reviews.length} reviews`));
  if (!reviews.length) details.append(el('p', 'field-hint', 'Run an independent review before adoption.'));
  for (const review of [...reviews].reverse()) {
    const section = el('section', 'review-record'); section.append(el('p', 'card-meta', dateLabel(review.createdAt)), el('p', 'detail-text', review.summary));
    for (const issue of review.issues) {
      const resolved = state.data.selections.find((record) => record.decision === 'issue_resolved' && record.reviewId === review.id && record.issueId === issue.id);
      const row = el('div', `review-issue ${resolved ? 'resolved' : ['blocker', 'unable_to_judge'].includes(issue.severity) ? 'blocking' : ''}`);
      row.append(el('span', 'badge', resolved ? 'Resolved by user' : issue.severity === 'unable_to_judge' ? 'Unable to judge · Blocks adoption' : issue.severity), el('p', 'detail-label', issue.category), el('p', 'detail-text', issue.explanation));
      addDetail(row, 'Suggested action', issue.suggestedAction);
      if (resolved) addDetail(row, 'Resolution', resolved.reason);
      else row.append(projectButton('Record resolution', 'text-button', () => resolveReview(review, issue)));
      section.append(row);
    }
    details.append(section);
  }
  for (const record of state.data.selections.filter((item) => item.targetType === 'asset' && item.targetId === asset.id && item.decision !== 'issue_resolved')) {
    const row = el('div', 'feedback-item'); row.append(el('span', '', `${record.decision} · ${dateLabel(record.createdAt)}`), el('p', '', record.reason)); details.append(row);
  }
  for (const record of state.data.feedback.filter((item) => item.targetType === 'asset' && item.targetId === asset.id)) {
    const row = el('div', 'feedback-item'); row.append(el('span', '', `Feedback · ${record.scope} scope`), el('p', '', record.content)); details.append(row);
  }
  return details;
}

function assetCard(asset, set) {
  const card = el('article', 'studio-asset-card'); card.dataset.assetId = asset.id; card.append(imagePreview(asset));
  const content = el('div', 'studio-asset-content');
  const selections = state.data.selections.filter((record) => record.targetType === 'asset' && record.targetId === asset.id);
  const adopted = selections.filter((record) => ['adopted', 'rejected'].includes(record.decision)).at(-1)?.decision === 'adopted';
  const publication = selections.filter((record) => ['published', 'unpublished'].includes(record.decision)).at(-1)?.decision;
  const meta = el('div', 'card-topline'); meta.append(el('span', 'badge', adopted ? 'Adopted version' : 'Draft version'), el('span', 'card-meta', dateLabel(asset.createdAt))); content.append(meta, el('h3', '', asset.name), el('p', 'card-meta', `${asset.width} × ${asset.height} · ${asset.method === 'layered' ? 'Local template composition' : 'Imported image'}${asset.change === 'caption_only' ? ' · Caption edit' : ''}`));
  if (publication) content.append(el('p', 'field-hint', `Manually marked ${publication}.`));
  if (asset.briefId !== set.currentBriefId) content.append(el('p', 'notice error', 'This image uses an earlier brief. Produce a new version under the current brief before adoption.'));
  if (asset.caption) content.append(el('p', 'work-body asset-caption', asset.caption));
  const actions = el('div', 'asset-actions');
  actions.append(assetFileLink(asset), projectButton('Edit caption', 'button secondary', () => editCaption(asset)), runtimeButton('Run review', () => assetTask(asset, 'review_asset')), projectButton('Feedback', 'text-button', () => assetFeedback(asset)));
  if (asset.composition) actions.append(projectButton('Recompose', 'text-button', () => composeImage(set, asset)));
  const reviews = state.data.reviews.filter((review) => review.assetId === asset.id);
  const unresolved = reviews.some((review) => review.issues.some((issue) => ['blocker', 'unable_to_judge'].includes(issue.severity) && !selections.some((record) => record.decision === 'issue_resolved' && record.reviewId === review.id && record.issueId === issue.id)));
  const adopt = projectButton(adopted ? 'Adoption recorded' : 'Adopt version', 'button primary', () => selectAsset(asset, 'adopted'));
  adopt.disabled = isArchived() || adopted || !reviews.length || unresolved || asset.briefId !== set.currentBriefId;
  adopt.title = !reviews.length ? 'Run a review first.' : unresolved ? 'Resolve blocking review issues first.' : 'The server rechecks current facts and brief before adoption.';
  actions.append(adopt, projectButton('Reject', 'text-button', () => selectAsset(asset, 'rejected')));
  content.append(actions, reviewDetails(asset));
  const publicationActions = el('div', 'publication-actions'); publicationActions.append(el('span', 'field-hint', 'Publication record:'), projectButton('Published', 'text-button', () => selectAsset(asset, 'published')), projectButton('Unpublished', 'text-button', () => selectAsset(asset, 'unpublished'))); content.append(publicationActions);
  const technical = el('details', 'technical-details'); technical.append(el('summary', '', 'Image lineage and machine checks'), el('pre', '', JSON.stringify({ id: asset.id, lineage: asset.lineage, recordedParentId: asset.parentId, conceptId: asset.conceptId, briefId: asset.briefId, artifactHash: asset.artifactHash, method: asset.method, composition: asset.composition, machineChecks: asset.machineChecks }, null, 2))); content.append(technical);
  if (set.archived) for (const node of content.querySelectorAll('button')) { node.disabled = true; node.dataset.blockedBySet = 'true'; }
  card.append(content); return card;
}

function renderStudio(set) {
  const section = el('section', 'studio-section');
  const heading = el('div', 'view-toolbar'); const intro = el('div'); intro.append(el('span', 'section-number', 'STUDIO'), el('h3', '', 'Make, review, and choose.'));
  heading.append(intro, projectButton('Import image', 'button secondary', () => uploadImage(set)), projectButton('Compose locally', 'button primary', () => composeImage(set))); section.append(heading);
  if (set.archived) for (const node of heading.querySelectorAll('button')) node.disabled = true;
  const capability = el('details', 'capability-note');
  capability.append(el('summary', '', 'Native image generation & editing · Unavailable'));
  capability.append(el('p', 'field-hint', state.imageRuntime?.detail || 'Image capability status is being checked. No native image request can be submitted.'));
  for (const blocker of state.imageRuntime?.blockers || []) capability.append(el('p', 'field-hint', blocker.detail || readable(blocker)));
  capability.append(button('Refresh image capability status', 'text-button', refreshImageRuntime)); section.append(capability);
  const allAssets = state.data.assets.filter((asset) => asset.setId === set.id);
  const filters = state.studioFilters[set.id] ||= { style: '', adoption: 'all' };
  const filterRow = el('div', 'asset-filters');
  for (const [key, label, options] of [
    ['style', 'Style', [{ value: '', label: 'All styles' }, ...[...new Set(allAssets.map((asset) => asset.style).filter(Boolean))].sort().map((style) => ({ value: style, label: style }))]],
    ['adoption', 'Decision', [{ value: 'all', label: 'All decisions' }, { value: 'adopted', label: 'Adopted' }, { value: 'not_adopted', label: 'Not adopted' }, { value: 'rejected', label: 'Rejected' }]],
  ]) {
    const field = el('label', '', label), select = el('select'); select.dataset.studioFilter = key;
    fillOptions(select, options, null, filters[key]); filters[key] = select.value; field.append(select); filterRow.append(field);
    select.addEventListener('change', () => { filters[key] = select.value; state.studioPage = 1; renderSets(); $('#set-detail').querySelector(`[data-studio-filter="${key}"]`).focus(); });
  }
  const assets = filterAssets(allAssets, filters).reverse();
  state.studioPage = Math.min(state.studioPage, Math.max(1, Math.ceil(assets.length / IMAGE_PAGE_SIZE)));
  filterRow.append(el('span', 'field-hint', `${assets.length} of ${allAssets.length} images`)); section.append(filterRow);
  const exports = el('div', 'export-toolbar');
  exports.append(el('p', 'field-hint', 'Draft exports include every image version. Final exports include only adopted versions that still pass their review checks. Export does not publish.'));
  for (const draft of [true, false]) {
    exports.append(button(draft ? 'Export drafts ZIP ↓' : 'Export final ZIP ↓', 'button secondary', (event) => action(event.currentTarget, () => exportSet(set, draft))));
  }
  section.append(exports);
  section.append(imagePagination('studio-pagination', 'Studio image pages', assets.length, state.studioPage, (page) => { state.studioPage = page; renderSets(); }));
  if (!assets.length) section.append(allAssets.length ? emptyState('No images match these filters', 'Choose another style or decision to see more saved versions.') : emptyState('This set has no image versions yet', 'Import a work image, or compose a visual, headline, and logo using the local template.'));
  for (const asset of assets.slice((state.studioPage - 1) * IMAGE_PAGE_SIZE, state.studioPage * IMAGE_PAGE_SIZE)) section.append(assetCard(asset, set));
  return section;
}

async function exportSet(set, draft) {
  await downloadArchive(`${projectPath()}/sets/${encodeURIComponent(set.id)}/export?draft=${draft ? '1' : '0'}`, `${set.name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'creative-set'}-${draft ? 'drafts' : 'final'}.zip`);
}

async function downloadArchive(path, filename) {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) {
    let message = `Export failed (${response.status}).`;
    try { message = (await response.json()).error?.message || message; } catch { /* Keep the HTTP error. */ }
    throw new Error(message);
  }
  if (!(response.headers.get('Content-Type') || '').includes('application/zip')) throw new Error('The server did not return a ZIP file. Nothing was downloaded.');
  const blob = await response.blob(), url = URL.createObjectURL(blob);
  const link = el('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function restoreBackup() {
  const editor = openEditor('Restore a private project backup', 'Restore creates a separate data directory. It preserves the current workspace and does not add or overwrite an active project. After restoration, you can restart the local service using the restored directory.', 'Restore to a new directory', async (form) => {
    const file = form.elements.backup.files[0];
    if (!file) throw new Error('Choose a .tdbackup file.');
    if (!/\.tdbackup$/i.test(file.name)) throw new Error('Choose a Third Draft .tdbackup file.');
    const result = await api('/api/restore', { base64: await fileBase64(file, 64 * 1024 * 1024) });
    openContext('Backup restored to a separate directory');
    const content = $('#context-content'); content.replaceChildren();
    content.append(el('p', 'section-description', `“${result.name}” was restored. The active workspace has not changed.`), el('h3', 'context-section-title', 'Restored location'), el('pre', 'restore-path', result.destinationDir), el('p', 'detail-text', 'To open the restored project, stop the local service. From the Third Draft repository, set THIRD_DRAFT_DATA_DIR to this location and start the service again.'));
    const command = `$env:THIRD_DRAFT_DATA_DIR = '${String(result.destinationDir).replaceAll("'", "''")}'\nnpm start`;
    content.append(el('pre', 'restore-command', command), el('p', 'field-hint', 'Use a new browser session after restarting. Keep the .tdbackup file private: it contains project knowledge, assets, feedback, and run records.'));
    notify('Backup restored to a separate directory. Follow the displayed restart instructions to open it.');
  }, { allowArchived: true });
  const file = addField(editor.fields, 'Third Draft backup file', 'backup', '', { type: 'file', required: true, hint: 'Maximum 64 MiB. The service checks file hashes, paths, and schema before restoring.' }); file.accept = '.tdbackup';
}

function skillIdentifiers(value) { return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean); }

function importSkill() {
  const editor = openEditor('Import a skill', 'Choose a package folder containing SKILL.md, or a single SKILL.md file. Imported scripts are stored for inspection and are never executed. The package stays disabled until you enable it for a project.', 'Import package', async (form) => {
    const folderFiles = [...form.elements.folder.files], singleFiles = [...form.elements.single.files];
    if (Boolean(folderFiles.length) === Boolean(singleFiles.length)) throw new Error('Choose either one package folder or one SKILL.md file.');
    const files = folderFiles.length ? folderFiles : singleFiles;
    if (files.length > 128 || files.reduce((total, file) => total + file.size, 0) > 5 * 1024 * 1024) throw new Error('A skill package may contain at most 128 files and 5 MiB.');
    const uploaded = [];
    for (const file of files) {
      const path = file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name;
      uploaded.push({ path, base64: await fileBase64(file, 5 * 1024 * 1024) });
    }
    if (!uploaded.some((file) => file.path === 'SKILL.md')) throw new Error('The package must contain SKILL.md at its root.');
    const values = formValues(form);
    await api('/api/skills', { files: uploaded, source: values.source, requiresCapabilities: skillIdentifiers(values.requiresCapabilities), permissions: chosenValues(form, 'permissions'), roles: skillIdentifiers(values.roles), ...(values.license ? { license: values.license } : {}), ...(values.declaredVersion ? { declaredVersion: values.declaredVersion } : {}) });
    await refreshSkills();
    notify('Skill imported into the shared library. Review it before enabling it for this project.');
  }, { allowArchived: true });
  const folder = addField(editor.fields, 'Package folder', 'folder', '', { type: 'file', hint: 'Choose the folder whose root contains SKILL.md. Up to 128 files and 5 MiB.' });
  folder.setAttribute('webkitdirectory', ''); folder.multiple = true;
  const single = addField(editor.fields, 'Or a single SKILL.md file', 'single', '', { type: 'file' }); single.accept = '.md,text/markdown';
  folder.addEventListener('change', () => { if (folder.files.length) single.value = ''; });
  single.addEventListener('change', () => { if (single.files.length) folder.value = ''; });
  addField(editor.fields, 'Source / provenance', 'source', '', { required: true, maxLength: 500, placeholder: 'Repository URL, author, or local origin' });
  addField(editor.fields, 'Declared version', 'declaredVersion', '', { maxLength: 80 });
  addField(editor.fields, 'License', 'license', '', { maxLength: 200, hint: 'Leave blank if unverified. Import does not verify licensing.' });
  addField(editor.fields, 'Required capabilities', 'requiresCapabilities', 'text_generate', { maxLength: 2000, hint: 'Comma-separated identifiers, such as text_generate, structured_output, vision_input.' });
  addField(editor.fields, 'Roles', 'roles', '', { maxLength: 2000, hint: 'Optional comma-separated role identifiers declared by the skill.' });
  addChoices(editor.fields, 'Requested permissions', 'permissions', [{ id: 'method_text', title: 'Include method text in selected run context' }, { id: 'read_selected_assets', title: 'Read explicitly selected project assets' }], ['method_text']);
}

function renderSkills() {
  const list = $('#skills-list'); list.replaceChildren();
  if (!state.skills) {
    list.append(emptyState('Skill library unavailable', 'Refresh the library to inspect and bind imported packages.'), button('Refresh library', 'button secondary', (event) => action(event.currentTarget, refreshSkills)));
    return;
  }
  if (!state.skills.length) { list.append(emptyState('Bring a useful method', 'Import a SKILL.md package, inspect its contents and provenance, then choose whether this project should use it.')); return; }
  for (const skill of state.skills) {
    const binding = state.data.skills.find((item) => item.id === skill.id), enabled = Boolean(binding?.enabled);
    const card = el('article', 'record-card skill-card');
    const badges = el('div', 'card-topline'); badges.append(el('span', `badge ${enabled ? 'confirmed' : ''}`, enabled ? 'Enabled for this project' : 'Not enabled'), el('span', 'quiet-label', skill.reviewStatus || 'Unreviewed'));
    card.append(badges, el('h3', '', skill.name), el('p', 'knowledge-source', `Source: ${skill.source}`), el('p', 'field-hint', `Version: ${skill.declaredVersion || 'Undeclared'} · License: ${skill.license || 'Unverified'}`));
    card.append(el('p', 'field-hint', `Requires: ${skill.requiresCapabilities?.join(', ') || 'No declared capabilities'} · Permissions: ${skill.permissions?.join(', ') || 'None declared'}`));
    for (const warning of skill.inspection?.warnings || []) card.append(el('p', 'field-hint', readable(warning)));
    if (skill.scripts?.length) card.append(el('p', 'field-hint', `${skill.scripts.length} script file(s) preserved for inspection. No scripts are executed.`));
    const details = el('details', 'technical-details');
    details.append(el('summary', '', 'Inspect manifest and file hashes'), el('pre', '', JSON.stringify({ id: skill.id, contentHash: skill.contentHash, manifestHash: skill.manifestHash, importedAt: skill.importedAt, roles: skill.roles, files: skill.files, inspection: skill.inspection }, null, 2)));
    card.append(details);
    card.append(projectButton(enabled ? 'Disable for this project' : 'Enable for this project', 'button secondary', (event) => action(event.currentTarget, async () => {
      const projectId = state.projectId;
      await api(`${projectPath(projectId)}/skills`, { skillId: skill.id, enabled: !enabled });
      await refreshProject(projectId);
      if (projectId === state.projectId) notify(enabled ? 'Skill disabled for future runs. Existing run snapshots are unchanged.' : 'This skill version is enabled for compatible future runs. Check Preview context before creating.');
    })));
    list.append(card);
  }
}

function renderProjects() {
  const list = $('#project-list');
  list.replaceChildren();
  for (const project of state.projects) {
    const node = button('', 'project-button', () => selectProject(project.id));
    node.classList.toggle('selected', project.id === state.projectId);
    if (project.id === state.projectId) node.setAttribute('aria-current', 'true');
    const symbol = el('span', 'project-symbol', project.name.slice(0, 1));
    symbol.setAttribute('aria-hidden', 'true');
    node.append(symbol, el('span', '', project.name));
    if (project.archived) node.append(el('span', 'project-archived-label', 'Archived'));
    list.append(node);
  }
  if (!state.projects.length) list.append(el('p', 'sidebar-note', 'Your first project starts here.'));
}

async function selectProject(id) {
  const epoch = ++state.epoch;
  state.contextEpoch++;
  state.editorEpoch++;
  $('#context-dialog').close();
  $('#editor-dialog').close();
  clearTimeout(state.pollTimer);
  state.projectId = id;
  state.data = null;
  state.sourceId = null;
  state.activeSetId = null;
  state.renderedSetId = null;
  state.studioFilters = {};
  state.imagePage = 1; state.studioPage = 1;
  $('#creative-form').reset();
  $('#knowledge-form').reset();
  $('#favorites-only').checked = false;
  $('#show-archived-ideas').checked = false;
  $('#image-style-filter').value = '';
  $('#image-adoption-filter').value = 'all';
  $('#idea-angle-filter').value = '';
  $('#idea-theme-filter').value = '';
  $('#evidence-list').replaceChildren();
  $('#source-strip').hidden = true;
  $('#workspace').hidden = true;
  $('#welcome').hidden = true;
  hideNotice();
  renderProjects();
  switchView('create');
  switchMemoryView('facts');
  try {
    await refreshProject(id, epoch);
  } catch (error) {
    if (epoch === state.epoch) notify(`Could not open this project: ${errorMessage(error)} Select the project again to retry.`, true);
  }
}

async function refreshProject(projectId = state.projectId, epoch = state.epoch) {
  if (!projectId) return;
  const data = await api(projectPath(projectId));
  if (epoch !== state.epoch || projectId !== state.projectId) return;
  if (!data.project || !['knowledge', 'concepts', 'feedback', 'runs', 'evidence', 'insights', 'sets', 'briefs', 'assets', 'reviews', 'selections', 'skills'].every((key) => Array.isArray(data[key]))) {
    throw new Error('Project data is incomplete. Check the local service.');
  }
  state.data = data;
  $('#workspace').hidden = false;
  $('#welcome').hidden = true;
  $('#current-project-name').textContent = data.project.name;
  $('#project-summary').textContent = `${data.knowledge.length} knowledge records · ${data.concepts.length} creative versions`;
  $('#knowledge-count').textContent = data.knowledge.length;
  $('#run-count').textContent = data.runs.length;
  $('#set-count').textContent = data.sets.length;
  $('#evidence-count').textContent = data.evidence.length;
  $('#insight-count').textContent = data.insights.length;
  $('#image-count').textContent = data.assets.length;
  $('#open-skills').disabled = false;
  $('#archived-banner').hidden = !isArchived();
  $('#archive-project').textContent = isArchived() ? 'Restore project' : 'Archive project';
  state.projects = state.projects.map((project) => project.id === projectId ? { ...project, archived: data.project.archived } : project);
  renderProjects();
  for (const node of document.querySelectorAll('#knowledge-form input, #knowledge-form textarea, #knowledge-form select, #knowledge-form button, #creative-form input, #creative-form textarea, #creative-form select, #add-manual-idea, #add-evidence, #add-insight, #create-set, #upload-image, #read-source-url')) node.disabled = isArchived();
  fillOptions($('#creative-set'), data.sets.filter((set) => !set.archived).map((set) => ({ value: set.id, label: `${set.name} · ${set.mode === 'paid' ? 'Paid' : 'Organic'}` })), 'Independent ideas');
  fillOptions($('#idea-angle-filter'), [...new Set(data.concepts.map((idea) => idea.angle).filter(Boolean))].sort().map((value) => ({ value, label: value })), 'All angles');
  fillOptions($('#idea-theme-filter'), [...new Set(data.concepts.map((idea) => idea.theme).filter(Boolean))].sort().map((value) => ({ value, label: value })), 'All themes');
  renderCurrentView();
  renderGenerationState();
  schedulePoll();
}

async function refreshRuntime() {
  try {
    state.runtime = await api('/api/runtime');
  } catch (error) {
    state.runtime = { available: false, reason: errorMessage(error) };
    throw error;
  } finally {
    const runtime = state.runtime;
    $('#runtime-dot').classList.toggle('ready', Boolean(runtime?.available));
    $('#runtime-status').textContent = runtime?.available ? 'Connected · Ready to create' : 'Creation unavailable';
    $('#runtime-detail').textContent = runtime?.available
      ? `${readable(runtime.route)} · ${runtime.billing === 'subscription' ? 'Subscription account' : readable(runtime.billing)} · ${readable(runtime.version)}\nSubscription quota: unknown`
      : runtimeGuidance();
    renderGenerationState();
  }
}

async function refreshDispatch() {
  try { state.dispatch = await api('/api/dispatch'); }
  catch (error) { state.dispatch = null; throw error; }
  finally {
    $('#toggle-dispatch').disabled = !state.dispatch;
    $('#toggle-dispatch').textContent = state.dispatch?.paused ? 'Resume new runs' : state.dispatch ? 'Pause new runs' : 'Dispatch status unavailable';
    $('#dispatch-status').textContent = state.dispatch?.paused ? 'New model runs are paused. In-flight work may still finish.' : state.dispatch ? 'New runs are enabled.' : 'Refresh the runtime status before starting a run.';
    renderGenerationState();
  }
}

async function refreshImageRuntime() {
  try { state.imageRuntime = await api('/api/image-runtime'); }
  catch (error) { state.imageRuntime = { available: false, reason: 'status_unavailable', detail: errorMessage(error), blockers: [] }; }
  if (state.data && state.view === 'sets') renderSets();
}

async function refreshSkills() {
  try { state.skills = await api('/api/skills'); if (!Array.isArray(state.skills)) throw new Error('The skill library response is incomplete.'); }
  catch (error) { state.skills = null; throw error; }
  finally { if (state.data && state.view === 'skills') renderSkills(); }
}

function canRun() {
  return Boolean(state.data && state.runtime?.available && state.dispatch && !state.dispatch.paused && !state.submitting && !isArchived() && !state.data.runs.some((run) => ['running', 'archiving'].includes(run.status)));
}

function runtimeGuidance() {
  const reason = state.runtime?.reason;
  if (reason === 'auth_required') return 'Sign in to ChatGPT for the separate Third Draft runtime: run npm run runtime:login from the installation folder, then refresh the connection. Your normal Codex login is separate.';
  if (reason === 'unsupported_capability') return `The installed Codex version or isolation settings do not meet the requirements. See the setup guide; do not remove personal configuration to bypass this check.${state.runtime?.detail ? `\n${state.runtime.detail}` : ''}`;
  return `${reason || 'Runtime status is unknown.'} Check the local Codex installation and connection, then refresh.`;
}

function renderGenerationState() {
  const running = state.data?.runs.find((run) => run.status === 'running' || run.status === 'archiving');
  const unknown = state.data?.runs.at(-1)?.status === 'result_unknown';
  const waiting = ['waiting_quota', 'waiting_auth'].includes(state.data?.runs.at(-1)?.status) ? state.data.runs.at(-1) : null;
  const available = Boolean(state.runtime?.available);
  $('#generate-button').disabled = !canRun();
  $('#preview-context').disabled = !state.data || state.submitting;
  $('#generation-guidance').textContent = !state.dispatch ? 'Dispatch status is unavailable. Refresh the runtime status before starting a run.' : state.dispatch.paused ? 'New runs are paused. Resume them in the sidebar when you are ready.' : !available
    ? `You can still organize project knowledge. ${runtimeGuidance()}`
    : 'Uses your connected subscription; quota is unknown. Clicking starts one run for the selected number of ideas. No automatic research or API billing.';
  const active = $('#active-run');
  active.replaceChildren();
  active.hidden = !running && !state.submitting && !unknown && !waiting;
  if (!active.hidden) {
    const archiving = running?.status === 'archiving';
    active.append(el('strong', '', state.submitting ? 'Submitting this run…' : archiving ? 'Output received; local archival needs recovery' : unknown && !running ? 'The previous run has an unknown external result' : waiting && !running ? runLabels[waiting.status] : 'Working from your saved project context…'));
    active.append(el('p', '', archiving ? 'Check disk space and permissions for the data directory, then restart the local service. Only archival will resume; the model will not run again. Refresh this page after restarting.' : unknown && !running ? 'Check the runtime records first. Starting another run makes a new model call and may create duplicate work. The app will not retry automatically.' : waiting && !running ? waitingGuidance(waiting) : 'Results are saved to this project. Closing this page does not cancel a run that has started.'));
  }
  updateEvidenceSelection();
  for (const node of document.querySelectorAll('[data-needs-runtime]')) node.disabled = !canRun() || node.dataset.blockedBySet === 'true';
}

function tags(node, values) {
  if (!values?.length) return;
  const items = Array.isArray(values) ? values : String(values).split(',');
  const list = el('div', 'tag-list');
  for (const value of items) list.append(el('span', 'tag', value));
  node.append(list);
}

function renderKnowledge() {
  const list = $('#knowledge-list');
  list.replaceChildren();
  if (!state.data.knowledge.length) {
    list.append(emptyState('Give this project some context', 'A few accurate facts and an inspiring reference are enough to begin. You can create with incomplete knowledge.'));
    return;
  }
  const currentFacts = new Map(state.data.knowledge.filter((item) => item.kind === 'brand' && item.status === 'confirmed').map((item) => [item.itemId, item]));
  for (const item of [...state.data.knowledge].reverse()) {
    const currentFact = currentFacts.get(item.itemId);
    const latest = state.data.knowledge.filter((record) => record.itemId === item.itemId).at(-1);
    const confirmed = state.data.knowledge.some((record) => record.previousId === item.id && record.status === 'confirmed');
    const proposedChange = item.kind === 'brand' && item.status === 'draft' && item.previousId && currentFact && !confirmed;
    const card = el('article', 'knowledge-card');
    const top = el('div', 'card-topline');
    const status = item.kind === 'brand' ? (item.status === 'confirmed' ? currentFact.id === item.id ? 'Current confirmed brand fact' : 'Historical confirmed version' : 'Brand draft · Not used in creation') : 'Reference · Not a brand fact';
    top.append(el('span', `badge${item.kind === 'brand' && item.status !== 'confirmed' ? ' draft' : ''}`, status), el('span', 'card-meta', dateLabel(item.createdAt)));
    card.append(top, el('h3', '', item.title));
    if (proposedChange) {
      card.append(el('p', 'notice knowledge-change-notice', 'Proposed change — the existing fact stays active until you confirm. Review both versions yourself.'));
      const comparison = el('div', 'knowledge-comparison');
      for (const [label, record] of [['Current confirmed fact', currentFact], ['Proposed draft', item]]) {
        const column = el('section'); column.append(el('h4', '', label), el('p', 'detail-text', record.content), el('p', 'knowledge-source', `Source: ${record.source}`)); comparison.append(column);
      }
      card.append(comparison);
    } else card.append(el('p', 'work-body', item.content));
    card.append(el('p', 'knowledge-source', `Source: ${item.source}`));
    tags(card, item.tags);
    if (item.kind === 'brand' && item.status === 'draft') {
      if (item.createdBy === 'runtime' || item.assetId) {
        card.append(el('p', 'field-hint knowledge-review-note', 'AI-extracted draft. Nothing is automatically confirmed. Check the image, uncertainty, and current facts before confirming.'));
        const comparison = el('details', 'card-details');
        comparison.append(el('summary', '', `Compare with current confirmed facts · ${currentFacts.size}`));
        if (!currentFacts.size) comparison.append(el('p', 'field-hint', 'This project has no confirmed brand facts yet. Validate the extraction against the original source.'));
        for (const fact of currentFacts.values()) {
          const row = el('div', 'knowledge-fact-comparison'); row.append(el('p', 'detail-label', fact.title), el('p', 'detail-text', fact.content), el('p', 'knowledge-source', `Source: ${fact.source}`)); comparison.append(row);
        }
        card.append(comparison);
        if (item.runId) card.append(button('Inspect extraction context ↗', 'text-button', () => showRun(item.runId)));
      }
      if (confirmed) card.append(el('p', 'knowledge-source', 'A confirmed version has been saved. The original draft is preserved.'));
      else if (latest.id !== item.id) card.append(el('p', 'knowledge-source', 'A newer draft exists. Review the latest draft before confirming.'));
      else {
        const confirm = projectButton('Confirm brand fact', 'button secondary', () => action(confirm, async () => {
          const projectId = state.projectId;
          await api(`${projectPath(projectId)}/knowledge/${encodeURIComponent(item.id)}/confirm`, {});
          await refreshProject(projectId);
          if (projectId === state.projectId) notify('An immutable confirmed version is saved. Future work can now use this brand fact.');
        }));
        card.append(confirm);
      }
    }
    if (latest.id === item.id) card.append(projectButton(item.kind === 'brand' ? 'Propose revision' : 'Revise reference', 'text-button knowledge-revise', () => reviseKnowledge(item)));
    list.append(card);
  }
}

function reviseKnowledge(item) {
  const editor = openEditor(item.kind === 'brand' ? 'Propose a brand fact revision' : 'Revise this reference', item.kind === 'brand' ? 'Save a new draft of this knowledge item. The current confirmed fact remains active until you explicitly confirm the new draft.' : 'Save a new reference version with its source. Previous versions and historical run snapshots remain available.', 'Save new draft', async (form, projectId) => {
    const values = formValues(form);
    if (values.content.length > 2000) throw new Error('Keep the revised knowledge to 2,000 characters. Nothing has been truncated.');
    await api(`${projectPath(projectId)}/knowledge`, { ...values, kind: item.kind, previousId: item.id });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify(item.kind === 'brand' ? 'Proposed brand revision saved. Review the comparison before confirming; the previous fact remains active.' : 'New reference version saved.');
  });
  addField(editor.fields, 'Title', 'title', item.title, { required: true, maxLength: 120 });
  addField(editor.fields, 'Content', 'content', item.content, { required: true, multiline: true, rows: 7, maxLength: 2000 });
  addField(editor.fields, 'Source', 'source', item.source, { required: true, maxLength: 300 });
  addField(editor.fields, 'Topics', 'tags', item.tags?.join(', ') || '', { maxLength: 400 });
}

function addDetail(container, label, content) {
  if (content === undefined || content === null || content === '' || (Array.isArray(content) && !content.length)) return;
  container.append(el('p', 'detail-label', label), el('p', 'detail-text', Array.isArray(content) ? content.join('\n') : readable(content)));
}

function continueConcept(concept) {
  state.sourceId = concept.id;
  $('#source-title').textContent = concept.title;
  $('#source-strip').hidden = false;
  $('#creative-goal').value = '';
  $('#creative-count').value = '1';
  $('#creative-goal').placeholder = 'What should stay, and what should change? For example: Keep the everyday setting and revise the ending using the feedback I just saved.';
  switchView('create');
  $('#creative-goal').focus();
  $('#compose-title').scrollIntoView({ block: 'start', behavior: 'instant' });
}

function renderConcepts() {
  const list = $('#concept-list');
  // A completed background run must not discard feedback the user is still writing.
  const drafts = new Map([...list.querySelectorAll('.concept-card')].map((card) => [card.dataset.conceptId, {
    openDetails: [...card.querySelectorAll('details')].filter((node) => node.open).map((node) => node.className),
    forms: [...card.querySelectorAll('form')].map((form) => ({ key: form.dataset.formKey, values: formValues(form) })),
  }]));
  list.replaceChildren();
  const angle = $('#idea-angle-filter').value, theme = $('#idea-theme-filter').value;
  const concepts = state.data.concepts.filter((concept) => ($('#show-archived-ideas').checked || !concept.archived) && (!$('#favorites-only').checked || concept.favorite) && (!angle || concept.angle === angle) && (!theme || concept.theme === theme));
  $('#concept-count').textContent = `${concepts.length} versions`;
  if (!concepts.length) {
    list.append(angle || theme ? emptyState('No ideas match these filters', 'Choose another angle or theme, or clear the filters to see all saved versions.') : $('#favorites-only').checked
      ? emptyState('No favorites yet', 'Favorite a version to return to it later. Every draft remains in your creative history.')
      : emptyState('Your next draft starts here', 'Create a first draft and it will appear here. Leave feedback, then use it to develop the next version.'));
    return;
  }
  for (const concept of [...concepts].reverse()) {
    const card = el('article', 'concept-card');
    card.dataset.conceptId = concept.id;
    const top = el('div', 'card-topline');
    const meta = el('div');
    meta.append(el('span', 'card-version', concept.parentId ? 'New version · Saved' : 'Idea · Saved'), el('p', 'card-meta', dateLabel(concept.createdAt)));
    const favorite = projectButton(concept.favorite ? '★ Favorited' : '☆ Favorite', 'favorite-button', () => action(favorite, async () => {
      const projectId = state.projectId;
      await api(`${projectPath(projectId)}/concepts/${encodeURIComponent(concept.id)}/favorite`, { active: !concept.favorite });
      await refreshProject(projectId);
    }));
    favorite.setAttribute('aria-pressed', String(Boolean(concept.favorite)));
    favorite.setAttribute('aria-label', `${concept.favorite ? 'Remove favorite' : 'Favorite'}: ${concept.title}`);
    top.append(meta, favorite);
    card.append(top, el('h3', '', concept.title));
    if (concept.archived) card.append(el('p', 'badge', 'Archived idea · All versions'));
    if (concept.angle) card.append(el('span', 'angle', concept.angle));
    if (concept.theme) card.append(el('span', 'angle theme-label', concept.theme));
    card.append(el('p', 'work-body', concept.body));
    const details = el('details', 'card-details');
    details.append(el('summary', '', 'Rationale and assumptions'));
    addDetail(details, 'Rationale', concept.rationale);
    addDetail(details, 'Underlying insight', concept.insight);
    addDetail(details, 'Visual direction (written suggestion)', concept.visualDirection);
    addDetail(details, 'Assumptions to validate', concept.assumptions);
    if (concept.parentId) {
      const parent = state.data.concepts.find((item) => item.id === concept.parentId);
      addDetail(details, 'Source version', parent?.title || concept.parentId);
    }
    if (concept.runId) details.append(button('View the saved context ↗', 'text-button', () => showRun(concept.runId)));
    if (concept.createdBy === 'user') {
      addDetail(details, 'Authorship', concept.parentId ? 'Manual revision of the source version' : 'Manually created idea');
      if (concept.creationContext) {
        addDetail(details, 'Creation goal', concept.creationContext.goal);
        addDetail(details, 'Selected insights', (concept.creationContext.insightVersionIds || []).map((id) => state.data.insights.find((item) => item.id === id)?.title || id));
        addDetail(details, 'Selected sources', (concept.creationContext.evidenceVersionIds || []).map((id) => state.data.evidence.find((item) => item.id === id)?.title || id));
        addDetail(details, 'Brand versions when saved', (concept.creationContext.confirmedBrandVersionIds || []).map((id) => state.data.knowledge.find((item) => item.id === id)?.title || id));
        details.append(el('p', 'field-hint', 'Brand versions provide a change-check baseline; they are not a claim that every fact was used.'));
        const context = el('details', 'technical-details'); context.append(el('summary', '', 'Inspect saved origin and creation context'), el('pre', '', JSON.stringify({ provenance: concept.provenance, creationContext: concept.creationContext }, null, 2))); details.append(context);
      } else details.append(el('p', 'field-hint', 'Creation context was not recorded for this historical manual version.'));
      let ancestor = concept, visited = new Set();
      while (ancestor?.parentId && !ancestor.runId && !visited.has(ancestor.id)) { visited.add(ancestor.id); ancestor = state.data.concepts.find((item) => item.id === ancestor.parentId); }
      if (ancestor?.runId) details.append(button('Inspect source generation context ↗', 'text-button', () => showRun(ancestor.runId)));
    }
    card.append(details);
    card.append(feedbackForm(concept));
    card.append(ideaDecisions(concept));
    const actions = el('div', 'card-actions');
    actions.append(projectButton('Continue ↗', 'button secondary', () => continueConcept(concept)), projectButton('Edit copy', 'text-button', () => editIdea(concept)), projectButton('Add to set', 'text-button', () => attachIdeaToSet(concept)));
    if (concept.archived) for (const node of actions.querySelectorAll('button')) node.disabled = true;
    actions.append(projectButton(concept.archived ? 'Restore idea' : 'Archive idea', 'text-button', () => archiveIdea(concept)));
    const download = el('a', 'export-link', 'Export text ↓');
    download.href = `${projectPath()}/concepts/${encodeURIComponent(concept.id)}/export`;
    download.setAttribute('download', '');
    actions.append(download);
    card.append(actions);
    const draft = drafts.get(concept.id);
    if (draft) {
      for (const node of card.querySelectorAll('details')) node.open = draft.openDetails.includes(node.className);
      for (const form of card.querySelectorAll('form')) {
        const previous = draft.forms.find((entry) => entry.key === form.dataset.formKey);
        if (previous) {
          for (const control of form.elements) if (control.name && previous.values[control.name] !== undefined) control.value = previous.values[control.name];
          for (const control of form.querySelectorAll('select')) control.dispatchEvent(new Event('change'));
        }
      }
    }
    if (isArchived()) for (const node of card.querySelectorAll('form input, form textarea, form select, form button')) node.disabled = true;
    list.append(card);
  }
}

function archiveIdea(concept) {
  const editor = openEditor(concept.archived ? 'Restore this idea' : 'Archive this idea', concept.archived ? 'All versions of this idea become available again. Existing favorites and set references are preserved.' : 'This archives every version of this idea and excludes it from automatic context selection. Existing favorites and set references are preserved.', concept.archived ? 'Restore idea' : 'Archive idea', async (form, projectId) => {
    await api(`${projectPath(projectId)}/selections`, { targetType: 'concept', targetId: concept.id, decision: concept.archived ? 'unarchived' : 'archived', reason: formValues(form).reason });
    if (!concept.archived && state.data?.concepts.find((item) => item.id === state.sourceId)?.ideaId === concept.ideaId) { state.sourceId = null; $('#source-strip').hidden = true; }
    await refreshProject(projectId);
    if (projectId === state.projectId) notify(concept.archived ? 'Idea restored with all its versions.' : 'Idea archived. Enable “Show archived ideas” to find or restore it.');
  });
  editor.fields.append(el('p', 'source-strip', concept.title));
  addField(editor.fields, 'Reason (optional)', 'reason', '', { multiline: true, maxLength: 1500 });
}

function feedbackForm(concept) {
  const details = el('details', 'feedback-details');
  const feedback = state.data.feedback.filter((item) => item.targetId === concept.id);
  details.append(el('summary', '', feedback.length ? `Feedback · ${feedback.length} notes` : 'Leave feedback for the next draft'));
  for (const item of feedback) {
    const row = el('div', 'feedback-item');
    row.append(el('span', '', item.scope === 'project' ? 'Project-wide · Creative feedback, not a brand fact' : 'This version and its continuations only'), el('p', '', item.content));
    details.append(row);
  }
  const form = el('form');
  form.dataset.formKey = 'feedback';
  const label = el('label', '', 'What should we keep or improve?');
  const input = el('textarea');
  input.name = 'content'; input.required = true; input.maxLength = 1500; input.rows = 3;
  input.placeholder = 'For example: Keep the opening scene. Make the ending less promotional and ask a specific question.';
  label.append(input);
  const scopeLabel = el('label', '', 'Apply this feedback to');
  const scope = el('select');
  scope.name = 'scope';
  const conceptOption = el('option', '', 'This version and its continuations (default)'); conceptOption.value = 'concept';
  const projectOption = el('option', '', 'All future work in this project'); projectOption.value = 'project';
  scope.append(conceptOption, projectOption); scopeLabel.append(scope);
  const submit = el('button', 'button secondary', 'Save feedback'); submit.type = 'submit';
  form.append(label, scopeLabel, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const projectId = state.projectId;
    action(submit, async () => {
      await api(`${projectPath(projectId)}/feedback`, { targetId: concept.id, scope: scope.value, content: input.value.trim(), tags: [] });
      form.reset();
      await refreshProject(projectId);
      if (projectId === state.projectId) notify('Feedback saved with the selected scope. Choose “Continue this draft” to use it in the next iteration.');
    });
  });
  details.append(form);
  return details;
}

function recordSetDecision(concept, set) {
  const current = set.conceptSelections?.find((record) => record.conceptId === concept.id);
  const editor = openEditor('Choose this idea for a set', `This decision applies to “${set.name}” and this exact idea version. Other sets make their own decisions. Saving does not start production.`, 'Save set decision', async (form, projectId) => {
    await api(`${projectPath(projectId)}/selections`, { targetType: 'concept', targetId: concept.id, setId: set.id, ...formValues(form) });
    await refreshProject(projectId);
    if (projectId === state.projectId) notify('Decision saved for this idea version in this set.');
  });
  editor.fields.append(el('p', 'source-strip', concept.title));
  addField(editor.fields, 'Decision', 'decision', current?.decision || 'adopted', { options: [{ value: 'adopted', label: 'Select for this set' }, { value: 'rejected', label: 'Reject for this set' }] });
  addField(editor.fields, 'Reason', 'reason', current?.reason || '', { required: true, multiline: true, maxLength: 1500 });
}

function ideaDecisions(concept) {
  const details = el('details', 'decision-details');
  details.append(el('summary', '', 'Favorite reason and decisions'));
  const favoriteForm = el('form', 'compact-form'); favoriteForm.dataset.formKey = 'favorite';
  const favoriteLabel = el('label', '', 'Why keep this idea?');
  const favoriteReason = el('textarea'); favoriteReason.name = 'favoriteReason'; favoriteReason.rows = 2; favoriteReason.maxLength = 1500; favoriteReason.value = concept.favoriteReason || '';
  favoriteReason.placeholder = 'Optional: what makes this version worth returning to?'; favoriteLabel.append(favoriteReason);
  const saveFavorite = el('button', 'button secondary', concept.favorite ? 'Update favorite reason' : 'Favorite with this reason'); saveFavorite.type = 'submit';
  favoriteForm.append(favoriteLabel, saveFavorite);
  favoriteForm.addEventListener('submit', (event) => {
    event.preventDefault(); if (!favoriteForm.reportValidity()) return;
    const projectId = state.projectId;
    action(saveFavorite, async () => {
      await api(`${projectPath(projectId)}/concepts/${encodeURIComponent(concept.id)}/favorite`, { active: true, reason: favoriteReason.value.trim() });
      await refreshProject(projectId);
      if (projectId === state.projectId) notify('Favorite reason saved. Favorites remain bookmarks, not brand facts or performance evidence.');
    });
  });
  details.append(favoriteForm);
  const history = state.data.selections.filter((record) => record.targetType === 'concept' && record.targetId === concept.id);
  const labels = { rejected: 'Rejected for set', adopted: 'Selected for set', published: 'Manually marked published', unpublished: 'Manually marked unpublished' };
  for (const record of history) {
    const scope = record.setId ? state.data.sets.find((set) => set.id === record.setId)?.name || record.setId : ['adopted', 'rejected'].includes(record.decision) ? 'Historical decision without set scope' : 'Idea record';
    const row = el('div', 'feedback-item'); row.append(el('span', '', `${labels[record.decision] || record.decision} · ${scope} · ${dateLabel(record.createdAt)}`), el('p', '', record.reason)); details.append(row);
  }
  const form = el('form', 'compact-form'); form.dataset.formKey = 'decision';
  const decisionLabel = el('label', '', 'Record a decision'); const decision = el('select'); decision.name = 'decision';
  fillOptions(decision, Object.entries(labels).map(([value, label]) => ({ value, label })), null, 'rejected'); decisionLabel.append(decision);
  const setLabel = el('label', '', 'Creative set'); const setChoice = el('select'); setChoice.name = 'setId'; setLabel.append(setChoice);
  const sets = state.data.sets.filter((set) => !set.archived && set.conceptIds.includes(concept.id));
  fillOptions(setChoice, sets.map((set) => ({ value: set.id, label: set.name })), 'Choose a set', sets.length === 1 ? sets[0].id : '');
  const syncScope = () => { const scoped = ['adopted', 'rejected'].includes(decision.value); setLabel.hidden = !scoped; setChoice.required = scoped; setChoice.disabled = !scoped; };
  decision.addEventListener('change', syncScope); syncScope();
  const reasonLabel = el('label', '', 'Reason'); const reason = el('textarea'); reason.name = 'reason'; reason.rows = 2; reason.maxLength = 1500; reason.required = true; reasonLabel.append(reason);
  const submit = el('button', 'button secondary', 'Save decision'); submit.type = 'submit';
  form.append(decisionLabel, setLabel, reasonLabel, el('p', 'field-hint', 'Select or reject this version separately in each set. Add it to a set first. A saved decision does not start production or publish content.'), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const projectId = state.projectId;
    action(submit, async () => {
      await api(`${projectPath(projectId)}/selections`, { targetType: 'concept', targetId: concept.id, decision: decision.value, reason: reason.value.trim(), ...(!setChoice.disabled ? { setId: setChoice.value } : {}) });
      form.reset(); syncScope(); await refreshProject(projectId);
      if (projectId === state.projectId) notify('Your decision and its reason are saved.');
    });
  });
  details.append(form);
  return details;
}

function renderRuns() {
  const list = $('#runs-list'); list.replaceChildren();
  if (!state.data.runs.length) { list.append(emptyState('No runs yet', 'Start a draft to see its route, status, usage, and immutable context snapshot here.')); return; }
  const refresh = button('Refresh activity', 'button secondary', () => action(refresh, () => refreshProject()));
  list.append(refresh);
  for (const run of [...state.data.runs].reverse()) {
    const row = el('article', 'run-row');
    const info = el('div');
    info.append(el('span', `run-status ${run.status}`, runLabels[run.status] || run.status), el('h3', '', run.goal || run.context?.goal || 'Writing'), el('p', 'card-meta', `${dateLabel(run.createdAt)} · ${readable(run.route)}`));
    if (run.error) info.append(el('p', 'detail-text', typeof run.error === 'object' ? run.error.message || readable(run.error) : run.error));
    if (run.cancelRequestedAt) {
      info.append(el('p', 'card-meta', `Interruption requested: ${dateLabel(run.cancelRequestedAt)}`));
      if (run.status === 'succeeded') info.append(el('p', 'detail-text', 'A result arrived after interruption was requested. It was saved without automatic adoption or follow-up.'));
    }
    if (['waiting_quota', 'waiting_auth'].includes(run.status)) info.append(el('p', 'detail-text', waitingGuidance(run)));
    const actions = el('div', 'run-actions'); actions.append(button('View details and context', 'button secondary', () => showRun(run.id)));
    if (run.status === 'running') {
      const cancel = button(run.cancelRequestedAt ? 'Interruption requested' : 'Request interruption', 'text-button', (event) => action(event.currentTarget, async () => {
        const projectId = state.projectId;
        const result = await api(`${projectPath(projectId)}/runs/${encodeURIComponent(run.id)}/cancel`, {});
        await refreshProject(projectId);
        if (projectId === state.projectId) notify(result.message || 'Interruption requested. External work may still finish; no automatic retry will occur.');
      }));
      cancel.disabled = Boolean(run.cancelRequestedAt); actions.append(cancel);
    }
    row.append(info, actions);
    list.append(row);
  }
}

function waitingGuidance(run) {
  return run.status === 'waiting_auth'
    ? 'Sign in to the connected subscription and refresh the runtime status. This request will not resume automatically. Start another run explicitly when ready.'
    : 'Wait for subscription quota to become available, then refresh the runtime status. This request will not resume automatically. Start another run explicitly when ready.';
}

function contextRecord(entry) {
  if (!['brief', 'asset', 'reference_asset', 'evidence', 'insight', 'source_concept', 'related_concept', 'concept'].includes(entry.kind)) return null;
  try {
    const value = typeof entry.content === 'string' ? JSON.parse(entry.content) : entry.content;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function appendContextRecord(container, entry, record) {
  if (!record) { container.append(el('p', 'detail-text', readable(entry.content))); return; }
  const fields = {
    brief: ['goal', 'audience', 'objective', 'offer', 'proof', 'theme', 'caption', 'cta', 'language', 'prohibitedClaims', 'style'],
    asset: ['caption', 'source'], reference_asset: ['source', 'role'],
    evidence: ['observation', 'inference', 'url', 'retrievedAt'], insight: ['audience', 'content', 'counterexamples'],
    source_concept: ['angle', 'body', 'visualDirection', 'assumptions'], related_concept: ['angle', 'body', 'visualDirection', 'assumptions'], concept: ['angle', 'body', 'visualDirection', 'assumptions'],
  }[entry.kind];
  const labels = { goal: 'Goal', audience: 'Audience', objective: 'Objective', offer: 'Offer', proof: 'Supporting facts', theme: 'Theme', caption: 'Caption', cta: 'Call to action', language: 'Output language', prohibitedClaims: 'Claims to avoid', style: 'Style', source: 'Source', role: 'Image role', observation: 'Source observation', inference: 'Interpretation', url: 'Source URL', retrievedAt: 'Retrieved', content: 'Insight', counterexamples: 'Counterexamples and limits', angle: 'Angle', body: 'Saved copy', visualDirection: 'Visual direction', assumptions: 'Assumptions to validate' };
  if (record.hypothesis) container.append(el('p', 'badge draft', 'Untested hypothesis'));
  if (record.width && record.height) container.append(el('p', 'detail-text', `${record.width} × ${record.height} pixels`));
  for (const field of fields) addDetail(container, labels[field], field === 'retrievedAt' && record[field] ? dateLabel(record[field]) : record[field]);
}

function showContext(context, run = null) {
  const content = $('#context-content'); content.replaceChildren();
  if (run) {
    content.append(el('p', 'detail-text', `Status: ${runLabels[run.status] || run.status} · Route: ${readable(run.route)}`));
    if (run.error) content.append(el('p', 'notice error', run.error.message || readable(run.error)));
    if (run.status === 'result_unknown') content.append(el('p', 'detail-text', 'This request may have run externally. It will not be sent again automatically. Check the activity and runtime records before starting another draft.'));
    if (run.status === 'archiving') content.append(el('p', 'detail-text', 'Check disk space and permissions for the data directory, then restart the local service. Only local archival will resume; the model will not run again.'));
  }
  if (run && ['waiting_quota', 'waiting_auth'].includes(run.status)) content.append(el('p', 'detail-text', waitingGuidance(run)));
  if (!context) { content.append(el('p', 'detail-text', 'No readable context snapshot is available for this run.')); return; }
  content.append(el('p', 'section-description', run ? 'This is the input snapshot saved for this run. Knowledge added later does not change it.' : 'This previews the context for your current goal. Starting a run locks its knowledge versions, feedback scope, and skill.'));
  if (context.warnings?.length) {
    const warnings = el('section', 'context-warnings'); warnings.setAttribute('aria-label', 'Context warnings');
    warnings.append(el('h3', '', 'Review before relying on this context'));
    for (const warning of context.warnings) warnings.append(el('p', '', typeof warning === 'string' ? warning : warning.message || warning.detail || warning.reason || readable(warning)));
    content.append(warnings);
  }
  content.append(el('h3', 'context-section-title', `Selected project memory · ${context.entries?.length ?? 0} records`));
  if (!context.entries?.length) content.append(el('p', 'detail-text', context.assetId ? 'This task uses the selected image and the snapshot recorded below.' : 'No saved memory matches this goal. Unknown information remains explicit.'));
  for (const entry of context.entries || []) {
    const item = el('article', 'context-entry');
    const record = contextRecord(entry);
    const title = ['asset', 'reference_asset'].includes(entry.kind) ? record?.name || entry.title : entry.title;
    item.append(el('span', 'badge', kindLabels[entry.kind] || entry.kind), el('h3', '', title || kindLabels[entry.kind] || 'Memory record'));
    appendContextRecord(item, entry, record);
    item.append(el('p', 'context-reason', `Selection reason: ${readable(entry.reason)}`), el('p', 'context-id', entry.id));
    content.append(item);
  }
  if (context.omitted?.length) {
    const omitted = el('details', 'card-details');
    omitted.append(el('summary', '', `Memory not selected · ${context.omitted.length} records`));
    for (const item of context.omitted) omitted.append(el('p', 'omitted-item', `${item.title || item.id}: ${item.reason}`));
    content.append(omitted);
  }
  const technical = el('details', 'technical-details');
  technical.append(el('summary', '', 'Version, skill, and usage details'), el('pre', '', JSON.stringify({ skill: context.skill, contextId: context.id, runId: run?.id, route: run?.route, usage: run?.usage ?? 'Unknown', metadata: run?.metadata, context }, null, 2)));
  content.append(technical);
}

function openContext(title) {
  const epoch = ++state.contextEpoch;
  $('#context-title').textContent = title;
  $('#context-content').replaceChildren(el('p', 'detail-text', 'Loading…'));
  if (!$('#context-dialog').open) $('#context-dialog').showModal();
  return epoch;
}

async function showRun(runId) {
  const projectId = state.projectId;
  const epoch = openContext('Run details and context');
  try {
    const run = await api(`${projectPath(projectId)}/runs/${encodeURIComponent(runId)}`);
    if (epoch === state.contextEpoch && projectId === state.projectId) showContext(run.context, run);
  } catch (error) { if (epoch === state.contextEpoch) $('#context-content').replaceChildren(el('p', 'notice error', errorMessage(error))); }
}

function creativeInput() {
  return { goal: $('#creative-goal').value.trim(), language: $('#creative-language').value, sourceConceptId: state.sourceId, count: Number($('#creative-count').value), ...($('#creative-set').value ? { setId: $('#creative-set').value } : {}) };
}

function completedMessage(run) {
  const taskType = run.taskType || run.context?.taskType;
  if (taskType === 'synthesize_insights') return 'Insight synthesis completed. Review the saved results in Knowledge → Insights.';
  if (taskType === 'extract_brand') return 'Brand draft saved in Knowledge → Facts & references. Review and confirm it before it can become a brand fact.';
  if (taskType === 'review_asset') return 'Image review saved in its creative set. Inspect the issues before adopting a version.';
  return 'Creative work saved. Favorite a version, leave feedback, or add selected ideas to a set.';
}

async function submitRun(input) {
  if (isArchived()) throw new Error('Restore this project before starting a run.');
  if (state.submitting) throw new Error('Another request is being submitted.');
  const projectId = state.projectId, epoch = state.epoch;
  let acceptedRun;
  state.submitting = true; hideNotice(); renderGenerationState();
  try {
    const run = await api(`${projectPath(projectId)}/runs`, { ...input, requestId: crypto.randomUUID() });
    acceptedRun = run;
    await refreshProject(projectId, epoch);
    if (projectId === state.projectId && run.status === 'succeeded') notify(completedMessage(run));
    else if (projectId === state.projectId && ['failed', 'result_unknown', 'archiving', 'waiting_quota', 'waiting_auth', 'cancelled'].includes(run.status)) notify(`${runLabels[run.status]}: ${run.error?.message || 'See the run details.'}`, true);
    return run;
  } catch (error) {
    const message = acceptedRun
      ? `The run was accepted, but the project could not refresh: ${errorMessage(error)} Check Activity before starting another run.`
      : error.status && (error.status < 500 || error.code === 'runtime_unavailable')
        ? `The run did not start: ${errorMessage(error)}`
        : `Submission is unconfirmed: ${errorMessage(error)} Check Activity before submitting again to avoid a duplicate run.`;
    if (projectId === state.projectId) {
      notify(message, true);
      try { await refreshProject(projectId, epoch); } catch { /* Keep the explicit submission error visible. */ }
    }
    throw new Error(message);
  } finally { state.submitting = false; renderGenerationState(); }
}

function schedulePoll() {
  clearTimeout(state.pollTimer);
  if (!state.data?.runs.some((run) => run.status === 'running')) return;
  const projectId = state.projectId, epoch = state.epoch;
  state.pollTimer = setTimeout(async () => {
    try {
      const pending = state.data.runs.filter((run) => run.status === 'running');
      const updated = await Promise.all(pending.map((run) => api(`${projectPath(projectId)}/runs/${encodeURIComponent(run.id)}`)));
      if (projectId !== state.projectId || epoch !== state.epoch) return;
      const completed = updated.filter((run) => run.status !== 'running');
      if (completed.length) {
        await refreshProject(projectId, epoch);
        for (const run of completed) {
          if (run.status === 'succeeded') notify(completedMessage(run));
          else notify(`${runLabels[run.status] || run.status}: ${run.error?.message || readable(run.error)} The model call was not retried automatically.`, true);
        }
      } else schedulePoll();
    } catch (error) {
      if (projectId !== state.projectId || epoch !== state.epoch) return;
      notify(`Could not read the run status: ${errorMessage(error)} It may still be running. Refresh Activity to check.`, true);
    }
  }, 1600);
}

$('#project-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  action(form.querySelector('button'), async () => {
    const project = await api('/api/projects', { name: $('#project-name').value.trim() });
    state.projects.push(project);
    form.reset(); $('#new-project-details').open = false;
    await selectProject(project.id);
  });
});

$('#knowledge-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const projectId = state.projectId;
  const values = Object.fromEntries(new FormData(form));
  action(form.querySelector('button'), async () => {
    await api(`${projectPath(projectId)}/knowledge`, values);
    if (projectId === state.projectId) form.reset();
    await refreshProject(projectId);
    if (projectId === state.projectId) notify(values.kind === 'brand' ? 'Brand draft saved. Check the content, then choose “Confirm brand fact”.' : 'Reference saved. Future work will retrieve it when it is relevant to the goal.');
  });
});

$('#creative-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity() || $('#generate-button').disabled) return;
  try { await submitRun(creativeInput()); } catch { /* submitRun displays the failure and reconciles saved activity. */ }
});

$('#preview-context').addEventListener('click', async () => {
  if (!$('#creative-form').reportValidity()) return;
  const projectId = state.projectId;
  const epoch = openContext('What will inform this draft?');
  try {
    const context = await api(`${projectPath(projectId)}/context`, creativeInput());
    if (epoch === state.contextEpoch && projectId === state.projectId) showContext(context);
  }
  catch (error) { if (epoch === state.contextEpoch) $('#context-content').replaceChildren(el('p', 'notice error', errorMessage(error))); }
});

$('#clear-source').addEventListener('click', () => { state.sourceId = null; $('#source-strip').hidden = true; $('#creative-goal').focus(); });
$('#favorites-only').addEventListener('change', renderConcepts);
$('#show-archived-ideas').addEventListener('change', renderConcepts);
$('#close-context').addEventListener('click', () => $('#context-dialog').close());
$('#close-editor').addEventListener('click', () => $('#editor-dialog').close());
$('#go-memory').addEventListener('click', () => { switchView('memory'); switchMemoryView('facts'); $('#knowledge-title').focus(); });
$('#refresh-runtime').addEventListener('click', (event) => action(event.currentTarget, async () => {
  const results = await Promise.allSettled([refreshRuntime(), refreshDispatch(), refreshImageRuntime()]);
  const errors = results.filter((result) => result.status === 'rejected');
  if (errors.length) throw new Error(errors.map((result) => errorMessage(result.reason)).join(' '));
}));
$('#toggle-dispatch').addEventListener('click', (event) => action(event.currentTarget, async () => {
  if (!state.dispatch) throw new Error('Refresh the runtime status before changing dispatch.');
  await api('/api/dispatch', { paused: !state.dispatch.paused });
  await refreshDispatch();
}));
$('#welcome-create').addEventListener('click', () => { $('#new-project-details').open = true; $('#project-name').focus(); });
$('#knowledge-kind').addEventListener('change', () => {
  $('#knowledge-hint').textContent = $('#knowledge-kind').value === 'brand' ? 'Saved as a draft. Confirm it before it can be used as a brand fact.' : 'References are selected by relevance. Saving one does not make it a brand fact.';
});
for (const node of document.querySelectorAll('[data-view]')) node.addEventListener('click', () => switchView(node.dataset.view));
for (const node of document.querySelectorAll('[data-memory-view]')) node.addEventListener('click', () => switchMemoryView(node.dataset.memoryView));
for (const selector of ['#idea-angle-filter', '#idea-theme-filter']) $(selector).addEventListener('change', renderConcepts);
for (const selector of ['#image-style-filter', '#image-adoption-filter']) $(selector).addEventListener('change', () => { state.imagePage = 1; renderImages(); });
$('#add-manual-idea').addEventListener('click', () => editIdea());
$('#add-evidence').addEventListener('click', () => editEvidence());
$('#read-source-url').addEventListener('click', readSourceUrl);
$('#add-insight').addEventListener('click', () => editInsight());
$('#upload-image').addEventListener('click', () => uploadImage());
$('#import-skill').addEventListener('click', importSkill);
$('#restore-backup').addEventListener('click', restoreBackup);
$('#backup-project').addEventListener('click', (event) => action(event.currentTarget, async () => {
  const projectId = state.projectId;
  await downloadArchive(`${projectPath(projectId)}/backup`, `third-draft-${projectId}.tdbackup`);
  if (projectId === state.projectId) notify('Private backup downloaded. It includes project memory and run records; store it separately from shareable creative exports.');
}));
$('#create-set').addEventListener('click', () => editSet());
$('#synthesize-insights').addEventListener('click', synthesizeInsights);
$('#archive-project').addEventListener('click', (event) => action(event.currentTarget, async () => {
  const projectId = state.projectId, archived = !isArchived();
  await api(`${projectPath(projectId)}/archive`, { archived });
  await refreshProject(projectId);
  if (projectId === state.projectId) notify(archived ? 'Project archived. All saved work and knowledge are preserved.' : 'Project restored. You can create and edit again.');
}));
$('#knowledge-file').addEventListener('change', async (event) => {
  const file = event.currentTarget.files[0], projectId = state.projectId, epoch = state.epoch;
  if (!file) return;
  try {
    if (!/\.(txt|md)$/i.test(file.name)) throw new Error('Choose a .txt or .md file.');
    if (file.size > 100000) throw new Error('This file is too large. Choose a smaller text excerpt.');
    const content = await file.text();
    if (content.length > $('#knowledge-content').maxLength) throw new Error('This file exceeds the 2,000-character knowledge limit. Choose a focused excerpt; no content was truncated.');
    if (projectId !== state.projectId || epoch !== state.epoch) return;
    $('#knowledge-content').value = content;
    if (!$('#knowledge-title').value) $('#knowledge-title').value = file.name.replace(/\.(txt|md)$/i, '').slice(0, 120);
    if (!$('#knowledge-source').value) $('#knowledge-source').value = file.name.slice(0, 300);
    notify('Text imported into the form. Review it before saving; nothing has been confirmed.');
  } catch (error) { if (projectId === state.projectId) notify(errorMessage(error), true); }
  finally { if (epoch === state.epoch) $('#knowledge-file').value = ''; }
});

async function start() {
  try {
    const session = await api('/api/session');
    if (!session.csrfToken) throw new Error('The local session could not be established. Refresh this page.');
    state.csrfToken = session.csrfToken;
    const [projects, ...checks] = await Promise.allSettled([api('/api/projects'), refreshRuntime(), refreshDispatch(), refreshImageRuntime(), refreshSkills()]);
    if (projects.status === 'rejected') throw projects.reason;
    if (!Array.isArray(projects.value)) throw new Error('Could not read the project list.');
    state.projects = projects.value;
    renderProjects();
    if (state.projects.length) await selectProject(state.projects[0].id);
    else $('#welcome').hidden = false;
    const failedChecks = checks.filter((result) => result.status === 'rejected');
    if (failedChecks.length) notify(`Some workspace capabilities are unavailable: ${failedChecks.map((result) => errorMessage(result.reason)).join(' ')} You can still organize local project knowledge.`, true);
  } catch (error) {
    notify(`Could not connect to the workspace: ${errorMessage(error)} Make sure the local service is running, then refresh this page.`, true);
    $('#project-list').replaceChildren(el('p', 'sidebar-note', 'The project list is unavailable.'));
  }
}

start();
