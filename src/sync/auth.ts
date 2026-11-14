/**
 * Firebase Authentication for this build: one app, one Auth instance.
 *
 * A parent has an email-and-password account whose address must be confirmed. A child's phone
 * signs in anonymously when it enters a pairing code; that account is tied to the app install.
 * Every function here rejects with a LinkError whose message is a sentence for the person using
 * the app. Nothing here touches Cloud Firestore.
 *
 * No React in this file: the provider subscribes with `onAccount` and calls the functions.
 */
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';

import { createAuth } from './authInstance';
import { AUTH_EMULATOR, isBackendConfigured } from './config';
import { firebaseApp } from './firebase';
import { LinkError, OFFLINE_MESSAGE, type Account, type LinkErrorCode } from './types';

let instance: Auth | null = null;

/** The Auth instance, created on first use. Throws a LinkError when the build has no Firebase config. */
export function auth(): Auth {
  if (instance) return instance;
  const created = createAuth(firebaseApp());
  if (AUTH_EMULATOR) {
    try {
      connectAuthEmulator(created, `http://${AUTH_EMULATOR.host}:${AUTH_EMULATOR.port}`, { disableWarnings: true });
    } catch {
      // Already connected (a fast refresh during development).
    }
  }
  instance = created;
  return created;
}

const toAccount = (user: User | null): Account | null =>
  user ? { uid: user.uid, email: user.email, emailVerified: user.emailVerified, anonymous: user.isAnonymous } : null;

const sameAccount = (a: Account | null, b: Account | null) =>
  a === b || (a !== null && b !== null && a.uid === b.uid && a.email === b.email && a.emailVerified === b.emailVerified && a.anonymous === b.anonymous);

/** The signed-in account as the SDK knows it right now. Null before the saved sign-in has been read. */
export function currentAccount(): Account | null {
  return isBackendConfigured ? toAccount(auth().currentUser) : null;
}

// ---- Errors ----------------------------------------------------------------------------------

const AUTH_ERRORS: Record<string, [LinkErrorCode, string]> = {
  'auth/invalid-credential': ['wrong-credentials', 'The email address or the password is wrong.'],
  'auth/invalid-login-credentials': ['wrong-credentials', 'The email address or the password is wrong.'],
  'auth/wrong-password': ['wrong-credentials', 'The email address or the password is wrong.'],
  'auth/user-not-found': ['wrong-credentials', 'The email address or the password is wrong.'],
  'auth/user-disabled': ['wrong-credentials', 'This account has been switched off.'],
  'auth/email-already-in-use': ['email-in-use', 'There is already an account with that email address. Sign in instead.'],
  'auth/weak-password': ['weak-password', 'That password is too short. Use at least 6 characters.'],
  'auth/missing-password': ['weak-password', 'Enter a password.'],
  'auth/invalid-email': ['invalid-email', "That doesn't look like an email address."],
  'auth/missing-email': ['invalid-email', 'Enter an email address.'],
  'auth/too-many-requests': ['too-many-attempts', 'Too many attempts. Wait a few minutes and try again.'],
  'auth/network-request-failed': ['network', OFFLINE_MESSAGE],
  'auth/timeout': ['network', OFFLINE_MESSAGE],
  'auth/operation-not-allowed': ['permission', 'This way of signing in is not switched on for this Firebase project.'],
  'auth/admin-restricted-operation': ['permission', 'This way of signing in is not switched on for this Firebase project.'],
  'auth/requires-recent-login': ['not-signed-in', 'Sign in again first, then retry.'],
  'auth/user-token-expired': ['not-signed-in', 'You were signed out. Sign in again.'],
};

/** Turns a failure of the Auth SDK into a LinkError with a plain sentence. */
export function toAuthError(e: unknown): LinkError {
  if (e instanceof LinkError) return e;
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const known = AUTH_ERRORS[code];
  if (known) return new LinkError(known[0], known[1]);
  return new LinkError('unknown', 'Something went wrong with the account. Please try again.');
}

function requireUser(): User {
  const user = auth().currentUser;
  if (!user) throw new LinkError('not-signed-in', 'Sign in first.');
  return user;
}

// ---- Watching the account ----------------------------------------------------------------------

type AccountListener = (account: Account | null) => void;

const listeners = new Set<AccountListener>();
let stopSdk: (() => void) | null = null;
let last: Account | null = null;
/** True once the SDK has reported the saved sign-in (or that there is none). */
let known = false;

