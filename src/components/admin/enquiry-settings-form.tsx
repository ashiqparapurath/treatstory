'use client';
import { errorToast } from '@/lib/user-notices';

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
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { EnquirySettings } from '@/lib/products';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';

const formSchema = z.object({
  whatsappNumber: z.string().regex(/^[0-9]+$/, "Please enter a valid phone number with country code, without '+' or spaces."),
  prefilledText: z.string().min(10, 'The message must be at least 10 characters.'),
});

type EnquiryFormValues = z.infer<typeof formSchema>;

export function EnquirySettingsForm() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const settingsRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'settings', 'enquiry');
  }, [firestore]);

  const { data: enquirySettings, isLoading } = useDoc<EnquirySettings>(settingsRef);

  const form = useForm<EnquiryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      whatsappNumber: '',
      prefilledText: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (enquirySettings) {
      form.reset({
        whatsappNumber: enquirySettings.whatsappNumber || '',
        prefilledText: enquirySettings.prefilledText || "Hello TreatStory, I'd like to enquire about the following items:\n\n{{items}}\n\nTotal: {{total}}",
      });
    } else {
        form.reset({
            whatsappNumber: '',
            prefilledText: "Hello TreatStory, I'd like to enquire about the following items:\n\n{{items}}\n\nTotal: {{total}}",
        });
    }
  }, [enquirySettings, form]);


  const onSubmit = async (data: EnquiryFormValues) => {
    if (!firestore || !user || !settingsRef) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to manage settings.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const settingsData = { 
        ...data,
        updatedAt: serverTimestamp(),
        id: 'enquiry', // explicitly set id for "upsert"
      };

      await setDoc(settingsRef, settingsData, {merge:true});
      
      toast({
        title: 'Settings Updated',
        description: 'The enquiry settings have been successfully saved.',
      });
    } catch (error: any) {
      console.error("Enquiry settings submission error:", error);
      toast(errorToast(error, 'save'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-6">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
            </CardContent>
        </Card>
    )
  }

  return (
    <Card className="max-w-2xl">
        <CardHeader>
            <CardTitle>Enquiry Settings</CardTitle>
            <CardDescription>Legacy catalog only · Used by the cart's WhatsApp enquiry action, not seller orders.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                control={form.control}
                name="whatsappNumber"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>WhatsApp Number</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g. 919876543210" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormDescription>
                        Enter the full WhatsApp number including country code, without '+' or spaces.
                    </FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="prefilledText"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Prefilled Message</FormLabel>
                    <FormControl>
                        <Textarea placeholder="The message that will be pre-filled in WhatsApp." {...field} disabled={isSubmitting} rows={6} />
                    </FormControl>
                    <FormDescription>
                        Use <code className="bg-muted px-1 py-0.5 rounded-sm">{"{{items}}"}</code> for the list of cart items and <code className="bg-muted px-1 py-0.5 rounded-sm">{"{{total}}"}</code> for the total amount.
                    </FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <Button type="submit" disabled={isSubmitting || !form.formState.isValid} className="w-full">
                {isSubmitting ? 'Saving...' : 'Save Settings'}
                </Button>
            </form>
            </Form>
        </CardContent>
    </Card>
  );
}
