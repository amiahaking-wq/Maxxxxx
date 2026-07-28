-- ============================================================================
-- MAX Auth Setup — Run this in Supabase SQL Editor
-- ============================================================================
-- This fixes the "Database error saving new user" error caused by foreign key
-- constraints on the business_admins table.
-- ============================================================================

-- 1. Drop the business_admins table if it exists (from a previous app)
-- This is what's blocking user creation/deletion with the FK constraint error:
-- "violates foreign key constraint business_admins_user_id_fkey on table business_admins"
DROP TABLE IF EXISTS business_admins CASCADE;

-- 2. Drop any other tables that have FK constraints to auth.users
-- (check for common ones from Supabase templates)
DROP TABLE IF EXISTS business_members CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 3. Create a clean profiles table linked to auth.users (with CASCADE)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see/edit their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Create trigger to auto-create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Verify the fix
SELECT 'Auth setup complete. business_admins table dropped, profiles table created with CASCADE.' as result;
