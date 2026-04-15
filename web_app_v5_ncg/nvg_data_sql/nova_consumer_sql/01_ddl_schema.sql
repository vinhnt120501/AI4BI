SET NAMES utf8mb4;
-- ============================================================
-- Nova Consumer (NCG) Demo Database — DDL Schema
-- Nông nghiệp & Chăn nuôi | Mô hình 3F (Feed – Farm – Food)
-- Database: nova_consumer_demo
-- Encoding: UTF-8 (utf8mb4)
-- ============================================================

CREATE DATABASE IF NOT EXISTS nova_consumer_demo
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nova_consumer_demo;

-- ============================================
-- DIMENSION TABLES
-- ============================================

CREATE TABLE business_segments (
  segment_id TINYINT PRIMARY KEY,
  segment_code VARCHAR(20) NOT NULL UNIQUE COMMENT 'Mã mảng KD: ANIMAL_HEALTH, ANIMAL_FEED, FARM',
  segment_name VARCHAR(100) NOT NULL COMMENT 'Tên mảng KD tiếng Việt',
  segment_name_en VARCHAR(100) NOT NULL COMMENT 'Tên mảng KD tiếng Anh',
  revenue_share_pct DECIMAL(5,2) COMMENT 'Tỷ trọng doanh thu ước tính (%)',
  description TEXT COMMENT 'Mô tả chi tiết mảng KD'
) COMMENT = 'Các mảng kinh doanh cốt lõi của Nova Consumer (không bao gồm FMCG)';

CREATE TABLE subsidiaries (
  subsidiary_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  subsidiary_code VARCHAR(20) NOT NULL UNIQUE,
  subsidiary_name VARCHAR(200) NOT NULL COMMENT 'Tên công ty con/liên kết',
  segment_id TINYINT NOT NULL,
  ownership_type VARCHAR(30) NOT NULL COMMENT 'Công ty con | Công ty liên kết',
  ownership_pct DECIMAL(5,2) COMMENT 'Tỷ lệ sở hữu (%)',
  established_year SMALLINT,
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id)
) COMMENT = 'Danh sách công ty con và liên kết thuộc Nova Consumer Group';

CREATE TABLE regions (
  region_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  region_code VARCHAR(20) NOT NULL UNIQUE,
  region_name VARCHAR(100) NOT NULL COMMENT 'Tên vùng/tỉnh tiếng Việt',
  region_level VARCHAR(20) NOT NULL COMMENT 'Vùng | Tỉnh/Thành',
  parent_region_id SMALLINT COMMENT 'FK tới vùng cha (NULL nếu là vùng)',
  population_million DECIMAL(5,2) COMMENT 'Dân số ước tính (triệu người)',
  livestock_density VARCHAR(20) COMMENT 'Mật độ chăn nuôi: Cao | Trung bình | Thấp',
  FOREIGN KEY (parent_region_id) REFERENCES regions(region_id)
) COMMENT = 'Hệ thống vùng miền và tỉnh thành Việt Nam — phục vụ phân tích geographic';

CREATE TABLE factories (
  factory_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  factory_code VARCHAR(20) NOT NULL UNIQUE,
  factory_name VARCHAR(200) NOT NULL COMMENT 'Tên nhà máy',
  segment_id TINYINT NOT NULL,
  subsidiary_id SMALLINT,
  region_id SMALLINT NOT NULL,
  address TEXT COMMENT 'Địa chỉ chi tiết',
  factory_type VARCHAR(30) NOT NULL COMMENT 'Thức ăn chăn nuôi | Thuốc thú y | Vaccine',
  max_capacity_tons_month DECIMAL(10,2) COMMENT 'Công suất thiết kế (tấn/tháng)',
  max_capacity_tons_year DECIMAL(12,2) COMMENT 'Công suất thiết kế (tấn/năm)',
  fixed_cost_monthly DECIMAL(15,2) COMMENT 'Chi phí cố định hàng tháng (VND) — khấu hao + nhân công cố định + overhead cố định',
  certification VARCHAR(100) COMMENT 'Tiêu chuẩn (WHO-GMP, ISO...)',
  commissioned_year SMALLINT COMMENT 'Năm đưa vào vận hành',
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id),
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(subsidiary_id),
  FOREIGN KEY (region_id) REFERENCES regions(region_id)
) COMMENT = 'Hệ thống nhà máy sản xuất TACN và thuốc thú y';

