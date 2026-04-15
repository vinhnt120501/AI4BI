#!/bin/bash
# Script tự động tìm thông tin và tạo link kết nối MCP

CONTAINER="mcp_mysql_db"
PASS="secretpassword"

# 1. Lấy cổng từ Docker
PORT=$(docker port $CONTAINER 3306 | cut -d':' -f2 | head -n 1)
if [ -z "$PORT" ]; then PORT="3306"; fi

# 2. Lấy tên database (tìm cái tên nào bắt đầu bằng 'nova')
DB=$(docker exec $CONTAINER mysql -u root -p$PASS -e "SHOW DATABASES LIKE 'nova%';" -sN 2>/dev/null)
if [ -z "$DB" ]; then DB="nova_consumer_demo"; fi

# 3. Xuất kết quả
echo "--------------------------------------------------------"
echo "LINK MCP CỦA ANH ĐÂY:"
echo "mysql://root:$PASS@127.0.0.1:$PORT/$DB"
echo "--------------------------------------------------------"
