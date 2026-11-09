'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, collection, query, where, orderBy, limit, onSnapshot, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import type { Seller } from '@/lib/marketplace-types';
import type { OrderRecord } from '@/components/order-management';
import type { AddressBook, DeliveryAddress } from '@/lib/addresses';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener'

interface FirebaseProviderProps {
  initialized?: boolean;
  children: ReactNode;
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
}

// Internal state for user authentication
interface UserAuthState {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export type AccountRole = 'admin' | 'seller' | 'customer' | null;
type RoleState = { uid: string | null; role: AccountRole; loading: boolean; error: Error | null; seller: Seller | null };
type AccountDataState = {
  uid: string | null;
  address: DeliveryAddress | null;
  addressLoading: boolean;
  addressBook: AddressBook | null;
  addressBookLoading: boolean;
  addressBookError: Error | null;
  buyerOrders: OrderRecord[] | null;
  buyerOrdersLoading: boolean;
  buyerOrdersError: Error | null;
  buyerOrdersCursor: QueryDocumentSnapshot<DocumentData> | null;
};
const emptyAccount: AccountDataState = { uid: null, address: null, addressLoading: false, addressBook: null, addressBookLoading: false, addressBookError: null, buyerOrders: null, buyerOrdersLoading: false, buyerOrdersError: null, buyerOrdersCursor: null };
const emptyRole: RoleState = { uid: null, role: null, loading: true, error: null, seller: null };

// Combined state for the Firebase context
export interface FirebaseContextState {
  areServicesAvailable: boolean; // True if core services (app, firestore, auth instance) are provided
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null; // The Auth service instance
  // User authentication state
  user: User | null;
  isUserLoading: boolean; // True during initial auth check
  userError: Error | null; // Error from auth listener
  roleState: RoleState;
  accountData: AccountDataState;
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Return type for useUser() - specific to user auth state
export interface UserHookResult { // Renamed from UserAuthHookResult for consistency if desired, or keep as UserAuthHookResult
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  initialized = true,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [roleState, setRoleState] = useState<RoleState>(emptyRole);
  const [accountData, setAccountData] = useState<AccountDataState>(emptyAccount);
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    isUserLoading: true, // Start loading until first auth event
    userError: null,
  });

