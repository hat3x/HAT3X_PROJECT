
-- Add unique QR token to customers
ALTER TABLE public.customers ADD COLUMN qr_token text UNIQUE;

-- Generate tokens for existing customers
UPDATE public.customers SET qr_token = encode(gen_random_bytes(16), 'hex') WHERE qr_token IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE public.customers ALTER COLUMN qr_token SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN qr_token SET DEFAULT encode(gen_random_bytes(16), 'hex');

-- Update the handle_new_user trigger to include qr_token generation is not needed
-- because the DEFAULT will handle it automatically
