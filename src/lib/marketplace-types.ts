export type SellerStatus = 'pending' | 'active' | 'suspended' | 'expired' | 'rejected';
export type SellerAccessType = 'trial' | 'full';
export type SellerCategory = 'home-bakery' | 'art' | 'handmade' | 'other';

export interface SellerApplication {
  id: string;
  ownerUid: string;
  businessName: string;
  businessCategory: SellerCategory;
  contactEmail: string;
  contactPhone: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: unknown;
  reviewedAt?: unknown;
  reviewedBy?: string;
}

export interface Seller {
  id: string;
  ownerUid: string;
  slug: string;
  businessName: string;
  businessCategory: SellerCategory;
  description: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber?: string;
  logoUrl?: string;
  coverUrl?: string;
  isOpen: boolean;
  status: SellerStatus;
  accessType: SellerAccessType;
  accessStartsAt: unknown;
  accessEndsAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface MarketplaceProduct {
  id: string;
  sellerId: string;
  status: 'draft' | 'published';
  createdAt?: unknown;
  updatedAt?: unknown;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrls: string[];
  showPrice: boolean;
  availability: 'available' | 'unavailable' | 'made-to-order';
  preparationDays?: number;
  minimumOrderQuantity?: number;
  weightValue?: number;
  weightUnit?: 'g' | 'kg' | 'ml' | 'l' | 'pieces';
  careInstructions?: string;
  weightOptions?: Array<{value:number;unit:'g'|'kg'|'ml'|'l'|'pieces'}>;
  customizationOptions?: string[];
  stockQuantity?: number;
}

export type SellerOrderStatus =
  | 'pending' | 'accepted' | 'preparing' | 'ready' | 'out-for-delivery'
  | 'completed' | 'rejected' | 'cancelled';

export interface SellerOrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedOptions?: Record<string, string>;
}

export interface SellerOrder {
  id: string;
  checkoutId: string;
  sellerId: string;
  buyerUid: string;
  items: SellerOrderItem[];
  subtotal: number;
  status: SellerOrderStatus;
  customerNote?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CheckoutOrder {
  id: string;
  buyerUid: string;
  sellerOrderIds: string[];
  total: number;
  currency: 'INR';
  paymentMethod: 'offline';
  status: 'placed' | 'partially-completed' | 'completed' | 'cancelled';
  createdAt: unknown;
}
