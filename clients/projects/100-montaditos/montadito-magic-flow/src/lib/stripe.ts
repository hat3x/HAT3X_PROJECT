import { loadStripe, Stripe } from '@stripe/stripe-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;

export const getStripe = () => {
  if (!PUBLISHABLE_KEY) {
    console.error('VITE_PAYMENTS_CLIENT_TOKEN no está configurado');
    return Promise.resolve(null);
  }
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
};
