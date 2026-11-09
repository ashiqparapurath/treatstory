
'use client';

import { useCart } from '@/context/cart-context';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Plus, Minus, Send, ShoppingCart } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import type { EnquirySettings } from '@/lib/products';
import { doc } from 'firebase/firestore';
import { Skeleton } from './ui/skeleton';

export function CartDrawer() {
  const { cartItems, removeFromCart, updateQuantity, clearCart } = useCart();
  const firestore = useFirestore();

  const settingsRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'enquiry');
  }, [firestore]);

  const { data: enquirySettings, isLoading: isLoadingSettings } = useDoc<EnquirySettings>(settingsRef);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(price);
  };

  const itemsWithPrice = cartItems.filter(item => item.showPrice);
  const totalAmount = itemsWithPrice.reduce((total, item) => total + item.price * item.quantity, 0);

  const handleSendEnquiry = () => {
    if (!enquirySettings) {
      alert("Enquiry service is not configured. Please contact support.");
      return;
    }

    const businessPhoneNumber = enquirySettings.whatsappNumber || '97430147881';
    
    const itemStrings = cartItems.map(item => {
      const priceString = item.showPrice ? ` - ${formatPrice(item.price * item.quantity)}` : '';
      return `${item.name} (x${item.quantity})${priceString}`;
    });
    
    const itemsList = itemStrings.join('\n');
    const totalString = totalAmount > 0 ? formatPrice(totalAmount) : 'N/A';

    let message = enquirySettings.prefilledText || "Hello AS PRODUCTION, I'd like to enquire about the following items:\n\n{{items}}\n\nTotal: {{total}}";
    
    message = message.replace('{{items}}', itemsList);
    message = message.replace('{{total}}', totalString);
    
    const whatsappUrl = `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="flex flex-col h-full">
      {cartItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <ShoppingCart className="h-16 w-16 text-muted-foreground" />
          <h3 className="mt-4 text-xl font-semibold">Your cart is empty</h3>
          <p className="mt-2 text-sm text-muted-foreground">Add some products to get started.</p>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1 -mx-6">
            <div className="px-6 space-y-4">
            {cartItems.map((item) => (
                <div key={item.lineId} className="flex items-start gap-4">
                   <div className="relative w-20 h-20 rounded-md overflow-hidden flex-shrink-0">
                    <CartImage imageUrl={item.imageUrl} name={item.name} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm line-clamp-2">{item.name}</p>
                    {item.showPrice ? (
                      <p className="text-sm text-muted-foreground">{formatPrice(item.price)}</p>
                    ) : null}
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.lineId, item.quantity - 1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.lineId, item.quantity + 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFromCart(item.lineId)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="border-t mt-auto -mx-6 px-6 pt-4">
            {totalAmount > 0 && (
                <div className="flex justify-between font-bold text-lg">
                <p>Total</p>
                <p>{formatPrice(totalAmount)}</p>
                </div>
            )}
             {isLoadingSettings ? (
                <Skeleton className="h-10 w-full mt-4" />
             ) : (
                <Button onClick={handleSendEnquiry} className="w-full mt-4" disabled={!enquirySettings?.whatsappNumber}>
                    Send Enquiry via WhatsApp
                    <Send className="ml-2 h-4 w-4" />
                </Button>
             )}
            <Button variant="outline" onClick={clearCart} className="w-full mt-2">Clear Cart</Button>
          </div>
        </>
      )}
    </div>
  );
}

function CartImage({ imageUrl, name }: { imageUrl: string; name: string }) {
    const fallbackImage = "https://placehold.co/600x600/EEE/31343C?text=Image+Not+Available";
    const [src, setSrc] = useState(imageUrl || fallbackImage);

    return (
        <Image
            src={src}
            alt={name}
            fill
            className="object-cover w-full h-full"
            onError={() => setSrc(fallbackImage)}
        />
    );
}
