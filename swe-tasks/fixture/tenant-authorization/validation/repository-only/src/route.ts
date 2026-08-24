export async function getDocument(r: any, s: any) {
  const d = await s.get(r.params.tenantId ?? r.tenantId, r.params.id);
  return d ? { status: 200, body: d } : { status: 404 };
}
