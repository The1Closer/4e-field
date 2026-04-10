-- 4E Field: Guided Inspection Workflow V2 schema updates.

-- Extend inspection photo section values for the v2 inspection flow while keeping legacy values.
alter table public.inspection_photos
  drop constraint if exists inspection_photos_capture_section_check;

alter table public.inspection_photos
  add constraint inspection_photos_capture_section_check check (
    capture_section in (
      'perimeter_photos',
      'collateral_damage',
      'roof_overview',
      'roof_damage',
      'interior_attic',
      'perimeter',
      'roof',
      'damage',
      'interior',
      'attic',
      'other'
    )
  );

-- Extend damage tag metadata for slope and optional free-text tagging.
alter table public.inspection_damage_tags
  add column if not exists slope_tag text,
  add column if not exists custom_tag text;

alter table public.inspection_damage_tags
  drop constraint if exists inspection_damage_tags_slope_tag_check;

alter table public.inspection_damage_tags
  add constraint inspection_damage_tags_slope_tag_check check (
    slope_tag is null or slope_tag in ('front', 'rear', 'left', 'right', 'other')
  );

create index if not exists inspection_damage_tags_slope_idx
  on public.inspection_damage_tags(slope_tag, created_at desc)
  where slope_tag is not null;

-- Add quantity support for component presence records.
alter table public.inspection_component_presence
  add column if not exists quantity integer;

alter table public.inspection_component_presence
  drop constraint if exists inspection_component_presence_quantity_check;

alter table public.inspection_component_presence
  add constraint inspection_component_presence_quantity_check check (
    quantity is null or quantity >= 0
  );

-- Saved rep signatures for report design/signature step.
create table if not exists public.rep_signatures (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  label text,
  file_path text not null unique,
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rep_signatures_rep_created_idx
  on public.rep_signatures(rep_id, created_at desc);

create or replace function public.rep_signatures_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rep_signatures_set_updated_at on public.rep_signatures;
create trigger rep_signatures_set_updated_at
before update on public.rep_signatures
for each row
execute function public.rep_signatures_set_updated_at();

alter table public.rep_signatures enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rep_signatures' and policyname='rep_select_own_rep_signatures'
  ) then
    create policy rep_select_own_rep_signatures on public.rep_signatures
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rep_signatures' and policyname='rep_insert_own_rep_signatures'
  ) then
    create policy rep_insert_own_rep_signatures on public.rep_signatures
      for insert with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rep_signatures' and policyname='rep_update_own_rep_signatures'
  ) then
    create policy rep_update_own_rep_signatures on public.rep_signatures
      for update using (auth.uid() = rep_id) with check (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rep_signatures' and policyname='manager_read_rep_signatures'
  ) then
    create policy manager_read_rep_signatures on public.rep_signatures
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
    values ('rep-signatures', 'rep-signatures', false, 5242880)
    on conflict (id) do nothing;
  exception when undefined_table then null;
  end;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='rep_signatures_select'
  ) then
    create policy rep_signatures_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'rep-signatures'
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
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='rep_signatures_insert'
  ) then
    create policy rep_signatures_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'rep-signatures'
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
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='rep_signatures_delete'
  ) then
    create policy rep_signatures_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'rep-signatures'
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
    alter publication supabase_realtime add table public.rep_signatures;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;
