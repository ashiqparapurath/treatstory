/** Exercise actual seller-authorized creates/edits against the local rules emulator. */
import { initializeApp as initializeAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, serverTimestamp, terminate } from 'firebase/firestore';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function run(){
 if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('emulator required');
 const projectId='demo-treatstory';
 const db=adminFirestore(initializeAdmin({projectId},'product-save-admin'));
 const uid='test-product-seller-'+randomUUID();
 await db.doc('sellers/'+uid).set({ownerUid:uid,status:'active',isOpen:true,accessEndsAt:Timestamp.fromMillis(Date.now()+86400000)});
 const app=initializeApp({projectId,apiKey:'test-key'},'product-save-client');
 const client=getFirestore(app);
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 connectFirestoreEmulator(client,host,Number(port),{mockUserToken:{sub:uid}});
 const product={sellerId:uid,name:'Test Cake',description:'Chocolate cake',category:'Cake',price:450,imageUrls:['https://example.com/cake.jpg'],showPrice:true,availability:'made-to-order',stockQuantity:0,preparationDays:0,minimumOrderQuantity:1,customizationOptions:[],advancePaymentRequired:false,careInstructions:'',ingredients:'',allergens:[],dietaryTags:[],storageInstructions:'',weightOptions:[],status:'published',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
 for(const [id,data] of Object.entries({simple:product,advance:{...product,advancePaymentRequired:true},max:{...product,allergens:Array.from({length:12},(_,i)=>'allergen'+i),dietaryTags:Array.from({length:12},(_,i)=>'tag'+i),weightOptions:Array.from({length:8},(_,i)=>({value:i+1,unit:'g',price:450,stockQuantity:5})),customizationOptions:['A','B','C','D','E','F']}})){
  try{if(id==='max')await db.doc('marketplace_products/'+uid+'_'+id).set({...data,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});else await setDoc(doc(client,'marketplace_products',uid+'_'+id),data); console.log(id==='max'?'Seeded existing detailed listing':'PASS create '+id);}catch(e){console.error('FAIL save',id,e);throw e;}
 }
 const target=doc(client,'marketplace_products',uid+'_max');
 await updateDoc(target,{name:'Updated detailed cake',price:500,advancePaymentRequired:true,updatedAt:serverTimestamp()});

 console.log('PASS edit detailed product base fields');
 const current=(await db.doc('marketplace_products/'+uid+'_max').get()).data()!;
 await updateDoc(target,{weightOptions:current.weightOptions.map((w:Record<string,unknown>)=>({...w,price:550})),updatedAt:serverTimestamp()});
 console.log('PASS edit detailed product and every variant price with advance requirement');
 await updateDoc(target,{allergens:['Milk','Eggs'],customizationOptions:['Message on cake'],updatedAt:serverTimestamp()});
 console.log('PASS edit food labels and personalization');
 const denied=(error:unknown)=>(error as {code?:string}).code==='permission-denied';
 await assert.rejects(()=>updateDoc(target,{weightOptions:[{value:1,unit:'g',price:-1}],updatedAt:serverTimestamp()}),denied,'price-only fast path must reject negative prices');
 await assert.rejects(()=>updateDoc(target,{weightOptions:[{value:1,unit:'g',price:null}],updatedAt:serverTimestamp()}),denied,'price-only fast path must reject null prices');
 await assert.rejects(()=>updateDoc(target,{createdAt:serverTimestamp(),updatedAt:serverTimestamp()}),denied,'creation time must stay immutable');
 await assert.rejects(()=>updateDoc(target,{weightOptions:[{value:1,unit:'kg'}],updatedAt:serverTimestamp()}),denied,'size prices must remain required');
 await assert.rejects(()=>updateDoc(target,{allergens:[123],updatedAt:serverTimestamp()}),denied,'non-string labels must be rejected');
 await assert.rejects(()=>updateDoc(target,{dietaryTags:['x'.repeat(41)],updatedAt:serverTimestamp()}),denied,'oversized labels must be rejected');
 await assert.rejects(()=>updateDoc(target,{weightOptions:[{value:1,unit:'kg',price:500,extra:true}],updatedAt:serverTimestamp()}),denied,'unknown variant fields must be rejected');
 await assert.rejects(()=>updateDoc(target,{sellerId:'someone-else',updatedAt:serverTimestamp()}),denied,'ownership cannot change');
 await db.doc('sellers/'+uid).update({accessEndsAt:Timestamp.fromMillis(Date.now()-1000)});
 await assert.rejects(()=>updateDoc(target,{price:550,updatedAt:serverTimestamp()}),denied,'expired seller access must be rejected');
 console.log('PASS reject missing variant prices, malformed labels, unexpected fields, ownership changes and expired access');
 await terminate(client);await deleteApp(app);await db.terminate();
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