CREATE TABLE farms (
  farm_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  farm_code VARCHAR(20) NOT NULL UNIQUE,
  farm_name VARCHAR(200) NOT NULL COMMENT 'Tên trang trại',
  subsidiary_id SMALLINT,
  region_id SMALLINT NOT NULL,
  address TEXT,
  farm_type VARCHAR(20) NOT NULL COMMENT 'Heo | Gia cầm | Bò | Hỗn hợp',
  area_hectares DECIMAL(8,2) COMMENT 'Diện tích (ha)',
  max_capacity_heads INT COMMENT 'Sức chứa tối đa (con)',
  certification VARCHAR(100) COMMENT 'GLOBALG.A.P, VietGAP...',
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(subsidiary_id),
  FOREIGN KEY (region_id) REFERENCES regions(region_id)
) COMMENT = 'Hệ thống trang trại chăn nuôi';

CREATE TABLE product_categories (
  category_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  category_code VARCHAR(30) NOT NULL UNIQUE,
  category_name VARCHAR(200) NOT NULL COMMENT 'Tên danh mục tiếng Việt',
  category_name_en VARCHAR(200) COMMENT 'Tên danh mục tiếng Anh',
  segment_id TINYINT NOT NULL,
  parent_category_id SMALLINT COMMENT 'FK danh mục cha (NULL nếu level 1)',
  category_level TINYINT NOT NULL DEFAULT 1 COMMENT '1=Group, 2=Category, 3=Sub-category',
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id),
  FOREIGN KEY (parent_category_id) REFERENCES product_categories(category_id)
) COMMENT = 'Phân cấp danh mục sản phẩm: Group → Category → Sub-category';

CREATE TABLE products (
  product_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  product_code VARCHAR(30) NOT NULL UNIQUE,
  product_name VARCHAR(300) NOT NULL COMMENT 'Tên sản phẩm tiếng Việt',
  category_id SMALLINT NOT NULL,
  segment_id TINYINT NOT NULL,
  brand VARCHAR(100) COMMENT 'Thương hiệu (Anova Feed, BG Feed, Nova Feed, Anova Pharma...)',
  unit VARCHAR(20) NOT NULL COMMENT 'Đơn vị tính: kg, tấn, chai, lọ, liều',
  unit_price DECIMAL(12,2) COMMENT 'Giá bán trung bình (VND/đơn vị)',
  unit_cost DECIMAL(12,2) COMMENT 'Giá vốn trung bình (VND/đơn vị)',
  margin_pct DECIMAL(5,2) COMMENT 'Biên lợi nhuận gộp mục tiêu (%)',
  target_animal VARCHAR(20) DEFAULT 'N/A' COMMENT 'Heo | Gia cầm | Bò | Thủy sản | Đa loại | N/A',
  popularity_weight DECIMAL(5,4) DEFAULT 1.0000 COMMENT 'Pareto weight — top 20% SKU chiếm 80% DT',
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (category_id) REFERENCES product_categories(category_id),
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id),
  INDEX idx_products_segment (segment_id),
  INDEX idx_products_category (category_id)
) COMMENT = 'Danh mục SKU sản phẩm toàn tập đoàn';

