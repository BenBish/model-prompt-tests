import type { Documents } from "./service";
export async function getDocument(r: any, s: Documents) {
  const d = await s.get(r.params.id);
  return d ? { status: 200, body: d } : { status: 404 };
}
