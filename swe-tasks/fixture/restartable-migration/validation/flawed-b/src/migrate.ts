export async function migrateAccounts(db:any,n:number){db.newReads=true;for(const r of await db.list('',999))await db.update(r.id,{displayName:r.name})}
