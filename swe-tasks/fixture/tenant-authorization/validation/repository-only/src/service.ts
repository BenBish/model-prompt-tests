import type { Repository } from "./repository";
export class Documents {
  constructor(private repo: Repository) {}
  async get(t: string, id: string) {
    return this.repo.find(t, id);
  }
}
