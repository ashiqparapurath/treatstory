
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useFirestore, useAccountRole, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore';
import { uploadTreatStoryPhoto } from '@/lib/cloudinary-upload';
import type { Banner, Category } from '@/lib/products';
import { useToast } from '@/hooks/use-toast';
 import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { X, UploadCloud } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '../ui/skeleton';

const MAX_FILE_SIZE = 1_000_000; // Under 1 MB. Images live on Cloudinary, not inside Firestore.
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png']);

function bannerSaveError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'permission-denied') return 'You do not have permission to change this banner. Check your administrator access.';
  return error instanceof Error ? error.message : 'Unable to save the banner. Please try again or contact support.';
}

const formSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters.'),
  subtitle: z.string().min(2, 'Subtitle must be at least 2 characters.'),
  buttonText: z.string().min(2, 'Button text must be at least 2 characters.'),
  buttonLink: z.string().min(1, 'Please select a category link.'),
  imageUrl: z.string().min(1, "An image is required."),
  isActive: z.boolean().default(true),
});

type BannerFormValues = z.infer<typeof formSchema>;

interface BannerFormProps {
  banner?: Banner;
  onFinished: () => void;
}

export function BannerForm({ banner, onFinished }: BannerFormProps) {
  const firestore = useFirestore();
  const { role, isRoleLoading } = useAccountRole();
  const { toast } = useToast();
  const { user } = useUser();
  const isEditMode = !!banner;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(banner?.imageUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const temporaryPreview = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (temporaryPreview.current) URL.revokeObjectURL(temporaryPreview.current); }, []);
  const discardTemporaryPreview = () => {
    if (temporaryPreview.current) URL.revokeObjectURL(temporaryPreview.current);
    temporaryPreview.current = null;
  };

  const categoriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'categories');
  }, [firestore]);

  const { data: categories, isLoading: isLoadingCategories } = useCollection<Category>(categoriesQuery);

  const form = useForm<BannerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: banner?.title || '',
      subtitle: banner?.subtitle || '',
      buttonText: banner?.buttonText || '',
      buttonLink: banner?.buttonLink || '',
      imageUrl: banner?.imageUrl || '',
      isActive: banner?.isActive ?? true,
    },
    mode: 'onChange',
  });

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      form.setError('imageUrl', { type: 'manual', message: 'Choose a JPG or PNG image.' });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      form.setError('imageUrl', { type: 'manual', message: 'Image exceeds 1 MB. Compress it before uploading.' });
      return;
    }

    discardTemporaryPreview();
    const url = URL.createObjectURL(file);
    temporaryPreview.current = url;
    setSelectedFile(file);
    setImagePreview(url);
    form.clearErrors('imageUrl');
    // Form requires an image, but the file itself is uploaded only on Save.
    // Only the resulting Cloudinary HTTPS URL is saved in Firestore.
    form.setValue('imageUrl', 'pending-upload', { shouldValidate: true, shouldDirty: true });
  };

  const removeImage = () => {
    discardTemporaryPreview();
    setSelectedFile(null);
    setImagePreview(null);
    form.setValue('imageUrl', '', { shouldValidate: true, shouldDirty: true });
  };

  const onSubmit = async (data: BannerFormValues) => {
    if (!firestore || !user || role !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Administrator access required',
        description: 'Sign in as an administrator with a roles_admin document to manage homepage banners.',
      });
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      let url = data.imageUrl;
      if (selectedFile) url = await uploadTreatStoryPhoto(user, selectedFile, 'banner');
      if (!url || url === 'pending-upload') throw new Error('Choose a banner image before saving.');

      const bannerData = {
        title: data.title.trim(),
        subtitle: data.subtitle.trim(),
        buttonText: data.buttonText.trim(),
        buttonLink: data.buttonLink,
        imageUrl: url,
        isActive: data.isActive,
      };
      if (isEditMode && banner) {
        await updateDoc(doc(firestore, 'banners', banner.id), { ...bannerData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(firestore, 'banners'), { ...bannerData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }

      toast({ title: isEditMode ? 'Banner updated' : 'Banner added', description: `"${data.title}" is saved and ready.` });
      onFinished();
    } catch (error: unknown) {
      console.error('Banner save failed', { code: (error as { code?: string })?.code, error });
      toast({ variant: 'destructive', title: 'Could not save banner', description: bannerSaveError(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-6">
           <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Banner Image</FormLabel>
                 <FormControl>
                   {!imagePreview ? (
                      <div
                        className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-muted transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UploadCloud className="w-10 h-10 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold">Click to upload</span>
                        </p>
                        <p className="text-xs text-muted-foreground">Recommended: 1280x720px (16:9)</p>
                        <p className="text-xs text-muted-foreground">PNG, JPG (under 1 MB).</p>
                        <Input 
                          type="file" 
                          accept="image/png, image/jpeg" 
                          onChange={handleImageChange}
                          ref={fileInputRef}
                          className="sr-only"
                          id={field.name}
                          disabled={isSubmitting}
                        />
                      </div>
                   ) : (
                      <div className="relative w-full aspect-video rounded-md overflow-hidden border">
                        <Image src={imagePreview} alt="Banner preview" fill unoptimized className="object-cover" />
                        <Button 
                          type="button" 
                          variant="destructive" 
                          size="icon" 
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={removeImage}
                        >
                          <X className="h-4 w-4"/>
                        </Button>
                      </div>
                   )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Mid-Season Sale" {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="subtitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subtitle</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Up to 30% off" {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="buttonText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Button Text</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Shop Now" {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="buttonLink"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Button Link</FormLabel>
                  {isLoadingCategories ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category page to link to" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="/products">All Products</SelectItem>
                        {categories?.map((category) => (
                          <SelectItem key={category.id} value={`/products?category=${category.name}`}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Activate Banner</FormLabel>
                  <FormDescription>Make this banner visible on the homepage.</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSubmitting}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        
        <Button type="submit" disabled={isSubmitting || isRoleLoading || role !== 'admin' || !form.formState.isValid} className="w-full">
          {isSubmitting ? 'Uploading and saving…' : 'Save Banner'}
        </Button>
      </form>
    </Form>
  );
}