CREATE TABLE raw_materials (
  material_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  material_code VARCHAR(30) NOT NULL UNIQUE,
  material_name VARCHAR(200) NOT NULL COMMENT 'Tên nguyên vật liệu tiếng Việt',
  material_name_en VARCHAR(200) COMMENT 'Tên tiếng Anh',
  material_category VARCHAR(30) NOT NULL COMMENT 'Ngũ cốc | Đạm thực vật | Phụ phẩm | Premix/Phụ gia | Dược liệu | Tá dược | Khác',
  unit VARCHAR(20) NOT NULL COMMENT 'Đơn vị: kg, tấn, lít',
  origin VARCHAR(20) NOT NULL COMMENT 'Nhập khẩu | Nội địa | Cả hai',
  cogs_share_pct DECIMAL(5,2) COMMENT 'Tỷ trọng trong tổng giá vốn TACN (%)',
  price_volatility VARCHAR(20) COMMENT 'Mức biến động giá: Cao | Trung bình | Thấp'
) COMMENT = 'Danh mục nguyên vật liệu sản xuất TACN và thuốc thú y';

CREATE TABLE suppliers (
  supplier_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  supplier_code VARCHAR(20) NOT NULL UNIQUE,
  supplier_name VARCHAR(200) NOT NULL,
  country VARCHAR(50) NOT NULL COMMENT 'Quốc gia',
  supplier_type VARCHAR(20) NOT NULL COMMENT 'NVL TACN | NVL Thuốc | Bao bì | Khác',
  region_id SMALLINT COMMENT 'Nếu nội địa — vùng nào',
  FOREIGN KEY (region_id) REFERENCES regions(region_id)
) COMMENT = 'Nhà cung cấp nguyên vật liệu';

CREATE TABLE distribution_channels (
  channel_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  channel_code VARCHAR(20) NOT NULL UNIQUE,
  channel_name VARCHAR(100) NOT NULL COMMENT 'Tên kênh phân phối',
  channel_type VARCHAR(30) NOT NULL COMMENT 'Đại lý | Trang trại lớn | Bệnh viện thú y | Xuất khẩu | Nội bộ | Online',
  segment_id TINYINT NOT NULL,
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id)
) COMMENT = 'Kênh phân phối sản phẩm';

CREATE TABLE customers (
  customer_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  customer_code VARCHAR(20) NOT NULL UNIQUE,
  customer_name VARCHAR(200) NOT NULL,
  customer_type VARCHAR(30) NOT NULL COMMENT 'Đại lý cấp 1 | Đại lý cấp 2 | Trang trại lớn | Bệnh viện thú y | Xuất khẩu | Nội bộ',
  region_id SMALLINT NOT NULL,
  channel_id SMALLINT NOT NULL,
  segment_id TINYINT NOT NULL,
  revenue_tier VARCHAR(5) COMMENT 'Phân hạng theo DT: A=Top 20%, B=Next 30%, C=Bottom 50%',
  FOREIGN KEY (region_id) REFERENCES regions(region_id),
  FOREIGN KEY (channel_id) REFERENCES distribution_channels(channel_id),
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id),
  INDEX idx_customers_region (region_id),
  INDEX idx_customers_segment (segment_id)
) COMMENT = 'Khách hàng/đại lý';

-- ============================================
-- FACT TABLES
-- ============================================

CREATE TABLE segment_financials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  segment_id TINYINT NOT NULL,
  `year_month` DATE NOT NULL COMMENT 'Ngày đầu tháng, VD: 2024-07-01',
  total_revenue DECIMAL(15,2) NOT NULL COMMENT 'Doanh thu thuần (triệu VND)',
  total_cogs DECIMAL(15,2) NOT NULL COMMENT 'Giá vốn hàng bán (triệu VND)',
  gross_profit DECIMAL(15,2) GENERATED ALWAYS AS (total_revenue - total_cogs) STORED COMMENT 'Lợi nhuận gộp (triệu VND)',
  gross_margin_pct DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN total_revenue > 0 THEN ROUND((total_revenue - total_cogs) / total_revenue * 100, 2) ELSE 0 END) STORED COMMENT 'Biên LN gộp (%)',
  operating_expense DECIMAL(15,2) COMMENT 'Chi phí hoạt động (triệu VND)',
  headcount INT COMMENT 'Số nhân sự',
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id),
  UNIQUE KEY uk_segment_month (segment_id, `year_month`),
  INDEX idx_sf_yearmonth (`year_month`)
) COMMENT = 'Báo cáo tài chính theo mảng kinh doanh, hàng tháng — đơn vị: triệu VND';

