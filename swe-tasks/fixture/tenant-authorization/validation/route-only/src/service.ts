import type{Repository}from'./repository';export class Documents{constructor(private repo:Repository){}async get(id:string){return this.repo.find(id)}}
