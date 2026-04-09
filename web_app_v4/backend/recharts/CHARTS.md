# Recharts — 25 Chart Types hỗ trợ trong dự án

Frontend (`DynamicChart.tsx`) hỗ trợ **25 chartType** với render riêng biệt.
LLM tự do chọn bất kỳ tên nào — `normalizeChartType()` sẽ map aliases về type phù hợp.

## 12 Base types (từ Recharts containers)

| # | chartType | Recharts Component | Mô tả |
|---|---|---|---|
| 1 | `bar` | BarChart | Bar dọc, tự color theo category nếu 1 series |
| 2 | `line` | LineChart | Line chart với dual-axis tự động |
| 3 | `area` | AreaChart | Area chart với gradient fill |
| 4 | `pie` | PieChart | Pie chart, tự gom nhỏ thành "Khác" nếu >7 slices |
| 5 | `scatter` | ScatterChart | Scatter plot |
| 6 | `composed` | ComposedChart | Mixed bar/line/area, tự detect percent fields |
| 7 | `radar` | RadarChart | Radar/spider chart |
| 8 | `radial_bar` | RadialBarChart | Radial bar 360° |
| 9 | `treemap` | Treemap | Treemap hierarchical |
| 10 | `funnel` | FunnelChart | Funnel conversion |
| 11 | `sankey` | Sankey | Sankey flow diagram |
| 12 | `sunburst` | SunburstChart | Sunburst hierarchical |

## 13 Biến thể render riêng biệt

| # | chartType | Base | Khác biệt |
|---|---|---|---|
| 13 | `horizontal_bar` | BarChart | Layout horizontal, Y = category |
| 14 | `stacked_bar` | BarChart | Stacked, stackId chung |
| 15 | `grouped_bar` | BarChart | Multi-series side-by-side |
| 16 | `normalized_bar` | BarChart | 100% stacked (stackOffset=expand) |
| 17 | `donut` | PieChart | innerRadius=55%, paddingAngle=3 |
| 18 | `half_pie` | PieChart | Semi-circle (180°→0°), cy=80% |
| 19 | `bubble` | ScatterChart | ZAxis luôn bật, range=[40,600] |
| 20 | `stacked_area` | AreaChart | Stacked với gradient |
| 21 | `normalized_area` | AreaChart | 100% stacked (stackOffset=expand) |
| 22 | `step_line` | LineChart | type="stepAfter" |
| 23 | `sparkline` | LineChart | Minimal — no axes, grid, legend |
| 24 | `waterfall` | BarChart | Cumulative bar, pos/neg coloring |
| 25 | `gauge` | RadialBarChart | Semi-circle (180°→0°), cornerRadius |

## Aliases (normalize tự động)

| Alias | → chartType |
|---|---|
| `column` | `bar` |
| `hbar`, `bar_horizontal` | `horizontal_bar` |
| `bar_stacked` | `stacked_bar` |
| `bar_grouped`, `clustered` | `grouped_bar` |
| `percent_bar`, `100_bar` | `normalized_bar` |
| `doughnut`, `ring` | `donut` |
| `semi_circle`, `semi_pie` | `half_pie` |
| `stepped` | `step_line` |
| `spark` | `sparkline` |
| `area_stacked` | `stacked_area` |
| `percent_area`, `stream`, `streamgraph` | `normalized_area` |
| `gradient_area` | `area` (+ gradient=true) |
| `mixed`, `combo`, `bar_line`, `pareto` | `composed` |
| `spider`, `polar` | `radar` |
| `meter`, `speedometer`, `circular_bar` | `gauge` |
| `heatmap`, `matrix` | `treemap` |
| `flow`, `alluvial` | `sankey` |
| `hierarchy`, `tree_chart`, `drill_down` | `sunburst` |
| `multi_line`, `dual_line`, `biaxial` | `line` (+ dualAxis=true) |
| `rose`, `nightingale` | `pie` |
| Bất kỳ string không match | `bar` (fallback) |

## Cài đặt

```bash
cd web_app_v4/frontend
npm install recharts
```

Một lệnh duy nhất — có toàn bộ 12 chart containers + tất cả sub-components (Bar, Line, Area, Brush, ReferenceLine, LabelList, Cell, ...).
