# Push `web_app_v5` lên GitHub (nhánh `vinhnt_ver_2`) — không push `.env`, không ghi đè nội dung có sẵn

## Mục tiêu
- Đẩy source code của thư mục `web_app_v5/` lên repo GitHub `vinhntnt120501/AI4BI`, nhánh `vinhnt_ver_2`.
- Tuyệt đối **không** push các file `.env*` (ví dụ: `frontend/.env.local`, `backend/.env`).
- Không “đè” nội dung đang có trên GitHub: **không force-push**, và chỉ **thêm** thư mục/version mới (tránh sửa/xoá file đã có trên nhánh).

## Điều kiện trước khi push
- Repo local đã có remote `origin` trỏ tới GitHub repo `AI4BI`.
- Đang đứng trên nhánh `vinhnt_ver_2`.
- Các file `.env*` phải bị ignore (kiểm tra bằng `git check-ignore`).

## Các bước thực hiện (khuyến nghị)

### 0) Đi tới thư mục repo Git (root)
Ví dụ (điều chỉnh theo máy của bạn):
```bash
cd "/Users/vinhnt120501/Documents/FPT_FDX/5. AI4BI"
```

### 1) Chuyển sang nhánh cần push và cập nhật an toàn từ remote
```bash
git checkout vinhnt_ver_2
git pull --ff-only origin vinhnt_ver_2
```
- `--ff-only` giúp chỉ fast-forward, tránh tạo merge và giảm rủi ro “đè”/xung đột.

### 2) Kiểm tra `.env*` đang bị ignore (không bị stage/commit)
Chạy trong thư mục `web_app_v4/`:
```bash
cd web_app_v4
git check-ignore -v frontend/.env.local backend/.env
```

Nếu bạn muốn chắc chắn lần nữa trước khi commit:
```bash
git ls-files | rg "(^|/)\\.env"
```
Kết quả nên rỗng (không có file `.env` nào đang được track).

### 3) Stage đúng phạm vi (chỉ `web_app_v4/`)
Nếu đang đứng trong `web_app_v4/`:
```bash
git add -A .
```

Hoặc nếu đang đứng ở repo root:
```bash
git add -A web_app_v4
```

### 4) Kiểm tra danh sách file chuẩn bị commit
```bash
git status -sb
git diff --cached --name-only
```

Kiểm tra nhanh xem có `.env` lọt vào staging không:
```bash
git diff --cached --name-only | rg "(^|/)\\.env" || true
```

### 5) Commit
```bash
git commit -m "Add web_app_v4 (without env files)"
```

### 6) Push lên GitHub (tuyệt đối không dùng `--force`)
```bash
git push origin vinhnt_ver_2
```

## Lưu ý an toàn
- Không dùng: `git push --force`, `git push -f`.
- Không commit các file `.env*`. Nếu lỡ stage, bỏ ra bằng:
  - `git restore --staged <path>`
  - và đảm bảo `.gitignore` đã ignore đúng pattern.

