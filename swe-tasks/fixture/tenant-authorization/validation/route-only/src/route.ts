export async function getDocument(r: any, s: any) {
  const d = await s.get(r.params.id);
  return d?.tenantId === r.tenantId
    ? { status: 200, body: d }
    : { status: 404 };
}
