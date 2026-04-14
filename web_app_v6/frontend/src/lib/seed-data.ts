import { BRAND_COLORS } from './colors';
import type { FeedItem, FeedItemType } from '@/components/sidebar/FeedRail';

export type HeartbeatTrend = 'up' | 'down' | 'neutral';
export type HeartbeatItem = {
  id: number;
  label: string;
  value: string;
  delta?: string;
  trend: HeartbeatTrend;
};

type RawSignal = {
  id: number;
  type: FeedItemType;
  title: string;
  desc: string;
};

const RAW_SIGNALS: RawSignal[] = [
  {
    id: 10,
    type: 'watch',
    title: 'Tỷ lệ hoàn trả Miền Nam tăng 5.6 điểm WoW',
    desc: 'So sánh tỷ lệ hoàn trả 7 ngày gần nhất vs 7 ngày trước.',
  },
  {
    id: 9,
    type: 'watch',
    title: 'Tỷ lệ hoàn trả Miền Trung tăng 7.6 điểm WoW',
    desc: 'So sánh tỷ lệ hoàn trả 7 ngày gần nhất vs 7 ngày trước.',
  },
  {
    id: 8,
    type: 'watch',
    title: 'Tỷ lệ hoàn trả Miền Bắc tăng 5.8 điểm WoW',
    desc: 'So sánh tỷ lệ hoàn trả 7 ngày gần nhất vs 7 ngày trước.',
  },
  {
    id: 7,
    type: 'positive',
    title: 'Doanh thu Miền Trung tăng 74% WoW',
    desc: 'Chênh lệch 147.7Mđ so với 7 ngày trước.',
  },
  {
    id: 6,
    type: 'positive',
    title: 'Doanh thu Miền Nam tăng 139% WoW',
    desc: 'Chênh lệch 260.9Mđ so với 7 ngày trước.',
  },
  {
    id: 5,
    type: 'positive',
    title: 'Doanh thu Miền Bắc tăng 175% WoW',
    desc: 'Chênh lệch 393.6Mđ so với 7 ngày trước.',
  },
];

const RAW_HEARTBEAT: Omit<HeartbeatItem, 'id'>[] = [
  { label: 'Doanh thu 7 ngày', value: '1.4Bđ', delta: '+131.1% WoW', trend: 'up' },
  { label: 'Tỷ lệ hoàn trả', value: '13.4%', delta: '+6.1 điểm WoW', trend: 'down' },
  { label: 'Tiến độ target MTD', value: '0%', delta: 'MTD 0đ', trend: 'neutral' },
  { label: 'Khu vực Miền Bắc', value: '+175% WoW', delta: '393.6Mđ', trend: 'up' },
  { label: 'Khu vực Miền Nam', value: '+139% WoW', delta: '260.9Mđ', trend: 'up' },
  { label: 'Khu vực Miền Trung', value: '+74% WoW', delta: '147.7Mđ', trend: 'up' },
  { label: 'Shop 93464', value: '+4234% WoW', delta: '9.9Mđ', trend: 'up' },
  { label: 'Shop 48612', value: '+3359% WoW', delta: '9.4Mđ', trend: 'up' },
];

function signalColor(type: FeedItemType) {
  const dot = type === 'critical' ? BRAND_COLORS.red : type === 'positive' ? BRAND_COLORS.pos : BRAND_COLORS.amber;
  const tagBg = type === 'critical' ? BRAND_COLORS.redBg : type === 'positive' ? BRAND_COLORS.posLight : BRAND_COLORS.amberBg;
  const tag = type === 'critical' ? 'Nghiêm trọng' : type === 'positive' ? 'Tích cực' : 'Theo dõi';
  return { dot, tagBg, tag };
}

export function buildSeedSignals(createdAt?: string): FeedItem[] {
  const ts = createdAt || new Date().toISOString();
  return RAW_SIGNALS.map((raw) => {
    const { dot, tagBg, tag } = signalColor(raw.type);
    return { ...raw, dot, tag, tagBg, time: '', createdAt: ts };
  });
}

export function buildSeedHeartbeat(): HeartbeatItem[] {
  return RAW_HEARTBEAT.map((raw, i) => ({ ...raw, id: i + 1 }));
}

export { signalColor };
