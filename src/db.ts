/**
 * Supabase 数据层（战绩存储）。
 * 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时整体禁用，前端自动退回 localStorage。
 * 注意：测试阶段使用 anon key 直连 + RLS 策略（见 supabase/schema.sql），正式上线前应收紧权限。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseEnabled = Boolean(URL && ANON);

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled) return null;
  client ??= createClient(URL!, ANON!);
  return client;
}

/** 与前端 MatchRecord 对应的行结构 */
export interface RemoteRecordRow {
  id: number;
  created_at: string;
  winner_team: number;
  rounds: number;
  level_0: number;
  level_1: number;
}

/** 拉取最近战绩（失败返回 null，由调用方决定降级） */
export async function fetchRemoteRecords(): Promise<RemoteRecordRow[] | null> {
  const c = getSupabase();
  if (!c) return null;
  try {
    const { data, error } = await c
      .from('game_records')
      .select('id, created_at, winner_team, rounds, level_0, level_1')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data ?? []) as RemoteRecordRow[];
  } catch (e) {
    console.warn('Supabase 战绩拉取失败（继续使用本地）:', e);
    return null;
  }
}

/** 推送一场战绩（失败静默，下次仍从本地回退） */
export async function pushRemoteRecord(r: {
  winnerTeam: number;
  rounds: number;
  levels: [number, number];
}): Promise<boolean> {
  const c = getSupabase();
  if (!c) return false;
  try {
    const { error } = await c.from('game_records').insert({
      winner_team: r.winnerTeam,
      rounds: r.rounds,
      level_0: r.levels[0],
      level_1: r.levels[1],
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Supabase 战绩写入失败：', e);
    return false;
  }
}
