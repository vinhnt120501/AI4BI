// 1. Khai báo kiểu dữ liệu cho các biến

// 1.1. Token usage từ Gemini API
export interface TokenUsage {
    input: number;
    schema?: number;
    rules?: number;
    instruction?: number;
    memory?: number;
    question?: number;
    data?: number;
    thinking: number;
    output: number;
    total: number;
}

// 1.2. Chart config từ AI
// 46 chart types — 12 Recharts containers + 34 biến thể render riêng biệt
// LLM có thể gửi bất kỳ string nào, frontend normalizeChartType() sẽ map về type phù hợp
export type KnownChartType =
  // ─── 12 Recharts base containers ───
  | 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'composed'
  | 'radar' | 'radial_bar' | 'treemap' | 'funnel' | 'sankey' | 'sunburst'
  // ─── Bar variants ───
  | 'horizontal_bar' | 'stacked_bar' | 'grouped_bar' | 'normalized_bar'
  | 'positive_negative_bar' | 'stacked_by_sign' | 'population_pyramid'
  | 'ranged_bar' | 'timeline_bar' | 'tiny_bar' | 'multi_x_axis'
  // ─── Pie variants ───
  | 'donut' | 'half_pie' | 'two_level_pie' | 'needle_gauge' | 'gradient_pie'
  // ─── Scatter variants ───
  | 'bubble' | 'joint_line_scatter' | 'multi_scatter'
  // ─── Area variants ───
  | 'stacked_area' | 'normalized_area' | 'fill_by_value_area'
  // ─── Line variants ───
  | 'step_line' | 'sparkline' | 'vertical_line'
  // ─── Composed variants ───
  | 'vertical_composed' | 'banded_chart' | 'target_chart' | 'scatter_line'
  // ─── Other ───
  | 'waterfall' | 'gauge' | 'nested_treemap' | 'candlestick' | 'box_plot';
export type ChartType = KnownChartType | (string & {});

// Options linh hoạt — LLM tự do kết hợp để tạo bất kỳ biến thể nào từ recharts
export interface ChartOptions {
    // Layout
    layout?: 'horizontal' | 'vertical';     // vertical = horizontal bar
    stacked?: boolean;                        // stacked bar/area
    stackOffset?: 'none' | 'expand' | 'sign'; // expand = 100%, sign = stacked by sign
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
    showLegend?: boolean;                     // show/hide legend
    showGrid?: boolean;                       // show/hide cartesian grid
    connectNulls?: boolean;                   // connect null points (line/area)
    xAxisAngle?: number;                      // rotate X tick angle (deg)
    valueLabels?: boolean;                    // show value labels on bars/lines/scatter
    background?: boolean;                     // show background in bar chart
    curveType?: 'monotone' | 'step' | 'stepBefore' | 'stepAfter' | 'linear' | 'natural' | 'basis' | 'basisClosed' | 'basisOpen' | 'monotoneX' | 'monotoneY'; // line/area interpolation
    fillByValue?: boolean;                    // area fill color by positive/negative
    jointLine?: boolean;                      // connect scatter points with line
    barCategoryGap?: number | string;         // gap between bar categories
    nestedInteractive?: boolean;              // nested treemap interactive drilling
    // Series control
    maxSeries?: number;                       // tối đa số dòng/trục vẽ để tránh quá tải UI
    // Colors
    colors?: string[];                        // custom color palette for chart
    negativeColor?: string;                   // màu cho giá trị âm (waterfall, pos/neg bar)
    positiveColor?: string;                   // màu cho giá trị dương
    // Reference overlays
    referenceLines?: ReferenceLineConfig[];
    referenceAreas?: ReferenceAreaConfig[];
    referenceDots?: ReferenceDotConfig[];
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
    color?: string;
    trend?: 'up' | 'down' | 'neutral';
}

export interface StatCardsBlock {
    type: 'stat_cards';
    items?: StatCardItem[];
    cards?: StatCardItem[]; // Alternative from LLM
}

