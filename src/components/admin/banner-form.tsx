'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, doc, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore';
import { UploadCloud, X } from 'lucide-react';

import { useFirestore, useAccountRole, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { uploadTreatStoryPhoto } from '@/lib/cloudinary-upload';
import { MAX_ORIGINAL_BANNER_BYTES } from '@/lib/banner-image-upload';
import { safeBannerLink, DEFAULT_BANNER_HOTSPOT, DEFAULT_BANNER_PLACEMENT, type BannerHotspot, type BannerImagePlacement } from '@/lib/banner-layout';
import type { Banner, Category } from '@/lib/products';
import { errorToast, ActionError } from '@/lib/user-notices';
import { useToast } from '@/hooks/use-toast';
import { BannerHotspotEditor } from './banner-hotspot-editor';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const MAX_BANNER_BYTES = MAX_ORIGINAL_BANNER_BYTES;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const hotspotSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(8).max(100),
  height: z.number().min(8).max(100),
});

const placementSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  zoom: z.number().min(100).max(250),
});

const formSchema = z.object({
  displayMode: z.enum(['standard', 'image-only']),
  imageLinkMode: z.enum(['none', 'full', 'hotspot']),
  title: z.string(),
  subtitle: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
  linkLabel: z.string(),
  imageAlt: z.string(),
  imageUrl: z.string().min(1, 'A banner image is required.'),
  mobileImageUrl: z.string(),
  imageAspectRatio: z.number().min(0.1).max(10),
  mobileAspectRatio: z.number().min(0.1).max(10),
  desktopHotspot: hotspotSchema,
  mobileHotspot: hotspotSchema,
  desktopPlacement: placementSchema,
  mobilePlacement: placementSchema,
  isActive: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.displayMode === 'standard') {
    for (const field of ['title', 'subtitle', 'buttonText'] as const) {
      if (value[field].trim().length < 2)
        ctx.addIssue({ code: 'custom', path: [field], message: 'Enter at least 2 characters.' });
    }
  }
  if (value.displayMode === 'standard' || value.imageLinkMode !== 'none') {
    if (!safeBannerLink(value.buttonLink))
      ctx.addIssue({ code: 'custom', path: ['buttonLink'], message: 'Choose a valid destination.' });
  }
  if (value.displayMode === 'image-only' && value.imageLinkMode !== 'none' && value.linkLabel.trim().length < 2)
    ctx.addIssue({ code: 'custom', path: ['linkLabel'], message: 'Add a short accessible link label.' });
});

type BannerFormValues = z.infer<typeof formSchema>;
type PhotoKind = 'desktop' | 'mobile';

interface BannerFormProps { banner?: Banner; onFinished: () => void }

