-- 4E Field: richer potential lead workspace (editable fields + documents).

alter table public.knock_potential_leads
  add column if not exists homeowner_phone text,
  add column if not exists homeowner_email text,
  add column if not exists lead_source text,
  add column if not exists lead_status text not null default 'new',
  add column if not exists best_contact_time text,
  add column if not exists follow_up_at timestamptz,
  add column if not exists additional_details text;

do $$
begin
  begin
    alter table public.knock_potential_leads
      add constraint knock_potential_leads_lead_status_check
      check (lead_status in ('new', 'contacted', 'appointment_set', 'not_interested', 'do_not_knock'));
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'manager_insert_knock_potential_leads'
  ) then
    create policy manager_insert_knock_potential_leads on public.knock_potential_leads
      for insert with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'manager_update_knock_potential_leads'
  ) then
    create policy manager_update_knock_potential_leads on public.knock_potential_leads
      for update
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_leads'
      and policyname = 'manager_delete_knock_potential_leads'
  ) then
    create policy manager_delete_knock_potential_leads on public.knock_potential_leads
      for delete
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;
end $$;

create table if not exists public.knock_potential_lead_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.knock_potential_leads(id) on delete cascade,
  rep_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  check (char_length(trim(file_name)) > 0),
  check (char_length(trim(file_path)) > 0)
);

create index if not exists knock_potential_lead_documents_lead_idx
  on public.knock_potential_lead_documents(lead_id, created_at desc);

create index if not exists knock_potential_lead_documents_rep_idx
  on public.knock_potential_lead_documents(rep_id, created_at desc);

alter table public.knock_potential_lead_documents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_lead_documents'
      and policyname = 'rep_select_own_knock_potential_lead_documents'
  ) then
    create policy rep_select_own_knock_potential_lead_documents on public.knock_potential_lead_documents
      for select using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_lead_documents'
      and policyname = 'rep_insert_own_knock_potential_lead_documents'
  ) then
    create policy rep_insert_own_knock_potential_lead_documents on public.knock_potential_lead_documents
      for insert with check (
        auth.uid() = rep_id
        and exists (
          select 1
          from public.knock_potential_leads l
          where l.id = lead_id
            and l.rep_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_lead_documents'
      and policyname = 'rep_delete_own_knock_potential_lead_documents'
  ) then
    create policy rep_delete_own_knock_potential_lead_documents on public.knock_potential_lead_documents
      for delete using (auth.uid() = rep_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_lead_documents'
      and policyname = 'manager_read_knock_potential_lead_documents'
  ) then
    create policy manager_read_knock_potential_lead_documents on public.knock_potential_lead_documents
      for select using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_lead_documents'
      and policyname = 'manager_insert_knock_potential_lead_documents'
  ) then
    create policy manager_insert_knock_potential_lead_documents on public.knock_potential_lead_documents
      for insert with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'knock_potential_lead_documents'
      and policyname = 'manager_delete_knock_potential_lead_documents'
  ) then
    create policy manager_delete_knock_potential_lead_documents on public.knock_potential_lead_documents
      for delete using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
        )
      );
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.knock_potential_lead_documents;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;

-- Bucket for lead documents in Supabase Storage.
do $$
begin
  begin
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('knock-potential-lead-documents', 'knock-potential-lead-documents', false, 52428800)
    on conflict (id) do nothing;
  exception when undefined_table then null;
  end;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'lead_docs_select'
  ) then
    create policy lead_docs_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'knock-potential-lead-documents'
        and (
          split_part(name, '/', 1) = auth.uid()::text
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
          )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'lead_docs_insert'
  ) then
    create policy lead_docs_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'knock-potential-lead-documents'
        and (
          split_part(name, '/', 1) = auth.uid()::text
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
          )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'lead_docs_delete'
  ) then
    create policy lead_docs_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'knock-potential-lead-documents'
        and (
          split_part(name, '/', 1) = auth.uid()::text
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'manager', 'sales_manager', 'production_manager', 'social_media_coordinator')
          )
        )
      );
  end if;
end $$;
