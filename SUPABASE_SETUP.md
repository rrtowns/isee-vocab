# Supabase Setup Instructions

This document describes how to set up Supabase for cloud storage of flashcards.

## Prerequisites

1. Create a Supabase account at https://supabase.com
2. Create a new project in Supabase

## Database Schema

Run the following SQL commands in the Supabase SQL Editor to create the necessary tables:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create flashcards table
create table flashcards (
  id uuid default uuid_generate_v4() primary key,
  word text not null,
  definition text not null,
  examples text[] not null default '{}',
  synonyms text[] not null default '{}',
  difficulty text,
  image_url text,
  audio_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(word)
);

-- Create index on word for faster lookups
create index flashcards_word_idx on flashcards(word);

-- Enable Row Level Security (RLS)
alter table flashcards enable row level security;

-- Create policy to allow anyone to read flashcards (for now)
create policy "Allow public read access"
  on flashcards for select
  using (true);

-- Create policy to allow anyone to insert flashcards (for now)
create policy "Allow public insert access"
  on flashcards for insert
  with check (true);

-- Create policy to allow anyone to update flashcards (for now)
create policy "Allow public update access"
  on flashcards for update
  using (true);

-- Create policy to allow anyone to delete flashcards (for now)
create policy "Allow public delete access"
  on flashcards for delete
  using (true);

-- Optional: Create user_cards table for multi-user support (future)
-- This table would track which cards each user has saved
-- Uncomment when you're ready to add user authentication

-- create table user_cards (
--   id uuid default uuid_generate_v4() primary key,
--   user_id uuid references auth.users not null,
--   flashcard_id uuid references flashcards on delete cascade not null,
--   saved_at timestamp with time zone default timezone('utc'::text, now()) not null,
--   unique(user_id, flashcard_id)
-- );

-- create index user_cards_user_id_idx on user_cards(user_id);

-- alter table user_cards enable row level security;

-- create policy "Users can only see their own saved cards"
--   on user_cards for select
--   using (auth.uid() = user_id);

-- create policy "Users can save their own cards"
--   on user_cards for insert
--   with check (auth.uid() = user_id);

-- create policy "Users can delete their own saved cards"
--   on user_cards for delete
--   using (auth.uid() = user_id);
```

## Storage Buckets

Create two storage buckets in Supabase:

### 1. flashcard-images

1. Go to Storage in the Supabase dashboard
2. Click "New bucket"
3. Name: `flashcard-images`
4. Public bucket: ✅ Yes (check this box)
5. Click "Create bucket"

### 2. flashcard-audio

1. Go to Storage in the Supabase dashboard
2. Click "New bucket"
3. Name: `flashcard-audio`
4. Public bucket: ✅ Yes (check this box)
5. Click "Create bucket"

## Environment Variables

After creating your Supabase project, copy the following values from the Supabase dashboard:

1. Go to Project Settings → API
2. Copy your project URL and anon/public key
3. Create a `.env` file in the project root (copy from `.env.example`):

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Future Enhancements

### User Authentication

When you're ready to add user accounts:

1. Enable the `user_cards` table by uncommenting the SQL above
2. Enable Supabase Auth in the dashboard
3. Update the RLS policies on `flashcards` table to restrict access
4. Implement sign-up/sign-in flows in the app
5. Update the app to use the `user_cards` table for tracking saved cards

### Current Architecture

- **Single user mode**: All flashcards are publicly accessible
- Anyone can create, read, update, and delete flashcards
- Perfect for personal use or prototyping
- No authentication required

### Multi-user Architecture (Future)

- **Multi-user mode**: Each user has their own collection
- The `flashcards` table stores all unique vocabulary words
- The `user_cards` table tracks which words each user has saved
- Users can only see/modify their own saved cards
- Requires Supabase Auth integration
