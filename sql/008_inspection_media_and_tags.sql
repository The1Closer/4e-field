-- 4E Field: inspection media, voice notes, and damage tags.

create table if not exists public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  content_type text,
  size_bytes bigint,
  capture_section text not null default 'other' check (capture_section in ('perimeter', 'roof', 'damage', 'interior', 'attic', 'other')),
  damage_cause text not null default 'none' check (damage_cause in ('none', 'hail', 'wind', 'other', 'perimeter')),
  auto_tag_source text,
  notes text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_damage_tags (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  photo_id uuid not null references public.inspection_photos(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  damage_cause text not null check (damage_cause in ('hail', 'wind', 'other', 'perimeter')),
  component_tag text not null,
  severity text not null default 'moderate' check (severity in ('minor', 'moderate', 'severe')),
  note text,
  created_at timestamptz not null default now(),
  unique (photo_id, damage_cause, component_tag)
);

create table if not exists public.inspection_voice_notes (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  photo_id uuid references public.inspection_photos(id) on delete set null,
  rep_id uuid not null references auth.users(id) on delete cascade,
  transcript text,
  audio_file_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists inspection_photos_inspection_idx
  on public.inspection_photos(inspection_id, captured_at asc);

create index if not exists inspection_damage_tags_inspection_idx
  on public.inspection_damage_tags(inspection_id, created_at asc);

create index if not exists inspection_voice_notes_inspection_idx
  on public.inspection_voice_notes(inspection_id, created_at asc);

alter table public.inspection_photos enable row level security;
alter table public.inspection_damage_tags enable row level security;
alter table public.inspection_voice_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_photos' and policyname='rep_select_own_inspection_photos'
  ) then
    create policy rep_select_own_inspection_photos on public.inspection_photos
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_photos' and policyname='rep_insert_own_inspection_photos'
  ) then
    create policy rep_insert_own_inspection_photos on public.inspection_photos
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_photos' and policyname='rep_update_own_inspection_photos'
  ) then
    create policy rep_update_own_inspection_photos on public.inspection_photos
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_damage_tags' and policyname='rep_select_own_inspection_damage_tags'
  ) then
    create policy rep_select_own_inspection_damage_tags on public.inspection_damage_tags
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_damage_tags' and policyname='rep_insert_own_inspection_damage_tags'
  ) then
    create policy rep_insert_own_inspection_damage_tags on public.inspection_damage_tags
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_voice_notes' and policyname='rep_select_own_inspection_voice_notes'
  ) then
    create policy rep_select_own_inspection_voice_notes on public.inspection_voice_notes
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_voice_notes' and policyname='rep_insert_own_inspection_voice_notes'
  ) then
    create policy rep_insert_own_inspection_voice_notes on public.inspection_voice_notes
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_photos' and policyname='manager_read_inspection_photos'
  ) then
    create policy manager_read_inspection_photos on public.inspection_photos
      for select using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_damage_tags' and policyname='manager_read_inspection_damage_tags'
  ) then
    create policy manager_read_inspection_damage_tags on public.inspection_damage_tags
      for select using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='inspection_voice_notes' and policyname='manager_read_inspection_voice_notes'
  ) then
    create policy manager_read_inspection_voice_notes on public.inspection_voice_notes
      for select using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;
end $$;

do $$
begin
  begin
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('inspection-media', 'inspection-media', false, 157286400)
    on conflict (id) do nothing;
  exception when undefined_table then null;
  end;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inspection_media_select'
  ) then
    create policy inspection_media_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'inspection-media'
        and (
          split_part(name, '/', 1) = auth.uid()::text
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inspection_media_insert'
  ) then
    create policy inspection_media_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'inspection-media'
        and (
          split_part(name, '/', 1) = auth.uid()::text
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='inspection_media_delete'
  ) then
    create policy inspection_media_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'inspection-media'
        and (
          split_part(name, '/', 1) = auth.uid()::text
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
          )
        )
      );
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.inspection_photos;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inspection_damage_tags;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inspection_voice_notes;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
