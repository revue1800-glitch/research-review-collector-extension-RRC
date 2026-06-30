import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  where
} from './firebase.js';
import { formatDate, humanizeReplicable } from './utils.js';

let allRecords = [];
let currentUser = null;

const elements = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    await refreshRecords();
  });
}

function cacheElements() {
  ['summary', 'searchInput', 'refreshButton', 'exportButton', 'records', 'signedOutNotice'].forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.searchInput.addEventListener('input', render);
  elements.refreshButton.addEventListener('click', refreshRecords);
  elements.exportButton.addEventListener('click', exportJson);
}

async function refreshRecords() {
  if (!currentUser) {
    allRecords = [];
    elements.signedOutNotice.classList.remove('hidden');
    render();
    return;
  }

  elements.signedOutNotice.classList.add('hidden');
  elements.summary.textContent = 'Loading records…';

  try {
    const recordsQuery = query(
      collection(db, 'records'),
      where('uid', '==', currentUser.uid),
      orderBy('updatedAtMs', 'desc')
    );
    const snapshot = await getDocs(recordsQuery);
    allRecords = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    render();
  } catch (error) {
    allRecords = [];
    elements.summary.textContent = error?.message || 'Could not load records.';
    render();
  }
}

function render() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const filtered = allRecords.filter((record) => {
    const haystack = [
      record.title,
      record.author,
      record.url,
      record.comment,
      record.publicationDate
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });

  elements.records.innerHTML = '';
  elements.summary.textContent = currentUser
    ? `${filtered.length} saved record${filtered.length === 1 ? '' : 's'}${search ? ' matching your search' : ''}.`
    : 'Sign in to view your saved records.';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = currentUser
      ? (search ? 'No saved records match your search.' : 'No records saved yet.')
      : 'Open the popup and sign in first.';
    elements.records.appendChild(empty);
    return;
  }

  const template = document.getElementById('recordTemplate');
  filtered.forEach((record) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.record-title').textContent = record.title || '(Untitled page)';
    node.querySelector('.record-url').textContent = record.url || '';
    node.querySelector('.record-author').textContent = record.author || '—';
    node.querySelector('.record-date').textContent = record.publicationDate || '—';
    node.querySelector('.record-replicable').textContent = humanizeReplicable(record.replicable);
    node.querySelector('.record-updated').textContent = formatDate(record.updatedAtIso || record.updatedAtMs);
    node.querySelector('.record-comment').textContent = record.comment || '—';
    node.querySelector('.delete-button').addEventListener('click', () => handleDelete(record.id));
    elements.records.appendChild(node);
  });
}

async function handleDelete(recordId) {
  if (!currentUser) {
    return;
  }

  const confirmed = window.confirm('Delete this saved record?');
  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(doc(db, 'records', recordId));
    await refreshRecords();
  } catch (error) {
    elements.summary.textContent = error?.message || 'Could not delete the record.';
  }
}

function exportJson() {
  if (!allRecords.length) {
    return;
  }

  const blob = new Blob([JSON.stringify(allRecords, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'page-metadata-recorder-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
