export type Doc = { id: string; tenantId: string; body: string };
export class Repository {
  constructor(private docs: Doc[]) {}
  async find(tenantId: string, id?: string) {
    return id === undefined
      ? this.docs.find((d) => d.id === tenantId)
      : this.docs.find((d) => d.id === id && d.tenantId === tenantId);
  }
}