export interface SeriesConfig {
    key: string;
    renderAs: 'bar' | 'line' | 'area';
    yAxisId?: 'left' | 'right';
}

export interface ReferenceLineConfig {
    value: number;
    label?: string;
    color?: string;
    axis?: 'x' | 'y';
}

export interface ReferenceAreaConfig {
    x1?: string | number;
    x2?: string | number;
    y1?: number;
    y2?: number;
    label?: string;
    color?: string;
    opacity?: number;
}

export interface ReferenceDotConfig {
    x: string | number;
    y: number;
    label?: string;
    color?: string;
    radius?: number;
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
    options?: ChartOptions;
    series?: SeriesConfig[];
    referenceLine?: ReferenceLineConfig;
    config?: ChartBlockConfig;
    columns?: string[]; // optional, from VIS_CONFIG block
    rows?: Array<Array<string | number>>; // optional rows for block-level data
    data?: unknown; // optional specialized data (e.g. Sankey/Sunburst)
}

export interface AnalysisTableBlock {
    type: 'table';
    title: string;
    columns: TableColumn[];
    rows?: Array<Array<string | number>>; // optional rows for block-level data
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
}

export interface ProgressBlock {
    type: 'progress';
    currentStep?: number;
    statusText?: string;
    steps?: Array<{label: string, status: 'completed' | 'processing' | 'pending'}>;
}

// Table block — AI tạo bảng phân tích với tiêu đề, columns tự chọn, highlight rules
export interface TableColumn {
    key: string;          // tên cột trong data
    label?: string;       // tên hiển thị (nếu khác key)
    format?: 'number' | 'currency' | 'percent' | 'text' | 'badge';
    highlight?: 'positive_negative';  // tô màu xanh/đỏ theo giá trị +/-
    colorRule?: {         // AI-defined color rule (AI-first approach)
        type: 'threshold' | 'status' | 'positive_negative' | 'custom';
        thresholds?: Array<{ value: number; color: string; label?: string }>;
        statusMap?: Record<string, string>;  // status -> color
        defaultColor?: string;
    };
}

export interface TextBlock {
    type: 'text';
    content?: string;
    className?: string;
    color?: string;
}

export interface HeadingBlock {
    type: 'heading';
    text: string;
    level?: 'h1' | 'h2' | 'h3';
    color?: string;
}

export type Block = StatCardsBlock | ChartBlock | HeadingBlock | AnalysisTableBlock | TextBlock | ProgressBlock;

export interface LlmDebugPayload {
    stage: 'sql' | 'reply' | string;
    model?: string;
    systemPrompt?: string;
    userContent?: string;
    memoryContext?: string;
    schemaChars?: number;
}

export interface MessageEvent {
    event: string;
    detail?: string;
    atMs?: number;
    step?: number; // backend pipeline step (0-based) when available (e.g. status.step)
}

// 1.4. Kiểu dữ liệu cho tin nhắn Chat.
export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    startedAt?: number;
    sql?: string;
    thinking?: string;
    thinkingByStage?: Record<string, string>;
    tokenUsage?: TokenUsage;
    replyTokenUsage?: TokenUsage;
    columns?: string[];
    rows?: string[][];
    chartConfig?: ChartConfig;
    blocks?: Block[];
    statusText?: string;
    currentStep?: number;
    statusHistory?: string[];
    isDone?: boolean;
    llmDebugPayloads?: LlmDebugPayload[];
    followUpSuggestions?: string[];
    eventTimeline?: MessageEvent[];
}

// 2. Khai báo các thông tin hiển thị ở giao diện (front-end)
export const UI_STRINGS = {
    // Header
    APP_NAME: "AI4BI",

    // 2.1. Welcome
    WELCOME_TITLE: "What can I do for you?",

    // 2.2. Input
    INPUT_PLACEHOLDER: "Ask Anything",

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