export function BannerForm({ banner, onFinished }: BannerFormProps) {
  const firestore = useFirestore();
  const { role, isRoleLoading } = useAccountRole();
  const { toast } = useToast();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(banner?.imageUrl || null);
  const [mobilePreview, setMobilePreview] = useState<string | null>(banner?.mobileImageUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const previewUrls = useRef<{desktop?: string; mobile?: string}>({});
  const desktopInput = useRef<HTMLInputElement>(null);
  const mobileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrls.current.desktop) URL.revokeObjectURL(previewUrls.current.desktop);
    if (previewUrls.current.mobile) URL.revokeObjectURL(previewUrls.current.mobile);
  }, []);

  const categoriesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'categories') : null, [firestore]);
  const { data: categories, isLoading: loadingCategories } = useCollection<Category>(categoriesQuery);

  const form = useForm<BannerFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      displayMode: banner?.displayMode === 'image-only' ? 'image-only' : 'standard',
      imageLinkMode: banner?.imageLinkMode || 'hotspot',
      title: banner?.title || '',
      subtitle: banner?.subtitle || '',
      buttonText: banner?.buttonText || '',
      buttonLink: banner?.buttonLink || '/products',
      linkLabel: banner?.linkLabel || banner?.buttonText || 'Explore collection',
      imageAlt: banner?.imageAlt || banner?.title || 'TreatStory promotional collection banner',
      imageUrl: banner?.imageUrl || '',
      mobileImageUrl: banner?.mobileImageUrl || '',
      imageAspectRatio: banner?.imageAspectRatio || 16 / 9,
      mobileAspectRatio: banner?.mobileAspectRatio || banner?.imageAspectRatio || 16 / 9,
      desktopHotspot: banner?.desktopHotspot || { ...DEFAULT_BANNER_HOTSPOT },
      mobileHotspot: banner?.mobileHotspot || banner?.desktopHotspot || { ...DEFAULT_BANNER_HOTSPOT },
      desktopPlacement: banner?.desktopPlacement || { ...DEFAULT_BANNER_PLACEMENT },
      mobilePlacement: banner?.mobilePlacement || { ...DEFAULT_BANNER_PLACEMENT },
      isActive: banner?.isActive ?? true,
    },
  });
  const mode = form.watch('displayMode');
  const linkMode = form.watch('imageLinkMode');
  const desktopHotspot = form.watch('desktopHotspot');
  const mobileHotspot = form.watch('mobileHotspot');
  const desktopPlacement = form.watch('desktopPlacement');
  const mobilePlacement = form.watch('mobilePlacement');
  const title = form.watch('title');
  const subtitle = form.watch('subtitle');
  const buttonText = form.watch('buttonText');

  const clearPreviewUrl = (kind: PhotoKind) => {
    if (previewUrls.current[kind]) URL.revokeObjectURL(previewUrls.current[kind]);
    delete previewUrls.current[kind];
  };

  const changeImage = (event: ChangeEvent<HTMLInputElement>, kind: PhotoKind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const field = kind === 'desktop' ? 'imageUrl' : 'mobileImageUrl';
    if (!ACCEPTED_TYPES.has(file.type)) {
      form.setError(field, { type: 'manual', message: 'Choose a JPG, PNG or WebP image.' });
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      form.setError(field, { type: 'manual', message: 'Image exceeds 16 MB. Choose a smaller image.' });
      return;
    }
    clearPreviewUrl(kind);
    const preview = URL.createObjectURL(file);
    previewUrls.current[kind] = preview;
    if (kind === 'desktop') {
      setSelectedFile(file);
      setImagePreview(preview);
    } else {
      setMobileFile(file);
      setMobilePreview(preview);
    }
    form.setValue(field, 'pending-upload', { shouldDirty: true, shouldValidate: true });
    form.clearErrors(field);
  };

  const removeImage = (kind: PhotoKind) => {
    clearPreviewUrl(kind);
    if (kind === 'desktop') {
      setSelectedFile(null);
      setImagePreview(null);
      form.setValue('imageUrl', '', { shouldValidate: true, shouldDirty: true });
    } else {
      setMobileFile(null);
      setMobilePreview(null);
      form.setValue('mobileImageUrl', '', { shouldValidate: true, shouldDirty: true });
    }
  };

  const updateAspect = (kind: PhotoKind, element: HTMLImageElement) => {
    const ratio = element.naturalWidth / element.naturalHeight;
    if (Number.isFinite(ratio) && ratio >= 0.1 && ratio <= 10) {
      form.setValue(kind === 'desktop' ? 'imageAspectRatio' : 'mobileAspectRatio', ratio);
    }
  };

  const onSubmit = async (data: BannerFormValues) => {
    if (!firestore || !user || role !== 'admin') {
      toast({ variant: 'destructive', title: 'Administrator access required',
        description: 'Sign in as a verified administrator to manage homepage banners.' });
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let url = data.imageUrl;
      let mobileUrl = data.mobileImageUrl;
      if (selectedFile) url = await uploadTreatStoryPhoto(user, selectedFile, 'banner');
      if (mobileFile) mobileUrl = await uploadTreatStoryPhoto(user, mobileFile, 'banner');
      if (!url || url === 'pending-upload') throw new ActionError('Choose a banner image before saving.', 400);
      if (mobileUrl === 'pending-upload') throw new ActionError('The mobile banner image has not finished uploading.', 400);

      const imageOnly = data.displayMode === 'image-only';
      const needsLink = !imageOnly || data.imageLinkMode !== 'none';
      const bannerData = {
        displayMode: data.displayMode,
        imageLinkMode: imageOnly ? data.imageLinkMode : 'full',
        title: imageOnly ? '' : data.title.trim(),
        subtitle: imageOnly ? '' : data.subtitle.trim(),
        buttonText: imageOnly ? '' : data.buttonText.trim(),
        buttonLink: needsLink ? safeBannerLink(data.buttonLink) || '' : '',
        linkLabel: data.linkLabel.trim(),
        imageAlt: data.imageAlt.trim(),
        imageUrl: url,
        mobileImageUrl: mobileUrl,
        imageAspectRatio: data.imageAspectRatio,
        mobileAspectRatio: mobileUrl ? data.mobileAspectRatio : data.imageAspectRatio,
        desktopHotspot: data.desktopHotspot,
        mobileHotspot: data.mobileHotspot,
        desktopPlacement: data.desktopPlacement,
        mobilePlacement: data.mobilePlacement,
        isActive: data.isActive,
      };
      if (banner) await updateDoc(doc(firestore, 'banners', banner.id), { ...bannerData, updatedAt: serverTimestamp() });
      else await addDoc(collection(firestore, 'banners'), { ...bannerData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      toast({ title: banner ? 'Banner updated' : 'Banner added', description: 'Your banner settings were saved.' });
      onFinished();
    } catch (error) {
      console.error('Banner save failed', { code: (error as { code?: string })?.code, error });
      toast(errorToast(error, error instanceof ActionError && error.status === 413 ? 'upload-photo' : 'save'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const linkSelect = <FormField control={form.control} name="buttonLink" render={({ field }) => <FormItem>
    <FormLabel>Button Destination</FormLabel>
    {loadingCategories ? <Skeleton className="h-10 w-full" /> :
      <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
        <FormControl><SelectTrigger><SelectValue placeholder="Select where visitors should go" /></SelectTrigger></FormControl>
        <SelectContent>
          <SelectItem value="/products">All Products</SelectItem>
          {categories?.map((category) => <SelectItem key={category.id}
            value={`/products?category=${encodeURIComponent(category.name)}`}>{category.name}</SelectItem>)}
        </SelectContent>
      </Select>}
    <FormMessage />
  </FormItem>} />;

  return <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pb-2">
      <FormField control={form.control} name="displayMode" render={({ field }) => <FormItem>
        <FormLabel>Banner Display Mode</FormLabel>
        <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
          <SelectContent>
            <SelectItem value="standard">Standard — separate text and button</SelectItem>
            <SelectItem value="image-only">Image-only — design already contains text</SelectItem>
          </SelectContent>
        </Select>
        <FormDescription>Existing banners remain standard unless you change their mode.</FormDescription>
      </FormItem>} />

      <div className="space-y-3">
        <div>
          <h3 className="font-semibold">Banner images</h3>
          <p className="text-xs text-muted-foreground">Choose a separate image for each screen. Both images are saved with this banner, and the mobile image is optional.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="min-w-0 space-y-2 rounded-xl border border-[#e8ded2] bg-[#fffdfa] p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Desktop image</h4>
              <span className="text-xs text-muted-foreground">Required</span>
            </div>
            <p className="text-xs text-muted-foreground">Recommended 1280 × 320 px (4:1)</p>
            <input ref={desktopInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
              aria-label="Upload desktop banner image" onChange={(event) => changeImage(event, 'desktop')} disabled={isSubmitting} />
            {imagePreview ? <div className="space-y-2">
              <div className="relative aspect-[4/1] overflow-hidden rounded-lg border bg-secondary">
                <Image src={imagePreview} alt="Desktop banner image preview" fill unoptimized className="object-contain"
                  onLoad={(event) => updateAspect('desktop', event.currentTarget)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => desktopInput.current?.click()} disabled={isSubmitting}>Replace desktop</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeImage('desktop')} disabled={isSubmitting}>
                  <X className="mr-1 h-4 w-4" />Remove
                </Button>
              </div>
            </div> : <Button type="button" variant="outline" className="h-28 w-full border-dashed"
              onClick={() => desktopInput.current?.click()} disabled={isSubmitting}>
              <UploadCloud className="mr-2 h-5 w-5" />Upload desktop image
            </Button>}
            {form.formState.errors.imageUrl && <p role="alert" className="text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>}
          </section>

          <section className="min-w-0 space-y-2 rounded-xl border border-[#e8ded2] bg-[#fffdfa] p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Mobile image</h4>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <p className="text-xs text-muted-foreground">Recommended 780 × 420 px (1.86:1)</p>
            <input ref={mobileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
              aria-label="Upload mobile banner image" onChange={(event) => changeImage(event, 'mobile')} disabled={isSubmitting} />
            {mobilePreview ? <div className="space-y-2">
              <div className="relative aspect-[13/7] overflow-hidden rounded-lg border bg-secondary">
                <Image src={mobilePreview} alt="Mobile banner image preview" fill unoptimized className="object-contain"
                  onLoad={(event) => updateAspect('mobile', event.currentTarget)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => mobileInput.current?.click()} disabled={isSubmitting}>Replace mobile</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeImage('mobile')} disabled={isSubmitting}>
                  <X className="mr-1 h-4 w-4" />Remove
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">This image will be shown to visitors on mobile screens.</p>
            </div> : <div className="space-y-2">
              <Button type="button" variant="outline" className="h-28 w-full border-dashed"
                onClick={() => mobileInput.current?.click()} disabled={isSubmitting}>
                <UploadCloud className="mr-2 h-5 w-5" />Upload mobile image
              </Button>
              <p className="text-xs text-muted-foreground">If omitted, the desktop image is used automatically on mobile.</p>
            </div>}
            {form.formState.errors.mobileImageUrl && <p role="alert" className="text-sm text-destructive">{form.formState.errors.mobileImageUrl.message}</p>}
          </section>
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP · Up to 16 MB each. Images over 3.4 MB are optimized before upload.</p>
      </div>

      {mode === 'standard' ? <>
        <FormField control={form.control} name="title" render={({ field }) => <FormItem>
          <FormLabel>Title</FormLabel><FormControl><Input placeholder="e.g., Mid-Season Sale" {...field} disabled={isSubmitting} /></FormControl><FormMessage />
        </FormItem>} />
        <FormField control={form.control} name="subtitle" render={({ field }) => <FormItem>
          <FormLabel>Subtitle</FormLabel><FormControl><Input placeholder="e.g., Up to 30% off" {...field} disabled={isSubmitting} /></FormControl><FormMessage />
        </FormItem>} />
        <FormField control={form.control} name="buttonText" render={({ field }) => <FormItem>
          <FormLabel>Button Text</FormLabel><FormControl><Input placeholder="e.g., Shop Now" {...field} disabled={isSubmitting} /></FormControl><FormMessage />
        </FormItem>} />
        {linkSelect}
      </> : <>
        <p className="text-sm text-muted-foreground">The desktop and mobile images can have different compositions. Mobile image-only artwork is shown without cropping; preview the two layouts below.</p>
        <FormField control={form.control} name="imageLinkMode" render={({ field }) => <FormItem>
          <FormLabel>Clickable Area</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="hotspot">Only the button inside my image</SelectItem>
              <SelectItem value="full">Make the whole banner clickable</SelectItem>
              <SelectItem value="none">No clickable link</SelectItem>
            </SelectContent>
          </Select>
          <FormDescription>The image's printed button becomes a real link when you position the transparent hotspot over it.</FormDescription>
        </FormItem>} />
        {linkMode !== 'none' && <>
          {linkSelect}
          <FormField control={form.control} name="linkLabel" render={({ field }) => <FormItem>
            <FormLabel>Accessible Link Label</FormLabel>
            <FormControl><Input placeholder="e.g., Explore collection" {...field} disabled={isSubmitting} /></FormControl>
            <FormDescription>Used by screen readers; no extra text appears on the banner.</FormDescription><FormMessage />
          </FormItem>} />
        </>}
        <FormField control={form.control} name="imageAlt" render={({ field }) => <FormItem>
          <FormLabel>Image Description (accessibility)</FormLabel>
          <FormControl><Input placeholder="e.g., Roses and curated gift boxes" {...field} disabled={isSubmitting} /></FormControl>
          <FormDescription>Describes the artwork to visitors who cannot see it.</FormDescription>
        </FormItem>} />


      </>}

      <div className="space-y-3 border-t border-[#e9dfd5] pt-4">
        <div>
          <h3 className="font-semibold">Live banner previews</h3>
          <p className="text-xs text-muted-foreground">These update instantly. Drag each image or use Zoom and position controls; desktop and mobile positions save separately.</p>
        </div>
        <BannerHotspotEditor label="Desktop" src={imagePreview}
          aspectRatio={form.watch('imageAspectRatio')} frameAspectRatio={1360 / 340}
          fit="cover" displayMode={mode} imageLinkMode={mode === 'standard' ? 'none' : linkMode}
          title={title} subtitle={subtitle} buttonText={buttonText}
          value={desktopHotspot as BannerHotspot}
          onChange={(next) => form.setValue('desktopHotspot', next, { shouldDirty: true })}
          placement={desktopPlacement as BannerImagePlacement}
          onPlacementChange={(next) => form.setValue('desktopPlacement', next, { shouldDirty: true })}
          disabled={isSubmitting} />
        <BannerHotspotEditor label="Mobile" src={mobilePreview || imagePreview}
          aspectRatio={mobilePreview ? form.watch('mobileAspectRatio') : form.watch('imageAspectRatio')}
          frameAspectRatio={390 / 210} fit={mode === 'image-only' ? 'contain' : 'cover'}
          displayMode={mode} imageLinkMode={mode === 'standard' ? 'none' : linkMode}
          title={title} subtitle={subtitle} buttonText={buttonText}
          value={mobileHotspot as BannerHotspot}
          onChange={(next) => form.setValue('mobileHotspot', next, { shouldDirty: true })}
          placement={mobilePlacement as BannerImagePlacement}
          onPlacementChange={(next) => form.setValue('mobilePlacement', next, { shouldDirty: true })}
          disabled={isSubmitting} />
      </div>

      <FormField control={form.control} name="isActive" render={({ field }) => <FormItem className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="space-y-1"><FormLabel>Activate Banner</FormLabel><FormDescription>Show this banner on the homepage.</FormDescription></div>
        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} /></FormControl>
      </FormItem>} />

      <Button type="submit" className="w-full" disabled={isSubmitting || isRoleLoading || role !== 'admin'}>
        {isSubmitting ? 'Uploading and saving…' : 'Save Banner'}
      </Button>
    </form>
  </Form>;
}
