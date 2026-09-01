/**
 * API Client for Agent-1 Document Q&A RAG FastAPI Gateway.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8084';

export const SESSION_EXPIRED_EVENT = 'agent1:session-expired';

function getAuthHeaders(isMultipart = false) {
  const token = localStorage.getItem('agent1_google_token');
  const headers = {};
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function clearStoredSession() {
  localStorage.removeItem('agent1_google_token');
  localStorage.removeItem('agent1_user');
}

/**
 * fetch(), with the browser's network failure translated into something a user
 * can act on.
 *
 * When the gateway is not running, fetch rejects with a bare
 * "TypeError: Failed to fetch", which every caller here surfaced verbatim - a
 * message that names neither the cause nor the fix.
 */
async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      throw new Error(`The gateway at ${BASE_URL} did not respond in time.`);
    }
    throw new Error(
      `Cannot reach the gateway at ${BASE_URL}. Check that the backend is running, then try again.`
    );
  }
}

/**
 * Unwrap a response, treating 401 as the end of the session.
 *
 * A Google ID token is only valid for about an hour. The app used to validate
 * it once at startup, so when it lapsed mid-session every action failed with a
 * raw token error while the UI still looked signed in. Dropping the dead
 * credentials and announcing it sends the user back to the sign-in screen.
 */
async function unwrap(res, fallbackMessage, { endSessionOn401 = true } = {}) {
  if (res.ok) {
    return res.json();
  }

  const errorData = await res.json().catch(() => ({}));

  if (res.status === 401 && endSessionOn401) {
    clearStoredSession();
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    throw new Error('Your session has expired. Please sign in again.');
  }

  throw new Error(errorData.detail || `${fallbackMessage} (${res.status})`);
}

export async function authenticateGoogleToken(idToken) {
  const res = await request(`${BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });

  // Signing in is the one call where a 401 is not an expiring session: there is
  // no session yet, and reporting one would hide why the sign-in was rejected.
  return unwrap(res, 'Google authentication failed.', { endSessionOn401: false });
}

export async function fetchUserProfile() {
  const token = localStorage.getItem('agent1_google_token');
  if (!token) return null;

  try {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearStoredSession();
      }
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}

export async function uploadDocument(file, chunkSize = 800, chunkOverlap = 150) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await request(
    `${BASE_URL}/documents/upload?chunk_size=${chunkSize}&chunk_overlap=${chunkOverlap}`,
    {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: formData,
    }
  );

  return unwrap(res, 'Upload failed');
}

export async function fetchDocuments() {
  const res = await request(`${BASE_URL}/documents`, {
    headers: getAuthHeaders(),
  });

  return unwrap(res, 'Failed to fetch documents.');
}

export async function deleteDocument(docId) {
  const res = await request(`${BASE_URL}/documents/${docId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  return unwrap(res, 'Failed to delete document.');
}

export async function searchDocuments({ query, topK = 5, docId = null }) {
  const res = await request(`${BASE_URL}/documents/search`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ query, top_k: topK, doc_id: docId }),
  });

  return unwrap(res, 'Vector search failed.');
}

export async function sendChatMessage({ message, sessionId }) {
  const res = await request(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  return unwrap(res, 'Agent reasoning error');
}

export async function browseDriveFolders(parentId = 'root', driveToken = null) {
  const headers = getAuthHeaders();
  if (driveToken) {
    headers['X-Drive-Token'] = driveToken;
  }
  const res = await request(`${BASE_URL}/drive/browse?parent_id=${encodeURIComponent(parentId)}`, {
    headers,
  });

  return unwrap(res, 'Failed to browse Google Drive folders.');
}

export async function syncDriveFolder({ folderId, folderName = '', chunkSize = 800, chunkOverlap = 150, driveToken = null }) {
  const headers = getAuthHeaders();
  if (driveToken) {
    headers['X-Drive-Token'] = driveToken;
  }
  const res = await request(`${BASE_URL}/drive/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      folder_id: folderId,
      folder_name: folderName,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      drive_token: driveToken,
    }),
  });

  return unwrap(res, 'Google Drive folder sync failed.');
}

export async function switchVectorBackend(backend) {
  const res = await request(`${BASE_URL}/settings/backend`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ backend }),
  });

  return unwrap(res, 'Failed to switch vector backend.');
}

export async function fetchBackendSetting() {
  const res = await request(`${BASE_URL}/settings/backend`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    return null;
  }

  return await res.json();
}
