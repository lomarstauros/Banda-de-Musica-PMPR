-- Check and create roles enum if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('musician', 'manager', 'admin');
    END IF;
END $$;

-- Check and create swap_status enum if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swap_status') THEN
        CREATE TYPE swap_status AS ENUM ('pending', 'approved', 'rejected');
    END IF;
END $$;

-- Create profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  re TEXT NOT NULL UNIQUE,
  rank TEXT,
  instrument TEXT,
  phone TEXT,
  role user_role DEFAULT 'musician' NOT NULL,
  active BOOLEAN DEFAULT TRUE NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create scales table
CREATE TABLE IF NOT EXISTS scales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  uniform TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id)
);

-- Create scale_confirmations table
CREATE TABLE IF NOT EXISTS scale_confirmations (
  scale_id UUID REFERENCES scales(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  confirmed BOOLEAN DEFAULT FALSE NOT NULL,
  confirmed_at TIMESTAMPTZ,
  PRIMARY KEY (scale_id, user_id)
);

-- Create notices table
CREATE TABLE IF NOT EXISTS notices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES profiles(id)
);

-- Create swaps table
CREATE TABLE IF NOT EXISTS swaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scale_id UUID REFERENCES scales(id) ON DELETE CASCADE,
  status swap_status DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE scale_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE swaps ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Profiles are viewable by everyone') THEN
        CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own profile') THEN
        CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update any profile') THEN
        CREATE POLICY "Admins can update any profile" ON profiles FOR UPDATE USING (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        );
    END IF;
END $$;

-- Scales Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Scales are viewable by everyone') THEN
        CREATE POLICY "Scales are viewable by everyone" ON scales FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Managers and Admins can manage scales') THEN
        CREATE POLICY "Managers and Admins can manage scales" ON scales FOR ALL USING (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
        );
    END IF;
END $$;

-- Scale Confirmations Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Confirmations are viewable by everyone') THEN
        CREATE POLICY "Confirmations are viewable by everyone" ON scale_confirmations FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own confirmations') THEN
        CREATE POLICY "Users can manage their own confirmations" ON scale_confirmations FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Notices Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Notices are viewable by everyone') THEN
        CREATE POLICY "Notices are viewable by everyone" ON notices FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Managers and Admins can manage notices') THEN
        CREATE POLICY "Managers and Admins can manage notices" ON notices FOR ALL USING (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
        );
    END IF;
END $$;

-- Swaps Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own swaps') THEN
        CREATE POLICY "Users can view their own swaps" ON swaps FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = receiver_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create swaps') THEN
        CREATE POLICY "Users can create swaps" ON swaps FOR INSERT WITH CHECK (auth.uid() = requester_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Receivers and Managers can update swaps') THEN
        CREATE POLICY "Receivers and Managers can update swaps" ON swaps FOR UPDATE USING (
          auth.uid() = receiver_id OR 
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
        );
    END IF;
END $$;

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, re, role, active)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    new.email,
    COALESCE(new.raw_user_meta_data->>'re', ''),
    'musician',
    TRUE
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