function emit(account: Account | null) {
  if (known && sameAccount(last, account)) return;
  known = true;
  last = account;
  for (const listener of [...listeners]) listener(account);
}

/**
 * Calls `listener` with the account whenever it changes: sign-in, sign-out, and a confirmed email
 * address after `refreshAccount`. The first call comes once the saved sign-in has been read from
 * storage (null when there is none). Returns the function that stops listening.
 * In a build without a Firebase config the listener is called once with null.
 */
export function onAccount(listener: AccountListener): () => void {
  if (!isBackendConfigured) {
    listener(null);
    return () => {};
  }
  listeners.add(listener);
  if (known) listener(last);
  if (!stopSdk) {
    // Token changes include sign-in and sign-out, and the fresh token `refreshAccount` asks for.
    stopSdk = onIdTokenChanged(
      auth(),
      (user) => emit(toAccount(user)),
      () => emit(null),
    );
  }
  return () => {
    listeners.delete(listener);
  };
}

// ---- Parent account ------------------------------------------------------------------------------

/**
 * Creates the account and sends the confirmation email. When the account was made but the email
 * could not be sent, this rejects with a message saying so: the person is signed in and can ask
 * for the email again (`sendVerification`).
 */
export async function signUp(email: string, password: string): Promise<Account> {
  let user: User;
  try {
    user = (await createUserWithEmailAndPassword(auth(), email.trim(), password)).user;
  } catch (e) {
    throw toAuthError(e);
  }
  try {
    await sendEmailVerification(user);
  } catch (e) {
    const cause = toAuthError(e);
    throw new LinkError(cause.code === 'network' ? 'network' : 'unknown', 'Your account was created, but the confirmation email could not be sent. Ask for it again in a moment.');
  }
  return toAccount(user) as Account;
}

export async function signIn(email: string, password: string): Promise<Account> {
  try {
    const { user } = await signInWithEmailAndPassword(auth(), email.trim(), password);
    return toAccount(user) as Account;
  } catch (e) {
    throw toAuthError(e);
  }
}

/** Sends the confirmation email again. */
export async function sendVerification(): Promise<void> {
  const user = requireUser();
  if (user.isAnonymous) throw new LinkError('not-signed-in', 'Sign in with your email address first.');
  if (user.emailVerified) return;
  try {
    await sendEmailVerification(user);
  } catch (e) {
    throw toAuthError(e);
  }
}

/**
 * Reads the account again from the server and fetches a fresh token, so that a confirmed email
 * address shows up here and in what Cloud Firestore sees (`request.auth.token.email_verified`).
 * Resolves to null when nobody is signed in.
 */
export async function refreshAccount(): Promise<Account | null> {
  if (!isBackendConfigured) return null;
  const user = auth().currentUser;
  if (!user) return null;
  try {
    await user.reload();
    await user.getIdToken(true);
  } catch (e) {
    throw toAuthError(e);
  }
  const account = toAccount(auth().currentUser);
  emit(account);
  return account;
}

export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth(), email.trim());
  } catch (e) {
    const failure = toAuthError(e);
    // Do not say whether an address has an account.
    if (failure.code === 'wrong-credentials') return;
    throw failure;
  }
}

export async function signOut(): Promise<void> {
  if (!isBackendConfigured) return;
  try {
    await firebaseSignOut(auth());
  } catch (e) {
    throw toAuthError(e);
  }
}

// ---- Child devices ---------------------------------------------------------------------------------

/**
 * Makes sure somebody is signed in: the account that is there, or a new anonymous one.
 * `created` says whether this call made the anonymous account (so a failed join can remove it again).
 */
export async function ensureAnonymous(): Promise<{ account: Account; created: boolean }> {
  const existing = toAccount(auth().currentUser);
  if (existing) return { account: existing, created: false };
  try {
    const { user } = await signInAnonymously(auth());
    return { account: toAccount(user) as Account, created: true };
  } catch (e) {
    throw toAuthError(e);
  }
}

/**
 * Removes the anonymous account of this install (a child device that leaves, or a join that did
 * not go through). Does nothing for a real account. When the account cannot be deleted (no
 * connection), the device is signed out instead, so nothing stays signed in either way.
 */
export async function deleteAnonymousUser(): Promise<void> {
  if (!isBackendConfigured) return;
  const user = auth().currentUser;
  if (!user || !user.isAnonymous) return;
  try {
    await deleteUser(user);
  } catch {
    try {
      await firebaseSignOut(auth());
    } catch {
      // Nothing more can be done here.
    }
  }
}
