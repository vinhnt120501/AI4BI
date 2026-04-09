# Recharts (cài đặt) — dùng cho `web_app_v4/frontend`

> Tham khảo: Recharts Installation Guide (https://recharts.github.io/en-US/guide/installation/)

## Cài đặt dependency
Trong dự án này Recharts được dùng ở frontend (Next.js), không dùng ở backend Python.

Chạy tại thư mục `web_app_v4/frontend`:

### npm
```bash
npm install recharts
```

### yarn
```bash
yarn add recharts
```

### pnpm
```bash
pnpm add recharts
```

## Ghi chú cho dự án hiện tại
- `web_app_v4/frontend/package.json` đã khai báo `recharts` trong `dependencies`.
- `DynamicChart` là lớp renderer chung để LLM chọn chart bằng `VIS_CONFIG`.

