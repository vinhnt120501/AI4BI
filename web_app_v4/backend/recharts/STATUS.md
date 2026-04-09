# Trạng thái “setup toàn bộ chart Recharts” trong dự án

## Đã có gì?
- `recharts` đã được cài trong `web_app_v4/frontend` qua `package.json`.
- Renderer `DynamicChart` đã map chartType → chart Recharts tương ứng.
- Prompt đã whitelist chartType để LLM chỉ chọn những chart project hỗ trợ.

## Danh sách chartType LLM có thể chọn
- `bar`, `line`, `area`, `composed`, `pie`, `scatter`, `radar`, `radial_bar`, `treemap`
- `funnel` (dùng `FunnelChart`)
- `sankey` (dùng `Sankey`)
- `sunburst` (dùng `SunburstChart`)
- `waterfall` (không phải chart-level riêng của Recharts; render bằng `BarChart` + reference line)

## Lưu ý quan trọng
- “Toàn bộ chart Recharts” không phải là tải về các file chart rời. Recharts là 1 lib, cài 1 lần là có toàn bộ component.
- Các “Examples” trên website thường là *biến thể cấu hình* (labels, brush, reference lines, stack, layout...) — không phải chartType mới.

