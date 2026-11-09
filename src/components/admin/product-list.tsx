'use client';
import { errorToast } from '@/lib/user-notices';
import { LoadError } from '@/components/loading-states';

import { useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc } from 'firebase/firestore';
import type { Product } from '@/lib/products';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ProductDialog } from './product-dialog';
import { format } from 'date-fns';
import { Badge } from '../ui/badge';
import Image from 'next/image';

export function ProductList() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const productsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'products');
  }, [firestore]);

  const { data: products, isLoading, error: loadError, retry: retryLoad } = useCollection<Product>(productsQuery);

  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const handleEdit = (product: Product) => {
    setProductToEdit(product);
    setIsEditOpen(true);
  };

  const handleDelete = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (productToDelete && firestore) {
      const docRef = doc(firestore, 'products', productToDelete.id);
      try {
      await deleteDoc(docRef);
      toast({
        title: 'Product Deleted',
        description: `${productToDelete.name} has been removed.`,
      });
      setIsDeleteConfirmOpen(false);
      setProductToDelete(null);
      } catch(error) {toast(errorToast(error,'delete-product'));}
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(price);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'PPpp');
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (loadError) return <LoadError retry={retryLoad} error={loadError} />;

  return (
    <>
      {/* Mobile View */}
      <div className="grid gap-4 md:hidden">
        {products && products.length > 0 ? (
          products.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <div className="flex gap-4">
                   <div className="relative w-20 h-20 rounded-md overflow-hidden flex-shrink-0">
                    <Image src={product.imageUrls[0]} alt={product.name} fill className="object-cover" />
                  </div>
                  <div className="flex-1">
                     <CardTitle className="text-lg">{product.name}</CardTitle>
                     <CardDescription>{formatPrice(product.price)}</CardDescription>
                     <Badge variant="secondary" className="mt-2 capitalize">{product.category}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Created: {formatDate(product.createdAt)}
                </p>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => handleEdit(product)}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" className="w-full" onClick={() => handleDelete(product)}>
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))
        ) : (
          <div className="text-center py-10">
            <p className="text-muted-foreground">No products found. Add one to get started!</p>
          </div>
        )}
      </div>
      
      {/* Desktop View */}
      <div className="rounded-lg border hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products && products.length > 0 ? (
              products.map((product) => (
                <TableRow key={product.id}>
                   <TableCell>
                     <div className="relative w-16 h-16 rounded-md overflow-hidden border">
                        <Image src={product.imageUrls[0]} alt={product.name} fill className="object-cover" />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="capitalize">{product.category}</TableCell>
                  <TableCell>{formatPrice(product.price)}</TableCell>
                  <TableCell>{formatDate(product.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No products found. Add one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {productToEdit && (
         <ProductDialog
          isOpen={isEditOpen}
          onOpenChange={setIsEditOpen}
          product={productToEdit}
        />
      )}

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product
              "{productToDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
