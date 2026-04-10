-- ============================================================
-- LC AIBI Mock Database Schema
-- MySQL 8.0 | UTF-8mb4 | Created: 2026-03-18
-- ============================================================

USE lc_aibi;

-- ── 1. view_genie_person ──────────────────────────────────────────────────────
-- Bảng chiều thông tin khách hàng (người mua & người thụ hưởng mũi tiêm)
CREATE TABLE IF NOT EXISTS view_genie_person (
    lcv_id          VARCHAR(15)  NOT NULL COMMENT 'Mã định danh người thụ hưởng (bắt đầu bằng LCV)',
    customer_id     VARCHAR(24)  NOT NULL COMMENT 'Mã định danh người mua đơn hàng (24 ký tự alphanumeric)',
    name            VARCHAR(255) NOT NULL COMMENT 'Họ và tên đầy đủ (tiếng Việt, duy nhất)',
    date_of_birth   DATE         NOT NULL COMMENT 'Ngày sinh (YYYY-MM-DD)',
    gender          TINYINT      NOT NULL COMMENT '0=Nam, 1=Nữ, 2=Khác',
    note            TEXT         NULL     COMMENT 'Ghi chú bổ sung (thường null)',
    PRIMARY KEY (customer_id),
    UNIQUE KEY uq_lcv_id (lcv_id),
    INDEX idx_dob (date_of_birth),
    INDEX idx_gender (gender)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bảng chiều thông tin khách hàng thụ hưởng người tiêm';

-- ── 2. view_genie_shop ───────────────────────────────────────────────────────
-- Bảng chiều thông tin cửa hàng tiêm chủng
CREATE TABLE IF NOT EXISTS view_genie_shop (
    shop_code       VARCHAR(5)   NOT NULL COMMENT 'Mã cửa hàng duy nhất (5 chữ số)',
    province_name   VARCHAR(100) NOT NULL COMMENT 'Tên tỉnh/thành phố (63 tỉnh thành VN)',
    district_name   VARCHAR(100) NOT NULL COMMENT 'Tên quận/huyện',
    ward_name       VARCHAR(100) NOT NULL COMMENT 'Tên phường/xã',
    address         VARCHAR(500) NOT NULL COMMENT 'Địa chỉ đầy đủ',
    area_name       VARCHAR(100) NOT NULL COMMENT 'Vùng kinh tế (7 vùng)',
    region_name     VARCHAR(20)  NOT NULL COMMENT 'Miền địa lý: Miền Bắc | Miền Trung | Miền Nam',
    PRIMARY KEY (shop_code),
    INDEX idx_province (province_name),
    INDEX idx_region (region_name),
    INDEX idx_area (area_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bảng chiều thông tin cửa hàng tiêm chủng';

-- ── 3. view_genie_vaccine_product ────────────────────────────────────────────
-- Bảng chiều danh mục sản phẩm vaccine
CREATE TABLE IF NOT EXISTS view_genie_vaccine_product (
    sku                 VARCHAR(20)  NOT NULL COMMENT 'Mã SKU sản phẩm duy nhất',
    disease_group_name  VARCHAR(255) NULL     COMMENT 'Nhóm bệnh (null với combo/dịch vụ/test)',
    product_name        VARCHAR(500) NOT NULL COMMENT 'Tên đầy đủ sản phẩm vaccine',
    PRIMARY KEY (sku),
    INDEX idx_disease_group (disease_group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bảng chiều danh mục sản phẩm vaccine';

-- ── 4. view_genie_vaccine_shop_target ────────────────────────────────────────
-- Bảng KPI doanh thu mục tiêu theo tháng/năm/cửa hàng
CREATE TABLE IF NOT EXISTS view_genie_vaccine_shop_target (
    shop_code       VARCHAR(5)  NOT NULL COMMENT 'Mã cửa hàng',
    month           TINYINT     NOT NULL COMMENT 'Tháng (1-12)',
    year            SMALLINT    NOT NULL COMMENT 'Năm (2024-2025)',
    target_sales    BIGINT      NOT NULL COMMENT 'Doanh thu mục tiêu (VND)',
    PRIMARY KEY (shop_code, month, year),
    CONSTRAINT fk_target_shop FOREIGN KEY (shop_code)
        REFERENCES view_genie_shop (shop_code) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_year_month (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bảng KPI doanh thu mục tiêu theo tháng của từng cửa hàng';

-- ── 5. view_genie_vaccine_sales_order_detail ─────────────────────────────────
-- Bảng fact chi tiết đơn hàng bán vaccine
CREATE TABLE IF NOT EXISTS view_genie_vaccine_sales_order_detail (
    attachment_code                     VARCHAR(16)  NOT NULL COMMENT 'Mã duy nhất của line item (PK)',
    customer_id                         VARCHAR(24)  NOT NULL COMMENT 'Mã người mua',
    lcv_id                              VARCHAR(15)  NOT NULL COMMENT 'Mã người thụ hưởng mũi tiêm',
    shop_code                           VARCHAR(5)   NOT NULL COMMENT 'Mã cửa hàng',
    order_code                          VARCHAR(23)  NOT NULL COMMENT 'Mã đơn hàng (23 chữ số, 1 order có thể nhiều line item)',
    sku                                 VARCHAR(20)  NOT NULL COMMENT 'Mã sản phẩm vaccine',
    package_type                        VARCHAR(3)   NOT NULL COMMENT 'Loại mua: LE (lẻ) | GOI (gói, +5%)',
    line_item_amount_after_discount     BIGINT       NOT NULL COMMENT 'Doanh thu line item sau chiết khấu (VND)',
    line_item_quantity                  TINYINT      NOT NULL COMMENT 'Số lượng mũi tiêm (1-3)',
    order_completion_date               DATE         NOT NULL COMMENT 'Ngày hoàn thành đơn hàng',
    order_creation_date                 DATE         NOT NULL COMMENT 'Ngày tạo đơn hàng',
    PRIMARY KEY (attachment_code),
    CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id)
        REFERENCES view_genie_person (customer_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_sales_shop FOREIGN KEY (shop_code)
        REFERENCES view_genie_shop (shop_code) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_sales_sku FOREIGN KEY (sku)
        REFERENCES view_genie_vaccine_product (sku) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_order_code (order_code),
    INDEX idx_shop_date (shop_code, order_completion_date),
    INDEX idx_completion_date (order_completion_date),
    INDEX idx_customer (customer_id),
    INDEX idx_lcv (lcv_id),
    CONSTRAINT chk_package_type CHECK (package_type IN ('LE', 'GOI')),
    CONSTRAINT chk_quantity CHECK (line_item_quantity BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bảng fact chi tiết đơn hàng bán vaccine';

-- ── 6. view_genie_vaccine_returned_order_detail ──────────────────────────────
-- Bảng fact chi tiết đơn hàng trả lại vaccine
CREATE TABLE IF NOT EXISTS view_genie_vaccine_returned_order_detail (
    attachment_code                         VARCHAR(16)  NOT NULL COMMENT 'FK liên kết về đơn hàng gốc',
    customer_id                             VARCHAR(24)  NOT NULL COMMENT 'Mã người mua (bắt buộc)',
    lcv_id                                  VARCHAR(15)  NULL     COMMENT 'Mã người thụ hưởng (có thể null ~1%)',
    sku                                     VARCHAR(20)  NOT NULL COMMENT 'Mã sản phẩm vaccine',
    package_type                            VARCHAR(3)   NOT NULL COMMENT 'Loại mua: LE | GOI',
    return_line_item_amount_after_discount  BIGINT       NOT NULL COMMENT 'Giá trị hoàn trả sau chiết khấu (VND)',
    return_date                             DATE         NOT NULL COMMENT 'Ngày trả hàng',
    PRIMARY KEY (attachment_code),
    CONSTRAINT fk_return_attachment FOREIGN KEY (attachment_code)
        REFERENCES view_genie_vaccine_sales_order_detail (attachment_code) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_return_customer FOREIGN KEY (customer_id)
        REFERENCES view_genie_person (customer_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_return_sku FOREIGN KEY (sku)
        REFERENCES view_genie_vaccine_product (sku) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_return_date (return_date),
    INDEX idx_return_customer (customer_id),
    CONSTRAINT chk_return_package CHECK (package_type IN ('LE', 'GOI'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bảng fact chi tiết đơn hàng trả lại vaccine';
