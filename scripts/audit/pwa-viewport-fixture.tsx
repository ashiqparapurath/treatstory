import React, {useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Header} from '@/components/header';
import {MobileBuyBar} from '@/components/mobile-buy-bar';
import {MobileCategoryRail} from '@/components/mobile-category-rail';
import {ProductCard} from '@/components/product-card';
import {SellerProductCard} from '@/components/seller-product-card';
import type {Product} from '@/lib/products';
import type {MarketplaceProduct} from '@/lib/marketplace-types';

/** A local, synthetic, read-only display fixture; it never uses production accounts or Firebase. */
const image = 'https://example.test/fixture-product.jpg';
const base: Product = {id:'sample-cake', name:'Chocolate celebration cake', category:'Cakes',
 categoryId:'cakes', price:1450, description:'Made with care in Kerala', imageUrls:[image],
 showPrice:true};
const seller: MarketplaceProduct = {id:'sample-handmade',sellerId:'sample-creator',status:'published',
 name:'A thoughtful handmade creation', description:'Carefully crafted in Kerala',
 category:'Handmade gifts',price:1850,imageUrls:[image],showPrice:true,
 availability:'made-to-order',stockQuantity:10};
function Page(){
 return <div className="min-h-screen bg-[#fffcf8] text-[#30251c]">
   <Header/>
   <main className="section-shell space-y-7 py-6">
     <div className="rounded-[22px] border border-[#e8dbd0] bg-[#f5e8dc] px-5 py-5 md:max-w-2xl">
       <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#874a28]">Made with care</p>
       <h1 className="mt-2 text-[22px] font-semibold tracking-tight">Discover something lovely</h1>
       <p className="mt-2 text-sm text-[#73665b]">Home bakes, handmade gifts and more.</p>
     </div>
     <MobileCategoryRail/>
     <section aria-label="Fixture product grid">
       <h2 className="mb-4 text-[19px] font-semibold tracking-tight">Featured products</h2>
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
         <SellerProductCard product={seller} addToBag={()=>{}} buyNow={()=>{}}/>
         <ProductCard product={base}/>
         <SellerProductCard product={{...seller,id:'other-sample',name:'Blush Meadow Bouquet',category:'Flowers',price:1599,availability:'unavailable',stockQuantity:0}} addToBag={()=>{}} buyNow={()=>{}}/>
         <ProductCard product={{...base,id:'other-cake',name:'Butter cookies and bakes'}}/>
       </div>
     </section>
   </main>
 </div>;
}
function DetailPage(){
 const target=useRef<HTMLDivElement>(null);
 return <div className="min-h-screen bg-[#fffcf9] text-[#29251f]">
  <Header/>
  <main className="section-shell pb-48 pt-0 md:pt-8">
    <div className="aspect-[1/1.08] w-full rounded-b-2xl bg-[#ead9c8] md:max-w-md md:rounded-2xl"/>
    <section className="mt-5 space-y-3" aria-label="Fixture product detail">
     <h1 className="text-2xl font-semibold">Blush Meadow Bouquet</h1>
     <p className="text-lg font-semibold">₹1,599</p>
     <p>Seller: Test creator</p>
     <p className="leading-6">A carefully chosen handmade creation for every story.</p>
     <div className="min-h-[650px]">Select a size or quantity to continue.</div>
     <div ref={target} id="purchase-actions" className="flex h-12 gap-3"><button type="button">Add to bag</button><button type="button">Buy now</button></div>
    </section>
  </main>
  <MobileBuyBar target={target} enabled resetKey="synthetic-detail">
    <div className="min-w-0"><p className="text-[10px]">Total price</p><strong>₹1,599</strong></div>
    <button type="button" className="h-12 min-w-[144px] shrink-0 rounded-full bg-[#754328] px-4 text-white">Add to cart</button>
  </MobileBuyBar>
 </div>;
}
createRoot(document.getElementById('app')!).render(location.pathname.startsWith('/product/') ? <DetailPage/> : <Page/>);