CREATE TABLE production_monthly (
  id INT PRIMARY KEY AUTO_INCREMENT,
  factory_id SMALLINT NOT NULL,
  `year_month` DATE NOT NULL COMMENT 'Ngày đầu tháng',
  actual_output_tons DECIMAL(10,2) NOT NULL COMMENT 'Sản lượng thực tế (tấn)',
  max_capacity_tons DECIMAL(10,2) NOT NULL COMMENT 'Công suất tháng đó (tấn)',
  utilization_pct DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN max_capacity_tons > 0 THEN ROUND(actual_output_tons / max_capacity_tons * 100, 2) ELSE 0 END) STORED COMMENT 'Hiệu suất sử dụng công suất (%)',
  raw_material_cost DECIMAL(15,2) NOT NULL COMMENT 'Chi phí NVL (triệu VND)',
  labor_cost DECIMAL(15,2) NOT NULL COMMENT 'Chi phí nhân công (triệu VND) — gồm cố định + biến đổi',
  depreciation DECIMAL(15,2) NOT NULL COMMENT 'Khấu hao (triệu VND)',
  overhead DECIMAL(15,2) NOT NULL COMMENT 'Chi phí sản xuất chung (triệu VND) — điện, nước, bảo trì...',
  total_production_cost DECIMAL(15,2) GENERATED ALWAYS AS (raw_material_cost + labor_cost + depreciation + overhead) STORED COMMENT 'Tổng chi phí SX (triệu VND)',
  cost_per_ton DECIMAL(10,2) GENERATED ALWAYS AS (CASE WHEN actual_output_tons > 0 THEN ROUND((raw_material_cost + labor_cost + depreciation + overhead) / actual_output_tons, 2) ELSE 0 END) STORED COMMENT 'Chi phí SX trên mỗi tấn (triệu VND/tấn)',
  waste_pct DECIMAL(5,2) COMMENT 'Tỷ lệ hao hụt NVL (%)',
  FOREIGN KEY (factory_id) REFERENCES factories(factory_id),
  UNIQUE KEY uk_factory_month (factory_id, `year_month`),
  INDEX idx_pm_yearmonth (`year_month`)
) COMMENT = 'Chi phí và sản lượng sản xuất theo nhà máy, hàng tháng — đơn vị: triệu VND';

CREATE TABLE material_purchases (
  purchase_id INT PRIMARY KEY AUTO_INCREMENT,
  factory_id SMALLINT NOT NULL,
  material_id SMALLINT NOT NULL,
  supplier_id SMALLINT NOT NULL,
  purchase_date DATE NOT NULL,
  quantity_tons DECIMAL(10,3) NOT NULL COMMENT 'Khối lượng mua (tấn)',
  unit_price DECIMAL(12,2) NOT NULL COMMENT 'Đơn giá (VND/kg)',
  total_amount DECIMAL(15,2) GENERATED ALWAYS AS (quantity_tons * 1000 * unit_price) STORED COMMENT 'Tổng giá trị (VND)',
  origin_country VARCHAR(50) COMMENT 'Xuất xứ lô hàng',
  payment_terms VARCHAR(50) COMMENT 'Điều khoản thanh toán',
  FOREIGN KEY (factory_id) REFERENCES factories(factory_id),
  FOREIGN KEY (material_id) REFERENCES raw_materials(material_id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  INDEX idx_mp_date (purchase_date),
  INDEX idx_mp_factory_material (factory_id, material_id),
  INDEX idx_mp_material_date (material_id, purchase_date)
) COMMENT = 'Lịch sử mua nguyên vật liệu — tracking giá nhập theo thời gian';

CREATE TABLE bill_of_materials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id SMALLINT NOT NULL,
  material_id SMALLINT NOT NULL,
  quantity_per_ton DECIMAL(10,4) NOT NULL COMMENT 'Lượng NVL cần trên mỗi tấn thành phẩm (kg NVL / tấn SP)',
  cost_share_pct DECIMAL(5,2) COMMENT 'Tỷ trọng chi phí NVL này trong tổng NVL của SP (%)',
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (material_id) REFERENCES raw_materials(material_id),
  UNIQUE KEY uk_product_material (product_id, material_id)
) COMMENT = 'Công thức sản phẩm — lượng NVL cần cho mỗi tấn thành phẩm TACN';

