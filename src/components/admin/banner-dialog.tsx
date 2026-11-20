'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BannerForm } from './banner-form';
import type { Banner } from '@/lib/products';

interface BannerDialogProps {
  children?: React.ReactNode;
  banner?: Banner;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BannerDialog({ children, banner, isOpen, onOpenChange }: BannerDialogProps) {
  const isEditMode = !!banner;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Banner' : 'Add New Banner'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details of your banner.' : 'Fill in the details for the new banner.'}
          </DialogDescription>
        </DialogHeader>
        <BannerForm banner={banner} onFinished={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
