/**
 * API Client for Agent-1 Document Q&A RAG FastAPI Gateway.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8084';

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

export async function authenticateGoogleToken(idToken) {
  const res = await fetch(`${BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Google authentication failed.');
  }

  return await res.json();
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
        localStorage.removeItem('agent1_google_token');
        localStorage.removeItem('agent1_user');
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

  const res = await fetch(
    `${BASE_URL}/documents/upload?chunk_size=${chunkSize}&chunk_overlap=${chunkOverlap}`,
    {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: formData,
    }
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload failed (${res.status})`);
  }

  return await res.json();
}

export async function fetchDocuments() {
  const res = await fetch(`${BASE_URL}/documents`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to fetch documents.');
  }

  return await res.json();
}

export async function deleteDocument(docId) {
  const res = await fetch(`${BASE_URL}/documents/${docId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete document.');
  }

  return await res.json();
}

export async function searchDocuments({ query, topK = 5, docId = null }) {
  const res = await fetch(`${BASE_URL}/documents/search`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ query, top_k: topK, doc_id: docId }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Vector search failed.');
  }

  return await res.json();
}

export async function sendChatMessage({ message, sessionId }) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Agent reasoning error (${res.status})`);
  }

  return await res.json();
}

export async function browseDriveFolders(parentId = 'root', driveToken = null) {
  const headers = getAuthHeaders();
  if (driveToken) {
    headers['X-Drive-Token'] = driveToken;
  }
  const res = await fetch(`${BASE_URL}/drive/browse?parent_id=${encodeURIComponent(parentId)}`, {
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to browse Google Drive folders.');
  }

  return await res.json();
}

export async function syncDriveFolder({ folderId, folderName = '', chunkSize = 800, chunkOverlap = 150, driveToken = null }) {
  const headers = getAuthHeaders();
  if (driveToken) {
    headers['X-Drive-Token'] = driveToken;
  }
  const res = await fetch(`${BASE_URL}/drive/sync`, {
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

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Google Drive folder sync failed.');
  }

  return await res.json();
}

export async function switchVectorBackend(backend) {
  const res = await fetch(`${BASE_URL}/settings/backend`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ backend }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to switch vector backend.');
  }

  return await res.json();
}

export async function fetchBackendSetting() {
  const res = await fetch(`${BASE_URL}/settings/backend`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    return null;
  }

  return await res.json();
}
