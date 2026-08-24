export function createAutosave(save:any,status:any){let p=Promise.resolve();return{edit(v:string){p=p.then(()=>save(v)).then(()=>status('saved'),()=>status('error'))},flush(){return p},destroy(){}}}
