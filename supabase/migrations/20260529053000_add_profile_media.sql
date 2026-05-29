-- Profile avatar/banner customization
alter table public.profiles
  add column if not exists banner_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read access for profile images.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Profile media is publicly readable'
  ) then
    create policy "Profile media is publicly readable"
      on storage.objects for select
      using (bucket_id = 'profile-media');
  end if;
end $$;

-- Users can upload media only into their own folder: profile-media/{user_id}/...
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own profile media'
  ) then
    create policy "Users can upload own profile media"
      on storage.objects for insert
      with check (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own profile media'
  ) then
    create policy "Users can update own profile media"
      on storage.objects for update
      using (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      )
      with check (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own profile media'
  ) then
    create policy "Users can delete own profile media"
      on storage.objects for delete
      using (
        bucket_id = 'profile-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;
