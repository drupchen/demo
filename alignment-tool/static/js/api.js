/** Thin fetch helpers for the Flask backend API. */

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

async function postJSON(url, data) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

export const api = {
  getInstances: () => fetchJSON("/api/instances"),
  getManifest: (id) => fetchJSON(`/api/manifest/${id}`),
  getSessions: (id) => fetchJSON(`/api/sessions/${id}`),
  getSession: (id, name) => fetchJSON(`/api/session/${id}/${name}`),
  saveSession: (id, name, segments) => postJSON(`/api/save/${id}/${name}`, segments),
  combineSessions: (id) => postJSON(`/api/combine/${id}`, {}),
};
