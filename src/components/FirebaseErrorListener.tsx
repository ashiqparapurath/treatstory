"use client";
import { errorToast } from '@/lib/user-notices';
import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
export function FirebaseErrorListener() {
  const { toast } = useToast();
  useEffect(() => {
    const handleError = () => toast(errorToast({code:'permission-denied'},'save'));
    errorEmitter.on('permission-error', handleError);
    return () => errorEmitter.off('permission-error', handleError);
  }, [toast]);
  return null;
}
