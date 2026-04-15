# ⚡️ Một lệnh ra luôn Link MCP

Anh không cần tìm kiếm hay ráp nối thủ công nữa. Em đã tạo một script "thông minh" tự động làm việc đó cho anh.

Anh chỉ cần mở Terminal và gõ duy nhất dòng này:

```bash
./get_mcp_link.sh
```

**Kết quả sẽ hiện ra ngay lập tức:**
Nó sẽ tự tìm Cổng (Port), tự tìm Tên Database, và tự ráp Password để in ra cái link `mysql://...` hoàn chỉnh cho anh. Anh chỉ việc Copy và Dán là xong!

---
> [!TIP]
> **Nếu lệnh trên báo lỗi "Permission denied":**
> Anh gõ `chmod +x get_mcp_link.sh` rồi chạy lại nhé!