CREATE TABLE sales_transactions (
  transaction_id INT PRIMARY KEY AUTO_INCREMENT,
  sale_date DATE NOT NULL,
  segment_id TINYINT NOT NULL,
  subsidiary_id SMALLINT,
  product_id SMALLINT NOT NULL,
  customer_id SMALLINT NOT NULL,
  channel_id SMALLINT NOT NULL,
  factory_id SMALLINT COMMENT 'Nhà máy sản xuất (nếu applicable)',
  region_id SMALLINT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL COMMENT 'Số lượng bán (đơn vị theo products.unit)',
  unit_price DECIMAL(12,2) NOT NULL COMMENT 'Đơn giá bán thực tế (VND)',
  total_revenue DECIMAL(15,2) NOT NULL COMMENT 'Doanh thu (VND)',
  unit_cost DECIMAL(12,2) COMMENT 'Giá vốn đơn vị (VND)',
  total_cogs DECIMAL(15,2) COMMENT 'Giá vốn (VND)',
  discount_pct DECIMAL(5,2) DEFAULT 0 COMMENT 'Chiết khấu (%)',
  FOREIGN KEY (segment_id) REFERENCES business_segments(segment_id),
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(subsidiary_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (channel_id) REFERENCES distribution_channels(channel_id),
  FOREIGN KEY (factory_id) REFERENCES factories(factory_id),
  FOREIGN KEY (region_id) REFERENCES regions(region_id),
  INDEX idx_st_date (sale_date),
  INDEX idx_st_segment_date (segment_id, sale_date),
  INDEX idx_st_product (product_id),
  INDEX idx_st_customer (customer_id),
  INDEX idx_st_region (region_id),
  INDEX idx_st_factory (factory_id)
) COMMENT = 'Giao dịch bán hàng chi tiết — grain: 1 dòng = 1 line item';

CREATE TABLE production_orders (
  order_id INT PRIMARY KEY AUTO_INCREMENT,
  factory_id SMALLINT NOT NULL,
  product_id SMALLINT NOT NULL,
  customer_id SMALLINT COMMENT 'Khách hàng đặt (NULL nếu SX cho kho)',
  order_date DATE NOT NULL,
  required_date DATE COMMENT 'Ngày yêu cầu giao',
  completed_date DATE COMMENT 'Ngày hoàn thành thực tế',
  quantity_tons DECIMAL(10,3) NOT NULL COMMENT 'Khối lượng đặt (tấn)',
  status VARCHAR(30) NOT NULL DEFAULT 'Đã hoàn thành' COMMENT 'Đã hoàn thành | Đang sản xuất | Đã hủy',
  FOREIGN KEY (factory_id) REFERENCES factories(factory_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  INDEX idx_po_factory_date (factory_id, order_date)
) COMMENT = 'Đơn hàng sản xuất — tracking sản lượng theo khách hàng';

CREATE TABLE farm_operations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  farm_id SMALLINT NOT NULL,
  `year_month` DATE NOT NULL,
  animal_type VARCHAR(20) NOT NULL COMMENT 'Heo nái | Heo thịt | Gà | Bò sữa | Bò thịt',
  opening_stock INT NOT NULL COMMENT 'Tồn đầu kỳ (con)',
  births INT DEFAULT 0 COMMENT 'Sinh sản (con)',
  purchases INT DEFAULT 0 COMMENT 'Mua thêm (con)',
  sales INT DEFAULT 0 COMMENT 'Bán ra (con)',
  deaths INT DEFAULT 0 COMMENT 'Hao hụt/chết (con)',
  closing_stock INT NOT NULL COMMENT 'Tồn cuối kỳ (con)',
  feed_consumed_tons DECIMAL(10,2) COMMENT 'TACN tiêu thụ (tấn)',
  feed_cost DECIMAL(15,2) COMMENT 'Chi phí TACN (triệu VND)',
  vet_cost DECIMAL(15,2) COMMENT 'Chi phí thú y (triệu VND)',
  labor_cost DECIMAL(15,2) COMMENT 'Chi phí nhân công (triệu VND)',
  other_cost DECIMAL(15,2) COMMENT 'Chi phí khác (triệu VND)',
  total_cost DECIMAL(15,2) COMMENT 'Tổng chi phí (triệu VND)',
  revenue DECIMAL(15,2) COMMENT 'Doanh thu bán vật nuôi (triệu VND)',
  avg_weight_kg DECIMAL(6,2) COMMENT 'Trọng lượng bình quân khi bán (kg)',
  FOREIGN KEY (farm_id) REFERENCES farms(farm_id),
  INDEX idx_fo_farm_month (farm_id, `year_month`)
) COMMENT = 'Vận hành trang trại hàng tháng — theo dõi đàn, chi phí, doanh thu';

CREATE TABLE logistics_costs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  from_factory_id SMALLINT NOT NULL,
  to_region_id SMALLINT NOT NULL,
  cost_per_ton DECIMAL(10,2) NOT NULL COMMENT 'Chi phí vận chuyển (VND/tấn)',
  transit_days TINYINT COMMENT 'Thời gian vận chuyển (ngày)',
  distance_km INT COMMENT 'Khoảng cách (km)',
  FOREIGN KEY (from_factory_id) REFERENCES factories(factory_id),
  FOREIGN KEY (to_region_id) REFERENCES regions(region_id),
  UNIQUE KEY uk_route (from_factory_id, to_region_id)
) COMMENT = 'Chi phí logistics giữa nhà máy và vùng tiêu thụ';

