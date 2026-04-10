# LC AIBI — Mock Vaccine Database

Mock database cho hệ thống AI BI phân tích doanh thu vaccine. Chạy trên MySQL 8.0 trong Docker.

## Dữ liệu

| Table | Mô tả | Số dòng |
|-------|-------|---------|
| `view_genie_person` | Thông tin khách hàng | 1,000 |
| `view_genie_shop` | Cửa hàng tiêm chủng (63 tỉnh thành) | 330 |
| `view_genie_vaccine_product` | Danh mục sản phẩm vaccine | 283 |
| `view_genie_vaccine_shop_target` | KPI doanh thu mục tiêu theo tháng | 8,910 |
| `view_genie_vaccine_sales_order_detail` | Chi tiết đơn hàng bán | 29,195 |
| `view_genie_vaccine_returned_order_detail` | Chi tiết đơn hàng trả lại | 2,920 |

Thời gian dữ liệu: **2024-01 → 2026-03**

## Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (hoặc Docker Engine + Docker Compose)

## Cài đặt

```bash
git clone git@github.com:nnkhoa/mock_data_vacc.git
cd mock_data_vacc
docker compose up -d
```

Docker sẽ tự động:
1. Pull image `mysql:8.0`
2. Tạo database `lc_aibi`
3. Chạy `init/01_schema.sql` → tạo schema
4. Chạy `init/02_data.sql` → load toàn bộ dữ liệu

Quá trình mất khoảng **30–60 giây**.

## Kiểm tra

```bash
# Kiểm tra container đang chạy
docker ps

# Kết nối MySQL
docker exec -it lc_aibi_mysql mysql -u aibi -paibi1234 lc_aibi

# Kiểm tra số dòng từng bảng
SELECT table_name, table_rows
FROM information_schema.tables
WHERE table_schema = 'lc_aibi';
```

## Thông tin kết nối

| Thông số | Giá trị |
|----------|---------|
| Host | `127.0.0.1` |
| Port | `3306` |
| Database | `lc_aibi` |
| User | `aibi` |
| Password | `aibi1234` |
| Root password | `root1234` |

## Nếu đã cài trước đó

Nếu đã từng chạy và muốn reset dữ liệu từ đầu:

```bash
# Xóa volume cũ và khởi động lại (init scripts chỉ chạy khi volume trống)
docker compose down -v
docker compose up -d
```

## Cấu trúc thư mục

```
.
├── docker-compose.yml       # MySQL 8.0 container config
├── init/
│   ├── 01_schema.sql        # Tạo bảng + indexes + FK constraints
│   └── 02_data.sql          # Dữ liệu mock (auto-load khi khởi động)
├── mock_data/               # Raw JSON files (dùng để tái tạo data nếu cần)
└── load_data.py             # Script load JSON → MySQL (thay thế cho 02_data.sql)
```
