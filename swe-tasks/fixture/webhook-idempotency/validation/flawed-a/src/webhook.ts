export function createWebhookHandler(store:any,effect:any){return async(e:any)=>{if(await store.has(e.id))return'duplicate';await effect(e);await store.add(e.id);return'processed'}}
