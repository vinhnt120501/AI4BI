# Hướng dẫn cài đặt Frontend (Next.js + Tailwind CSS)

## Yêu cầu

- **Node.js** >= 18 (khuyến nghị >= 20)
- **npm** >= 9

Kiểm tra phiên bản:

```bash
node -v
npm -v
```

Nếu chưa cài Node.js, tải tại: https://nodejs.org/

---

## Cách 1: Tạo tự động bằng lệnh (Khuyến nghị)

Chỉ cần chạy **1 lệnh duy nhất** trong thư mục cha của `frontend/`:

```bash
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*"
```

Giải thích các flag:

| Flag | Ý nghĩa |
|------|----------|
| `--typescript` | Dùng TypeScript |
| `--tailwind` | Tự động cài và cấu hình Tailwind CSS |
| `--app` | Dùng App Router (thư mục `app/`) |
| `--src-dir` | Đặt code trong `src/` |
| `--no-eslint` | Bỏ qua ESLint (thêm sau nếu cần) |
| `--import-alias "@/*"` | Alias `@/` trỏ đến `src/` |

Sau khi chạy xong, mọi thứ đã sẵn sàng:

```bash
cd frontend
npm run dev
```

---

## Cách 2: Cài thủ công từng bước

Nếu đã có thư mục `frontend/` với source code sẵn, dùng cách này:

### Bước 1: Khởi tạo project và cài dependencies

```bash
cd frontend
npm init -y
npm install next react react-dom
npm install -D typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/postcss postcss
```

### Bước 2: Cập nhật scripts trong package.json

Mở `package.json` và thay phần `"scripts"` thành:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

### Bước 3: Tạo tsconfig.json

```bash
npx tsc --init
```

Sau đó thay nội dung `tsconfig.json` bằng:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Bước 4: Tạo postcss.config.mjs

Tạo file `postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

### Bước 5: Tạo globals.css

Tạo file `src/app/globals.css`:

```css
@import "tailwindcss";
```

### Bước 6: Tạo layout.tsx

Tạo file `src/app/layout.tsx`:

```tsx
import "./globals.css";

export const metadata = {
  title: "Learning Web",
  description: "AI-powered learning platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

### Bước 7: Chạy ứng dụng

```bash
npm run dev
```

---

## Cấu trúc thư mục sau khi hoàn tất

```
frontend/
├── .gitignore
├── .next/                  ← (tự tạo khi chạy dev)
├── node_modules/           ← (tự tạo khi npm install)
├── package.json
├── package-lock.json       ← (tự tạo khi npm install)
├── postcss.config.mjs
├── tsconfig.json
└── src/
    └── app/
        ├── globals.css
        ├── layout.tsx
        └── page.tsx
```

---

## Các lệnh thường dùng

| Lệnh | Mô tả |
|-------|--------|
| `npm run dev` | Chạy server phát triển (hot reload) |
| `npm run build` | Build production |
| `npm run start` | Chạy bản production đã build |
| `npm run lint` | Kiểm tra lỗi ESLint |
