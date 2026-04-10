import React from 'react';

// 1. Khai báo kiểu dữ liệu cho các biến

// 1.1. Token usage từ Gemini API
export interface TokenUsage {
    input: number;
    schema: number;
    instruction: number;
    question: number;
    thinking: number;
    output: number;
    total: number;
}

// 1.2. Chart config từ AI
// Base chart types — LLM chọn base type + options để tạo vô hạn biến thể
export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'composed' | 'radar' | 'radial_bar' | 'treemap' | 'funnel' | 'waterfall';

// Options linh hoạt — LLM tự do kết hợp để tạo bất kỳ biến thể nào từ recharts
export interface ChartOptions {
    // Layout
    layout?: 'horizontal' | 'vertical';     // vertical = horizontal bar
    stacked?: boolean;                        // stacked bar/area
    stackOffset?: 'none' | 'expand';          // expand = normalized 100%
    // Axes
    dualAxis?: boolean;                       // 2 trục Y cho 2 scale khác nhau
    // Interaction
    brush?: boolean;                          // thanh kéo zoom cho time series
    // Pie/Donut
    innerRadius?: number | string;            // >0 = donut, "40%" = donut
    startAngle?: number;                      // half pie: 180
    endAngle?: number;                        // half pie: 0
    // Scatter/Bubble
    zField?: string;                          // bubble size field
    // Styling
    gradient?: boolean;                       // area gradient fill
    dashed?: boolean;                         // dashed line
    showDots?: boolean;                       // show/hide dots on line
    barRadius?: number;                       // bo tròn góc bar
    // Colors
    negativeColor?: string;                   // màu cho giá trị âm (waterfall, pos/neg bar)
    positiveColor?: string;                   // màu cho giá trị dương
}

export interface ChartConfig {
    type: ChartType;
    xKey: string;
    yKeys: string[];
    yKey?: string;
    options?: ChartOptions;
}

// 1.3. Building blocks — LLM tổ hợp các mảnh ghép này
export interface StatCardItem {
    label: string;
    value: string;
    subtitle?: string;
    color?: string;         // hex color cho value, e.g. "#2563eb"
    borderColor?: string;   // hex color cho border-top
    trendIcon?: string;     // icon tự do, e.g. "↑", "↓", "→", "🔥"
    trendLabel?: string;    // label tự do, e.g. "Tăng 12%", "+5.2%"
    trendColor?: string;    // hex color cho trend text
}

export interface DetailCardItem {
    name: string;
    metrics: Record<string, string>;
    tag?: string;
    tagColor?: string;
}

export interface StatCardsBlock {
    type: 'stat_cards';
    items: StatCardItem[];
}

export interface SeriesConfig {
    key: string;
    renderAs: 'bar' | 'line' | 'area';
    yAxisId?: 'left' | 'right';
    color?: string;             // hex color cho series này
}

export interface ReferenceLineConfig {
    value: number;
    label?: string;
    color?: string;
}

// Config cho data transform layer — AI chỉ định cách xử lý data trước khi vẽ chart
export interface ChartBlockConfig {
    x_field: string;
    y_fields: string[];
    group_by?: string;
    aggregate?: 'sum' | 'avg' | 'count';
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    limit?: number;
    color_field?: string;
}

export interface ChartBlock {
    type: 'chart';
    chartType: ChartType;
    xKey: string;
    yKeys: string[];
    yKey?: string;
    title?: string;
    purpose?: string;
    size?: 'full' | 'half';
    height?: number;
    colors?: string[];          // AI tự chọn palette hex, e.g. ["#6366f1","#10b981"]
    options?: ChartOptions;
    series?: SeriesConfig[];
    referenceLine?: ReferenceLineConfig;
    config?: ChartBlockConfig;
}

export interface DetailCardsBlock {
    type: 'detail_cards';
    items: DetailCardItem[];
}

export interface HeadingBlock {
    type: 'heading';
    text: string;
    level?: 'h2' | 'h3';
}

// Table block — AI tạo bảng phân tích với tiêu đề, columns tự chọn, highlight rules
export interface TableColumn {
    key: string;          // tên cột trong data
    label?: string;       // tên hiển thị (nếu khác key)
    format?: 'number' | 'currency' | 'percent' | 'text';
    highlight?: 'positive_negative';  // tô màu xanh/đỏ theo giá trị +/-
}

export interface AnalysisTableBlock {
    type: 'table';
    title: string;
    columns: TableColumn[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
}

export type Block = StatCardsBlock | ChartBlock | DetailCardsBlock | HeadingBlock | AnalysisTableBlock;

// 1.4. Kiểu dữ liệu cho tin nhắn Chat.
export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    thinking?: string;
    tokenUsage?: TokenUsage;
    replyTokenUsage?: TokenUsage;
    columns?: string[];
    rows?: string[][];
    chartConfig?: ChartConfig;
    blocks?: Block[];
    statusText?: string;
}

// 1.2. Kiểu dữ liệu cho mục menu trong Sidebar.
export interface MenuItem {
    icon: React.ComponentType;
    label: string;
}

// 2. Khai báo các thông tin hiển thị ở giao diện (front-end)
export const UI_STRINGS = {
    // Header
    APP_NAME: "AI4BI",

    // 2.1. Welcome
    WELCOME_TITLE: "What can I do for you?",

    // 2.2. Input
    INPUT_PLACEHOLDER: "How can I help you today?",

    // Chat
    LOADING_TEXT: "AI is thinking...",
    MOCK_AI_RESPONSE: "Đây là dữ liệu mẫu. Tôi đã nhận được tin nhắn của bạn!",

    // 2.2. Action buttons (tooltip)
    ACTION_COPY: "Sao chép",
    ACTION_LIKE: "Thích",
    ACTION_DISLIKE: "Không thích",
    ACTION_REGENERATE: "Tạo lại",
    ACTION_VOICE: "Giọng nói",

    // 2.3. Sidebar
    SIDEBAR_OPEN: "Mở thanh bên",
    SIDEBAR_CLOSE: "Đóng thanh bên",
    MENU_NEW_CHAT: "Cuộc trò chuyện mới",
    MENU_SEARCH: "Tìm kiếm",
    MENU_CHAT: "Hội thoại",

    // 2.4. Footer
    FOOTER_NOTE: "Press Enter to send • AI can make mistakes. Verify important info.",
};

// 3. Khai báo kích thước layout
export const LAYOUT = {
    SIDEBAR_COLLAPSED_WIDTH: 52,
    SIDEBAR_EXPANDED_WIDTH: 260,
    CONTENT_MAX_WIDTH: '64rem',
};