-- ============================================
-- METADATA TABLES
-- ============================================

CREATE TABLE _meta_tables (
  table_name VARCHAR(100) PRIMARY KEY,
  description_vi TEXT NOT NULL,
  description_en TEXT NOT NULL,
  business_context TEXT COMMENT 'Ngữ cảnh kinh doanh, khi nào dùng bảng này',
  row_count_estimate INT COMMENT 'Số dòng ước tính'
) COMMENT = 'Metadata: mô tả từng bảng trong database';

CREATE TABLE _meta_columns (
  id INT PRIMARY KEY AUTO_INCREMENT,
  table_name VARCHAR(100) NOT NULL,
  column_name VARCHAR(100) NOT NULL,
  data_type VARCHAR(50) NOT NULL,
  description_vi TEXT NOT NULL,
  description_en TEXT,
  unit VARCHAR(30) COMMENT 'Đơn vị: triệu VND, tấn, %, đ/kg...',
  example_values TEXT COMMENT 'Ví dụ giá trị',
  UNIQUE KEY uk_table_column (table_name, column_name)
) COMMENT = 'Metadata: mô tả từng cột';

CREATE TABLE _meta_kpi (
  kpi_id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  kpi_name VARCHAR(200) NOT NULL,
  kpi_name_en VARCHAR(200),
  formula_sql TEXT NOT NULL COMMENT 'Công thức SQL tính KPI',
  description_vi TEXT NOT NULL,
  related_questions TEXT COMMENT 'Danh sách câu hỏi demo liên quan',
  source_tables TEXT COMMENT 'Các bảng nguồn'
) COMMENT = 'Metadata: định nghĩa KPI và công thức SQL';

CREATE TABLE _meta_glossary (
  id SMALLINT PRIMARY KEY AUTO_INCREMENT,
  term_vi VARCHAR(200) NOT NULL,
  term_en VARCHAR(200),
  abbreviation VARCHAR(30),
  definition TEXT NOT NULL,
  related_table VARCHAR(100),
  related_column VARCHAR(100)
) COMMENT = 'Metadata: thuật ngữ ngành Nông nghiệp & Chăn nuôi VN-EN';
