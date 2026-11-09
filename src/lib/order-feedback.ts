export function orderFeedback(action:string, productName='Your order', deliveryMode='delivery', audience:'buyer'|'seller'='buyer') {
  const product=productName.trim().slice(0,120)||'Your order';
  const buyer=audience==='buyer';
  const text:Record<string,{title:string;description:string}>={
    placed:{title:buyer?'Order request received':'New order request',description:buyer?`${product}: your seller will review preparation, delivery and payment terms. No online payment was collected.`:`${product}: review the requested date, availability and payment terms.`},
    accepted:{title:'Order accepted',description:`${product}: the seller has accepted the order.`},
    preparing:{title:'Preparation started',description:`${product} is now being prepared.`},
    ready:{title:deliveryMode==='pickup'?'Ready for pickup':'Ready for delivery',description:deliveryMode==='pickup'?`${product}: confirm the collection time with the seller.`:`${product} is ready. Delivery arrangements are being handled by the seller.`},
    'out-for-delivery':{title:'Out for delivery',description:`${product} is on its way. Keep your phone available for delivery updates.`},
    completed:{title:deliveryMode==='pickup'?'Order marked collected':'Order marked delivered',description:`${product}: fulfillment has been recorded as complete.`},
    rejected:{title:'Order declined',description:buyer?`${product}: the seller declined this order. Contact them about any advance payment you have made.`:`${product}: the buyer will see that the order was declined. Resolve any advance payment directly with them.`},
    cancelled:{title:'Order cancelled',description:buyer?`${product}: contact the seller about any advance payment or refund.`:`${product}: arrange any advance-payment refund directly with the buyer.`},
    'request-cancellation':{title:buyer?'Cancellation request sent':'Cancellation requested',description:buyer?`${product}: your seller must review the request. The order is not cancelled yet.`:`${product}: the buyer asked to cancel. Review the request before changing the order status.`},
    'decline-cancellation':{title:'Cancellation request declined',description:buyer?`${product}: your order continues. Contact the seller if you need more help.`:`${product}: the buyer will see that their cancellation request was declined.`},
    'cod-collected':{title:buyer?'Seller recorded your payment':'Payment collection recorded',description:`${product}: payment was marked as collected by the seller. TreatStory did not process an online charge.`},
  };
  return text[action]||{title:'Order updated',description:`${product}: open the order to review its latest status.`};
}
