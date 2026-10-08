export async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    const error = new Error(j.error || 'Something went wrong.');
    error.status = r.status;
    throw error;
  }
  
  return j;
}