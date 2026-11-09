'use client';

import { errorToast } from '@/lib/user-notices';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useFirestore, useUser } from '@/firebase';
import { collection, doc, serverTimestamp, addDoc, updateDoc } from 'firebase/firestore';
import type { Category } from '@/lib/products';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Textarea } from '../ui/textarea';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  description: z.string().min(5, 'Description must be at least 5 characters.'),
});

type CategoryFormValues = z.infer<typeof formSchema>;

interface CategoryFormProps {
  category?: Category;
  onFinished: () => void;
}

export function CategoryForm({ category, onFinished }: CategoryFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();
  const isEditMode = !!category;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: category?.name || '',
      description: category?.description || '',
    },
    mode: 'onChange',
  });

  const onSubmit = async (data: CategoryFormValues) => {
    if (!firestore || !user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to manage categories.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && category) {
        const docRef = doc(firestore, 'categories', category.id);
        const updatedData = { ...data, updatedAt: serverTimestamp() };
        await updateDoc(docRef, updatedData);
        toast({
          title: 'Category Updated',
          description: `The category "${data.name}" has been successfully updated.`,
        });
      } else {
        const collectionRef = collection(firestore, 'categories');
        const newData = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        await addDoc(collectionRef, newData);
        toast({
          title: 'Category Added',
          description: `The category "${data.name}" has been successfully added.`,
        });
      }
      onFinished();
    } catch (error: any) {
      console.error("Category form submission error:", error);
      toast(errorToast(error, 'save'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category Name</FormLabel>
              <FormControl>
                <Input id="name" placeholder="e.g., Electronics" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea id="description" placeholder="A short description of the category." {...field} disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || !form.formState.isValid} className="w-full">
          {isSubmitting ? 'Saving...' : 'Save Category'}
        </Button>
      </form>
    </Form>
  );
}
