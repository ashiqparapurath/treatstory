'use client';
import {usePagedCollection} from '@/firebase/firestore/use-paged-collection';
import {LoadMoreRecords} from '@/components/load-more-records';
import { errorToast } from '@/lib/user-notices';
import { LoadError } from '@/components/loading-states';

import { useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { Banner } from '@/lib/products';
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { BannerDialog } from './banner-dialog';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import Image from 'next/image';
import { OptimizedImage } from '@/components/optimized-image';

export function BannerList() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const bannersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'banners');
  }, [firestore]);

  const { data: banners, isLoading, error: loadError, retry: retryLoad, hasMore, loadingMore, loadMore } = usePagedCollection<Banner>(bannersQuery);

  const [bannerToEdit, setBannerToEdit] = useState<Banner | null>(null);
  const [bannerToDelete, setBannerToDelete] = useState<Banner | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [workingBannerId, setWorkingBannerId] = useState<string | null>(null);

  const handleEdit = (banner: Banner) => {
    setBannerToEdit(banner);
    setIsEditOpen(true);
  };

  const handleDelete = (banner: Banner) => {
    setBannerToDelete(banner);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!bannerToDelete || !firestore || workingBannerId) return;
    setWorkingBannerId(bannerToDelete.id);
    try {
      await deleteDoc(doc(firestore, 'banners', bannerToDelete.id));
      toast({ title: 'Banner deleted', description: `"${bannerToDelete.title}" was removed.` });
      setIsDeleteConfirmOpen(false);
      setBannerToDelete(null);
    } catch (error) {
      console.error('Banner deletion failed', error);
      toast(errorToast(error, 'delete'));
    } finally { setWorkingBannerId(null); }
  };

  const handleToggleActive = async (banner: Banner) => {
    if (!firestore || workingBannerId) return;
    setWorkingBannerId(banner.id);
    try {
      await updateDoc(doc(firestore, 'banners', banner.id), {
        isActive: !banner.isActive, updatedAt: serverTimestamp(),
      });
      toast({ title: 'Banner status updated', description: `"${banner.title}" is now ${!banner.isActive ? 'active' : 'inactive'}.` });
    } catch (error) {
      console.error('Banner status change failed', error);
      toast(errorToast(error, 'save'));
    } finally { setWorkingBannerId(null); }
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
      <LoadMoreRecords hasMore={hasMore} loadingMore={loadingMore} loadMore={loadMore}/></div>
    );
  }

  if (loadError) return <LoadError retry={retryLoad} error={loadError} />;

  return (
    <>
      {/* Mobile View */}
       <div className="grid gap-4 md:hidden">
        {banners && banners.length > 0 ? (
          banners.map((banner) => (
            <Card key={banner.id}>
              <CardHeader>
                 <div className="flex gap-4 items-start">
                   <div className="relative w-24 h-14 rounded-md overflow-hidden flex-shrink-0">
                      <OptimizedImage src={banner.imageUrl} alt={banner.title} fill className="object-cover" />
                  </div>
                  <div className="flex-1">
                     <CardTitle className="text-lg leading-tight">{banner.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Switch
                            checked={banner.isActive}
                            onCheckedChange={() => void handleToggleActive(banner)}
                            aria-label="Toggle banner status"
                        />
                        <span className="text-sm text-muted-foreground">{banner.isActive ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
               <CardContent>
                <p className="text-sm text-muted-foreground">
                  Created: {formatDate(banner.createdAt)}
                </p>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => handleEdit(banner)}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" className="w-full" onClick={() => handleDelete(banner)}>
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))
        ) : (
          <div className="text-center py-10">
            <p className="text-muted-foreground">No banners found. Add one to get started!</p>
          </div>
        )}
      </div>

      {/* Desktop View */}
      <div className="rounded-lg border hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Image</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners && banners.length > 0 ? (
              banners.map((banner) => (
                <TableRow key={banner.id}>
                  <TableCell>
                     <div className="relative w-16 h-9 rounded-md overflow-hidden border">
                        <OptimizedImage src={banner.imageUrl} alt={banner.title} fill className="object-cover" />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{banner.title}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={banner.isActive}
                            onCheckedChange={() => void handleToggleActive(banner)}
                            aria-label="Toggle banner status"
                        />
                        <span className="text-sm">{banner.isActive ? "Active" : "Inactive"}</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(banner.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(banner)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(banner)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No banners found. Add one to get started!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {bannerToEdit && (
         <BannerDialog
          isOpen={isEditOpen}
          onOpenChange={setIsEditOpen}
          banner={bannerToEdit}
        />
      )}

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the banner
              "{bannerToDelete?.title}".
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