  // Effect to subscribe to Firebase auth state changes
  useEffect(() => {
    if (!initialized) return;
    if (!auth) { // If no Auth service instance, cannot determine user state
      setUserAuthState({ user: null, isUserLoading: false, userError: null });
      return;
    }

    setUserAuthState({ user: null, isUserLoading: true, userError: null }); // Reset on auth instance change

    performance.mark('treatstory:auth:start');
    let firstAuthEvent = true;
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => { // Auth state determined
        if (firstAuthEvent) { performance.mark('treatstory:auth:end'); performance.measure('TreatStory authentication', 'treatstory:auth:start', 'treatstory:auth:end'); firstAuthEvent = false; }
        setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: null });
      },
      (error) => { // Auth listener error
        console.error("FirebaseProvider: onAuthStateChanged error:", error);
        setUserAuthState({ user: null, isUserLoading: false, userError: error });
      }
    );
    return () => unsubscribe(); // Cleanup
  }, [auth, initialized]); // Depends on the auth instance


  // One pair of live role listeners per signed-in UID, shared by every route.
  // Firestore remains the authority. A denied lookup is NOT a customer role.
  useEffect(() => {
    const uid = userAuthState.user?.uid;
    if (!uid || !firestore) {
      setRoleState({ ...emptyRole, loading: !!uid });
      return;
    }
    let live = true;
    let admin: boolean | undefined;
    let seller: Seller | null | undefined;
    let adminError: Error | null = null;
    let sellerError: Error | null = null;
    const started = performance.now();
    setRoleState({ uid, role: null, loading: true, error: null, seller: null });
    const resolve = () => {
      if (!live) return;
      if (admin === true) {
        setRoleState({ uid, role: 'admin', loading: false, error: null, seller: seller ?? null });
      } else if (admin !== undefined && seller !== undefined) {
        const error = adminError ?? sellerError;
        setRoleState({ uid, role: error ? null : seller ? 'seller' : 'customer', loading: false, error, seller: seller ?? null });
      } else return;
      if (performance.getEntriesByName('TreatStory role lookup').length === 0) {
        performance.measure('TreatStory role lookup', { start: started, end: performance.now() });
      }
    };
    const stopAdmin = onSnapshot(doc(firestore, 'roles_admin', uid),
      snapshot => { admin = snapshot.exists(); adminError = null; resolve(); },
      error => { admin = false; adminError = error; resolve(); });
    const stopSeller = onSnapshot(doc(firestore, 'sellers', uid),
      snapshot => { seller = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Seller) : null; sellerError = null; resolve(); },
      error => { seller = null; sellerError = error; resolve(); });
    return () => { live = false; stopAdmin(); stopSeller(); };
  }, [firestore, userAuthState.user?.uid]);

  // Account-scoped data is live, shared between account / checkout / customer orders,
  // and immediately hidden when UID changes. Listeners are torn down at sign-out.
  useEffect(() => {
    const uid = userAuthState.user?.uid;
    if (!uid || !firestore) { setAccountData(emptyAccount); return; }
    let live = true;
    setAccountData({ ...emptyAccount, uid, addressLoading: true, addressBookLoading: true, buyerOrdersLoading: true });
    const stopAddress = onSnapshot(doc(firestore, 'customer_addresses', uid),
      snapshot => { if (live) setAccountData(v => v.uid === uid ? { ...v, address: snapshot.exists() ? snapshot.data() as DeliveryAddress : null, addressLoading: false } : v); },
      () => { if (live) setAccountData(v => v.uid === uid ? { ...v, addressLoading: false } : v); });
    const stopAddressBook = onSnapshot(doc(firestore, 'customer_address_books', uid),
      snapshot => { if (live) setAccountData(v => v.uid === uid ? {...v, addressBook: snapshot.exists() ? snapshot.data() as AddressBook : null, addressBookLoading: false, addressBookError: null} : v); },
      error => { if (live) setAccountData(v => v.uid === uid ? {...v, addressBookLoading: false, addressBookError: error} : v); });
    const start = performance.now();
    const recent = query(collection(firestore, 'seller_orders'), where('buyerUid', '==', uid), orderBy('createdAt', 'desc'), limit(20));
    const stopOrders = onSnapshot(recent,
      snapshot => {
        if (!live) return;
        setAccountData(v => v.uid === uid ? {
          ...v, buyerOrders: snapshot.docs.map(d => ({ ...d.data(), id: d.id } as OrderRecord)),
          buyerOrdersCursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
          buyerOrdersLoading: false, buyerOrdersError: null,
        } : v);
        if (performance.getEntriesByName('TreatStory buyer recent orders').length === 0) performance.measure('TreatStory buyer recent orders', { start, end: performance.now() });
      },
      error => { if (live) setAccountData(v => v.uid === uid ? { ...v, buyerOrdersLoading: false, buyerOrdersError: error } : v); });
    return () => { live = false; stopAddress(); stopAddressBook(); stopOrders(); };
  }, [firestore, userAuthState.user?.uid]);

  // Memoize the context value
  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: firebaseApp,
      firestore: firestore,
      auth: auth,
      user: userAuthState.user,
      isUserLoading: userAuthState.isUserLoading,
      userError: userAuthState.userError,
      roleState,
      accountData,
    };
  }, [firebaseApp, firestore, auth, userAuthState, roleState, accountData]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

/**
 * Hook to access core Firebase services and user authentication state.
 * Throws error if core services are not available or used outside provider.
 */
export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }

  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
};

/** Hook to access Firebase Auth instance. */
export const useAuth = (): Auth | null => {
  const { auth } = useFirebase();
  return auth;
};

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore | null => {
  const { firestore } = useFirebase();
  return firestore;
};

/** Hook to access Firebase App instance. */
export const useFirebaseApp = (): FirebaseApp | null => {
  const { firebaseApp } = useFirebase();
  return firebaseApp;
};

type MemoFirebase <T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | (MemoFirebase<T>) {
  const memoized = useMemo(factory, deps);
  
  if(typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;
  
  return memoized;
}

/**
 * Hook specifically for accessing the authenticated user's state.
 * This provides the User object, loading status, and any auth errors.
 * @returns {UserHookResult} Object with user, isUserLoading, userError.
 */
export const useUser = (): UserHookResult => { // Renamed from useAuthUser
  const { user, isUserLoading, userError } = useFirebase(); // Leverages the main hook
  return { user, isUserLoading, userError };
};

/** Shared live role and seller profile; never grants permissions by itself. */
export function useAccountRole() {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useAccountRole must be used within FirebaseProvider');
  const uid = context.user?.uid ?? null;
  const current = context.roleState.uid === uid && uid !== null;
  return {
    role: current ? context.roleState.role : null,
    seller: current ? context.roleState.seller : null,
    isRoleLoading: context.isUserLoading || (!!uid && (!current || context.roleState.loading)),
    roleError: current ? context.roleState.error : null,
  };
}

/** Shared, identity-scoped address and recent buyer orders. */
export function useAccountData() {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useAccountData must be used within FirebaseProvider');
  return context.user?.uid && context.accountData.uid === context.user.uid
    ? context.accountData
    : emptyAccount;
}
