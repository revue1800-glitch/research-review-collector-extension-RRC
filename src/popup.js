import {
  auth,
  db,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs
} from './firebase.js';

import { formatDate, humanizeReplicable, isSupportedUrl, normalizeMetadata, recordIdFromUrl, safeHostname } from './utils.js';

const state = {
  user: null,
  username: '',
  metadata: null,
  existingRecord: null
};

const elements = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      await signInAnonymously(auth);
      return;
    }

    state.user = user;
    await loadUsername();
    renderAuthState();

    if (state.metadata?.url) {
      await hydrateSavedRecord();
    } else {
      clearUserFields();
    }
  });

  await loadCurrentPageMetadata();
}

function cacheElements() {
  [
    'statusBadge',
    'message',
    'username',
    'saveUsernameButton',
    'userEmail',
    'signOutButton',
    'metaTitle',
    'comment',
    'saveButton',
    'refreshButton',
    'openRecordsButton'
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.saveUsernameButton?.addEventListener('click', handleSaveUsername);
  elements.saveButton?.addEventListener('click', handleSave);
  elements.refreshButton?.addEventListener('click', loadCurrentPageMetadata);
  elements.signOutButton?.addEventListener('click', handleSignOut);
  elements.openRecordsButton?.addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('records.html') });
  });
}

async function loadCurrentPageMetadata() {
  setStatus('Loading page');
  setMessage('');

  const activeTab = await getActiveTab();
  if (!activeTab?.id || !isSupportedUrl(activeTab.url || '')) {
    state.metadata = null;
    renderMetadata(null);
    setStatus('Unsupported page');
    setMessage('Open a normal http/https page, then reopen or refresh this popup.');
    clearUserFields();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_METADATA' });
    state.metadata = normalizeMetadata(response?.payload || {
      url: activeTab.url || '',
      title: activeTab.title || '',
      author: '',
      publicationDate: '',
      journal: '',
      doi: ''
    });
    renderMetadata(state.metadata);

    if (state.user) {
      await hydrateSavedRecord();
      setStatus('Ready');
    } else {
      clearUserFields();
      setStatus('Choose a username');
    }
  } catch (error) {
    state.metadata = null;
    renderMetadata(null);
    setStatus('Could not read page');
    setMessage(error?.message || 'The content script could not read this page.');
  }
}

async function loadUsername() {
  if (!state.user) {
    state.username = '';
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, 'users', state.user.uid));
    const data = snapshot.exists() ? snapshot.data() : {};
    state.username = data.username || '';

    if (elements.username) {
      elements.username.value = state.username;
    }

    if (elements.userEmail) {
      elements.userEmail.textContent = state.username || '—';
    }
  } catch (error) {
    setMessage(error?.message || 'Could not load username.');
  }
}

async function handleSaveUsername() {
  const username = elements.username.value.trim();

  if (!username) {
    setMessage('Enter a username first.');
    return;
  }

  if (!state.user) {
    setMessage('Still connecting. Please wait a moment.');
    return;
  }

  const nowIso = new Date().toISOString();

  try {
    await setDoc(doc(db, 'users', state.user.uid), {
      username,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    }, { merge: true });

    state.username = username;

    if (elements.userEmail) {
      elements.userEmail.textContent = username;
    }

    setMessage('Username saved.');
  } catch (error) {
    setMessage(error?.message || 'Could not save username.');
  }
}

async function handleSignOut() {
  try {
    await signOut(auth);
    setMessage('Logged out.');
  } catch (error) {
    setMessage(error?.message || 'Could not log out.');
  }
}

async function handleSave() {
  if (!state.user) {
    setMessage('Still connecting. Please wait a moment.');
    return;
  }

  if (!state.username) {
    setMessage('Choose a username first.');
    return;
  }

  if (!state.metadata?.url) {
    setMessage('There is no page metadata to save yet.');
    return;
  }

  setStatus('Saving');
  setMessage('Saving to Firebase…');

  try {
    const recordId = await recordIdFromUrl(state.metadata.url);
    const centralRecordId = `${state.user.uid}__${recordId}`;
    const docRef = doc(db, 'records', centralRecordId);
    const existingData = state.existingRecord || null;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const record = {
      uid: state.user.uid,
      username: state.username,
      recordId,
      url: state.metadata.url,
      title: state.metadata.title,
      author: state.metadata.author,
      publicationDate: state.metadata.publicationDate,
      journal: state.metadata.journal || '',
      doi: state.metadata.doi || '',
      comment: elements.comment.value.trim(),
      replicable: getSelectedReplicableValue(),
      sourceHostname: safeHostname(state.metadata.url),
      createdAtMs: existingData?.createdAtMs ?? nowMs,
      createdAtIso: existingData?.createdAtIso ?? nowIso,
      updatedAtMs: nowMs,
      updatedAtIso: nowIso
    };

    await setDoc(docRef, record, { merge: true });
    state.existingRecord = record;
    setStatus('Saved');
    setMessage(`Saved. Replicable: ${humanizeReplicable(record.replicable)}.`);
  } catch (error) {
    setStatus('Save failed');
    setMessage(error?.message || 'Could not save the record.');
  }
}

async function hydrateSavedRecord() {
  if (!state.user || !state.metadata?.url) {
    clearUserFields();
    return;
  }

  try {
    const recordId = await recordIdFromUrl(state.metadata.url);

    const recordsQuery = query(
      collection(db, 'records'),
      where('uid', '==', state.user.uid),
      where('recordId', '==', recordId)
    );

    const snapshot = await getDocs(recordsQuery);

    if (snapshot.empty) {
      state.existingRecord = null;
      clearUserFields();
      setStatus('Ready');
      return;
    }

    const record = snapshot.docs[0].data();
    state.existingRecord = record;
    elements.comment.value = record.comment || '';

    const radio = document.querySelector(
      `input[name="replicable"][value="${cssEscape(record.replicable || '')}"]`
    );
    if (radio) {
      radio.checked = true;
    }

    setStatus(`Saved ${formatDate(record.updatedAtIso || record.updatedAtMs)}`);
  } catch (error) {
    setMessage(error?.message || 'Could not load the saved record for this page.');
  }
}

function renderMetadata(metadata) {
  elements.metaTitle.textContent = metadata?.title || '—';
}

function renderAuthState() {
  if (elements.userEmail) {
    elements.userEmail.textContent = state.username || '—';
  }

  if (state.metadata?.url && !state.username) {
    setStatus('Choose a username');
  }
}

function clearUserFields() {
  state.existingRecord = null;
  elements.comment.value = '';
  const fallback = document.querySelector('input[name="replicable"][value=""]');
  if (fallback) {
    fallback.checked = true;
  }
}

function getSelectedReplicableValue() {
  const selected = document.querySelector('input[name="replicable"]:checked');
  return selected ? selected.value : '';
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function setStatus(text) {
  elements.statusBadge.textContent = text;
}

function setMessage(text) {
  elements.message.textContent = text || '';
}

function readableAuthError(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential')) return 'Email or password was not accepted.';
  if (code.includes('invalid-email')) return 'The email address does not look valid.';
  if (code.includes('email-already-in-use')) return 'That email address already has an account.';
  if (code.includes('weak-password')) return 'Choose a stronger password with at least 6 characters.';
  return error?.message || 'Authentication failed.';
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}
