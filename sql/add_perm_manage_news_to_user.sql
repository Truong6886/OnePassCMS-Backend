-- Thêm cột perm_manage_news cho bảng User nếu chưa tồn tại
alter table if exists public."User"
  add column if not exists perm_manage_news boolean default false;