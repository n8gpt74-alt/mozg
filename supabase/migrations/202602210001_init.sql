create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.telegram_profiles (
  telegram_id text primary key,
  username text,
  first_name text not null,
  last_name text,
  photo_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_telegram_id text not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists documents_owner_idx on public.documents(owner_telegram_id);
create index if not exists documents_embedding_idx
  on public.documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.current_telegram_id()
returns text
language sql
stable
as $$
  select auth.jwt() -> 'user_metadata' ->> 'telegram_id';
$$;

alter table public.telegram_profiles enable row level security;
alter table public.documents enable row level security;

create policy "profiles_select_own"
  on public.telegram_profiles
  for select
  to authenticated
  using (telegram_id = public.current_telegram_id());

create policy "profiles_insert_own"
  on public.telegram_profiles
  for insert
  to authenticated
  with check (telegram_id = public.current_telegram_id());

create policy "profiles_update_own"
  on public.telegram_profiles
  for update
  to authenticated
  using (telegram_id = public.current_telegram_id())
  with check (telegram_id = public.current_telegram_id());

create policy "documents_select_own"
  on public.documents
  for select
  to authenticated
  using (owner_telegram_id = public.current_telegram_id());

create policy "documents_insert_own"
  on public.documents
  for insert
  to authenticated
  with check (owner_telegram_id = public.current_telegram_id());

create policy "documents_update_own"
  on public.documents
  for update
  to authenticated
  using (owner_telegram_id = public.current_telegram_id())
  with check (owner_telegram_id = public.current_telegram_id());

create policy "documents_delete_own"
  on public.documents
  for delete
  to authenticated
  using (owner_telegram_id = public.current_telegram_id());

insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do nothing;

create policy "storage_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = public.current_telegram_id()
  );

create policy "storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = public.current_telegram_id()
  );

create policy "storage_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = public.current_telegram_id()
  )
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = public.current_telegram_id()
  );

create policy "storage_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = public.current_telegram_id()
  );

create or replace function public.insert_document(
  p_content text,
  p_embedding vector(1536),
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  insert into public.documents (owner_telegram_id, content, embedding, metadata)
  values (public.current_telegram_id(), p_content, p_embedding, coalesce(p_metadata, '{}'::jsonb))
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count int default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where documents.owner_telegram_id = public.current_telegram_id()
    and documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.current_telegram_id() to authenticated;
grant execute on function public.insert_document(text, vector, jsonb) to authenticated;
grant execute on function public.match_documents(vector, int, jsonb) to authenticated;
