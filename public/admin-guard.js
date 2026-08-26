const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
  if (url?.endsWith('/api/admin/form')) {
    const payload = await response.clone().json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Draft request failed (${response.status}).`);
    if (!payload.draft || !Array.isArray(payload.draft.pages)) throw new Error('The server returned an invalid draft.');
  }
  return response;
};
