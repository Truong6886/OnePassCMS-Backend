-- Ensure DichVu table has full columns required by CMS service management.
alter table if exists public."DichVu"
  add column if not exists "TenDichVu" text,
  add column if not exists "MaDichVu" text,
  add column if not exists "GhiChu" text,
  add column if not exists "NgayTao" timestamptz default now(),
  add column if not exists "NgayCapNhat" timestamptz default now(),
  add column if not exists "NguoiCapNhat" text;

-- Backfill null values for safer API operations.
update public."DichVu"
set
  "TenDichVu" = coalesce(nullif(trim("TenDichVu"), ''), '-'),
  "MaDichVu" = coalesce(nullif(trim("MaDichVu"), ''), concat('AUTO-', "DichVuID"::text)),
  "GhiChu" = coalesce("GhiChu", ''),
  "NgayTao" = coalesce("NgayTao", now()),
  "NgayCapNhat" = coalesce("NgayCapNhat", now()),
  "NguoiCapNhat" = coalesce(nullif(trim("NguoiCapNhat"), ''), 'System');

-- Optional constraints/indexes for consistency and performance.
-- IMPORTANT: DichVu needs many rows per LoaiDichVu and per TenDichVu in some cases,
-- so remove accidental unique constraints that block synchronization.
alter table if exists public."DichVu"
  drop constraint if exists "DichVu_LoaiDichVu_key",
  drop constraint if exists "DichVu_TenDichVu_key";

drop index if exists public."DichVu_LoaiDichVu_key";
drop index if exists public."DichVu_TenDichVu_key";

create unique index if not exists "DichVu_MaDichVu_key"
  on public."DichVu"("MaDichVu");

create index if not exists "DichVu_LoaiDichVu_idx"
  on public."DichVu"("LoaiDichVu");

create index if not exists "DichVu_TenDichVu_idx"
  on public."DichVu"("TenDichVu");

-- Keep NgayCapNhat updated automatically.
create or replace function public.set_dichvu_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."NgayCapNhat" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_dichvu_updated_at on public."DichVu";
create trigger trg_set_dichvu_updated_at
before update on public."DichVu"
for each row
execute function public.set_dichvu_updated_at();
