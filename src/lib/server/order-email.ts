import { createHash } from 'node:crypto';
import type { MailContent } from '@/lib/server/mail';

export type OrderEmailSnapshot = {
  orderReference?:string; productName?:string; quantity:number; subtotal?:number; unitPrice?:number;
  deliveryFee?:number; deliveryMode?:string; deliveryAddress?:string; requestedDate?:string; requestedSlot?:string;
  customerName?:string; customerPhone?:string; advancePaymentRequired?:boolean; paymentStatus?:string; status:string;
  selectedWeight?:{value:number;unit:string}|null;
};
/** A stable display reference; authorization always uses the original order document. */
export const orderReference=(id:string)=>`TS-${createHash('sha256').update(id).digest('hex').slice(0,12).toUpperCase()}`;
const currency=(amount:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);
const statuses:Record<string,string>={pending:'Awaiting seller confirmation',accepted:'Accepted',preparing:'In preparation',ready:'Ready','out-for-delivery':'Out for delivery',completed:'Completed',rejected:'Declined',cancelled:'Cancelled'};
export function orderEmail(id:string,order:OrderEmailSnapshot,audience:'buyer'|'seller'):Pick<MailContent,'reference'|'details'|'href'> {
  const details:NonNullable<MailContent['details']>=[];
  const add=(label:string,value:unknown)=>{if(value!==undefined&&value!==null&&String(value).trim())details.push({label,value:String(value).slice(0,600)});};
  add('Product',`${order.productName||'Your order'}${order.selectedWeight?` · ${order.selectedWeight.value} ${order.selectedWeight.unit}`:''}`);
  add('Quantity',order.quantity);
  add('Status',statuses[order.status]||order.status);
  if(typeof order.subtotal==='number'&&Number.isFinite(order.subtotal)){
    const fee=order.deliveryMode==='delivery'&&typeof order.deliveryFee==='number'&&Number.isFinite(order.deliveryFee)?order.deliveryFee:0;
    add('Items',currency(order.subtotal));
    if(order.deliveryMode==='delivery')add('Delivery fee',currency(fee));
    add('Order total',currency(order.subtotal+fee));
  }
  const date=order.requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(order.requestedDate)?new Date(`${order.requestedDate}T00:00:00Z`):null;
  const requested=date&&Number.isFinite(date.getTime())?date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
  add('Requested for',[requested,order.requestedSlot].filter(Boolean).join(' · '));
  add('Fulfilment',order.deliveryMode==='pickup'?'Pickup':'Delivery');
  if(order.deliveryMode==='delivery')add('Delivery address',order.deliveryAddress);
  add('Payment',order.paymentStatus==='collected'?'Seller recorded payment collected':order.advancePaymentRequired?'Advance arranged with seller':'Cash on delivery');
  if(audience==='seller'){add('Customer',order.customerName);add('Contact phone',order.customerPhone);}
  return {reference:order.orderReference||orderReference(id),details,
    href:audience==='seller'?`/seller/dashboard?section=orders&order=${encodeURIComponent(id)}`:`/orders?order=${encodeURIComponent(id)}`};
}
