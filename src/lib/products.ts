
export type Product = {
  id: string;
  sellerId?: string;
  name: string;
  description: string;
  price: number;
  category: string;
  categoryId: string;
  imageUrls: string[]; 
  showPrice: boolean;
  minimumOrderQuantity?: number;
  customizationNote?: string; // Optional buyer request; final price is confirmed by the seller.
  selectedWeight?: { value: number; unit: 'g'|'kg'|'ml'|'l'|'pieces' };
  createdAt?: any;
  updatedAt?: any;
};

export type Banner = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  buttonText: string;
  buttonLink: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export type Category = {
  id: string;
  name: string;
  description: string;
  createdAt?: any;
  updatedAt?: any;
};

export type EnquirySettings = {
  id: string;
  whatsappNumber: string;
  prefilledText: string;
  createdAt?: any;
  updatedAt?: any;
}


// This static data is no longer used. Products are now fetched from Firestore.
export const products: Product[] = [];
