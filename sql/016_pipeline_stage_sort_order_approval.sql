-- 4E Field: insurance approval mapping by pipeline stage sort order.

create or replace view public.pipeline_stage_approval_threshold as
select
  ps.id as approved_stage_id,
  ps.name as approved_stage_name,
  ps.sort_order as approved_sort_order
from public.pipeline_stages ps
where lower(ps.name) = 'approved'
order by ps.sort_order asc
limit 1;

create or replace function public.is_stage_approved(stage_id_input integer)
returns boolean
language sql
stable
as $$
  with approved as (
    select approved_sort_order
    from public.pipeline_stage_approval_threshold
    limit 1
  )
  select coalesce((
    select (ps.sort_order >= approved.approved_sort_order)
    from public.pipeline_stages ps
    cross join approved
    where ps.id = stage_id_input
  ), false)
$$;

-- Overload for environments where jobs.stage_id is bigint.
create or replace function public.is_stage_approved(stage_id_input bigint)
returns boolean
language sql
stable
as $$
  select public.is_stage_approved(stage_id_input::integer)
$$;

create or replace view public.job_stage_approval_flags as
select
  j.id as job_id,
  j.stage_id,
  ps.name as stage_name,
  ps.sort_order,
  public.is_stage_approved(j.stage_id::bigint) as is_insurance_approved
from public.jobs j
left join public.pipeline_stages ps on ps.id = j.stage_id;
