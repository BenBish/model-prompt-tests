export type Doc = { id: string; tenantId: string; body: string };
export class Repository {
  constructor(private docs: Doc[]) {}
  async find(id: string) {
    return this.docs.find((d) => d.id === id);
  }
}
