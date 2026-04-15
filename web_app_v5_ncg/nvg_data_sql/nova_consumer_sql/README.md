# Nova Consumer (NCG) — Demo Database

## Tổng quan
Database demo cho **Công ty CP Tập đoàn Nova Consumer** — mô hình 3F (Feed-Farm-Food).

- **Database:** `nova_consumer_demo`
- **Engine:** MySQL 8.0, UTF-8 (utf8mb4)
- **Thời gian data:** 18 tháng (07/2024 - 12/2025)
- **23 bảng:** 11 dimension + 8 fact + 4 metadata

### 3 mảng kinh doanh
| Mảng | Tỷ trọng DT | Margin trung bình |
|---|---|---|
| Thuốc thú y & Vaccine | ~30% | ~42% |
| Thức ăn chăn nuôi (TACN) | ~55% | ~15% |
| Trang trại chăn nuôi | ~15% | ~9% |

### Demo Scenarios (5 anomaly)
1. **S1:** TACN margin giảm 4 tháng gần nhất (15% → 11%)
2. **S2:** NM Đồng Nai utilization giảm (72% → 55%), cost/tấn tăng
3. **S3:** Giá ngô tăng 12%, Hưng Yên rẻ hơn 5% nhờ supplier nội địa
4. **S4:** So sánh utilization 3 NM, dư địa Đồng Nai lớn nhất
5. **S5:** Cross-reference tất cả → 3 đòn bẩy cải thiện margin

## Hướng dẫn populate

```bash
# 1. Khởi tạo MySQL container
docker run --name mock_database \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=nova_consumer_demo \
  -p 3306:3306 \
  -d mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci

# 2. Chờ MySQL sẵn sàng
docker exec mock_database mysqladmin ping -uroot -proot --wait=30

# 3. Populate data theo thứ tự
docker exec -i mock_database mysql -uroot -proot < nova_consumer_sql/01_ddl_schema.sql
docker exec -i mock_database mysql -uroot -proot < nova_consumer_sql/02_metadata.sql
docker exec -i mock_database mysql -uroot -proot < nova_consumer_sql/03_master_data.sql
docker exec -i mock_database mysql -uroot -proot < nova_consumer_sql/04_transaction_data.sql

# 4. Verify
docker exec -i mock_database mysql -uroot -proot < nova_consumer_sql/05_validation_queries.sql

# 5. Reset (nếu cần làm lại)
docker exec -i mock_database mysql -uroot -proot -e \
  "DROP DATABASE IF EXISTS nova_consumer_demo; CREATE DATABASE nova_consumer_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# Rồi chạy lại bước 3-4
```

## Cấu trúc file

```
nova_consumer_sql/
├── 01_ddl_schema.sql           # CREATE DATABASE, CREATE TABLE, indexes, constraints
├── 02_metadata.sql             # INSERT INTO _meta_tables, _meta_columns, _meta_kpi, _meta_glossary
├── 03_master_data.sql          # INSERT INTO dimension tables (segments, factories, products...)
├── 04_transaction_data.sql     # INSERT INTO fact tables (financials, production, sales...)
├── 05_validation_queries.sql   # SELECT queries để verify data
└── README.md                   # File này
```
