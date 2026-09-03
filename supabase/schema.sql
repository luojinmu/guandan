-- 掼蛋 · Supabase 建表（在 Supabase 控制台 → SQL Editor 中执行）
-- 测试阶段：允许 anon 直连写入/读取（配合前端 VITE_SUPABASE_ANON_KEY）。
-- ⚠️ 正式上线前请收紧（改走 Edge Function / 增加鉴权），勿直接对外放开长期写入。

create table if not exists public.game_records (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  winner_team smallint not null,          -- 0=南北队, 1=东西队
  rounds smallint not null,               -- 打到过 A 用了多少副
  level_0 smallint not null,              -- 南北队最终级数
  level_1 smallint not null               -- 东西队最终级数
);

alter table public.game_records enable row level security;

-- 允许匿名读取战绩列表（仅公开列，数据不含隐私）
drop policy if exists "records_select_anon" on public.game_records;
create policy "records_select_anon"
  on public.game_records for select
  to anon
  using (true);

-- 允许匿名插入战绩（测试期便利；后续改为服务端写入后删除此策略）
drop policy if exists "records_insert_anon" on public.game_records;
create policy "records_insert_anon"
  on public.game_records for insert
  to anon
  with check (true);

create index if not exists idx_game_records_created_at
  on public.game_records (created_at desc);
