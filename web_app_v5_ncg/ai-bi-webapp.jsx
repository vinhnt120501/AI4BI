import { useState, useRef, useEffect, useCallback } from "react";

const C = { brand: "#19226D", brandLight: "#E8EAF5", red: "#E24B4A", redBg: "#FCEBEB", amber: "#EF9F27", amberBg: "#FAEEDA", pos: "#1D9E75", posLight: "#E1F5EE", blue: "#185FA5", blueBg: "#E6F1FB" };

const kpis = [
  { l: "MRR", v: "56 tỷ", c: "+8.2%", cc: C.pos },
  { l: "Người dùng", v: "12.8K", c: "+3.1%", cc: C.pos },
  { l: "NPS", v: "72", c: "ổn định", cc: "var(--color-text-secondary)" },
  { l: "Chi phí VH", v: "8.8 tỷ", c: "+5%", cc: C.red },
];

const Dot = ({ color, size = 8 }) => <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }} />;

const Bar = ({ name, w, color, val }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }}>
    <span style={{ fontSize: 13, color: "var(--color-text-primary)", width: 72, textAlign: "right", flexShrink: 0 }}>{name}</span>
    <div style={{ flex: 1, height: 18, background: "var(--color-background-tertiary)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", right: 0, top: 0, width: `${w}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
    <span style={{ fontSize: 13, color, fontWeight: 600, width: 40, flexShrink: 0 }}>{val}</span>
  </div>
);

function HoverCard({ children, style: s }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...s, background: h ? "var(--color-background-secondary)" : (s?.background || "transparent"), transition: "background 0.1s" }}>
      {children}
    </div>
  );
}

/* =================== UNIFIED FEED =================== */
const feed = [
  { id: 1, type: "critical", dot: C.red, tag: "Nghiêm trọng", tagBg: C.redBg, title: "Doanh thu miền Nam -18% WoW", desc: "3 tài khoản lớn trì hoãn gia hạn. Phá vỡ xu hướng tăng 6 tháng.", time: "12 phút trước" },
  { id: 2, type: "watch", dot: C.amber, tag: "Theo dõi", tagBg: C.amberBg, title: "CAC đạt 3.2tr, vượt 12%", desc: "CPC quảng cáo tìm kiếm tăng mạnh. Kênh organic vẫn hiệu quả.", time: "1 giờ trước" },
  { id: 3, type: "positive", dot: C.pos, tag: "Tích cực", tagBg: C.posLight, title: "Pipeline DN +34% MoM", desc: "Cao nhất từ trước đến nay. Tương quan với chương trình đối tác.", time: "2 giờ trước" },
  { id: 4, type: "insight", dot: C.brand, tag: "Insight", tagBg: C.brandLight, title: "Vì sao deal doanh nghiệp tăng tốc", desc: "Phân tích tự động: chương trình đối tác mới tạo hiệu ứng multiplier trên pipeline. Kèm dự báo Q2.", time: "2 giờ trước" },
  { id: 5, type: "watch", dot: C.amber, tag: "Theo dõi", tagBg: C.amberBg, title: "Churn risk: 12 tài khoản mid-market", desc: "Mô hình dự đoán phát hiện giảm tương tác 30 ngày qua.", time: "3 giờ trước" },
  { id: 6, type: "insight", dot: C.brand, tag: "Insight", tagBg: C.brandLight, title: "Hiệu quả marketing Q1", desc: "Chi phí vs. kết quả tất cả kênh. Organic vượt trội paid gấp 3 lần.", time: "Hôm qua" },
  { id: 7, type: "insight", dot: C.brand, tag: "Insight", tagBg: C.brandLight, title: "Phân bổ doanh thu theo sản phẩm", desc: "Sản phẩm A chiếm 62% MRR nhưng tăng trưởng chậm. Sản phẩm B tăng 40% MoM.", time: "Hôm qua" },
];

function FeedRail({ onSelect, activeId }) {
  const [filter, setFilter] = useState("all");
  const filters = [
    { id: "all", label: "Tất cả" },
    { id: "alert", label: "Cảnh báo" },
    { id: "insight", label: "Insight" },
  ];
  const filtered = filter === "all" ? feed
    : filter === "alert" ? feed.filter(f => f.type !== "insight")
    : feed.filter(f => f.type === "insight");

  return (
    <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--color-border-tertiary)", display: "flex", flexDirection: "column", background: "var(--color-background-primary)" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px" }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 12px" }}>Hôm nay</p>
        <div style={{ display: "flex", gap: 6 }}>
          {filters.map(f => (
            <div key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500,
                background: filter === f.id ? C.brand : "var(--color-background-secondary)",
                color: filter === f.id ? "#fff" : "var(--color-text-secondary)",
                border: filter === f.id ? "none" : "1px solid var(--color-border-tertiary)",
                transition: "all 0.15s",
              }}>
              {f.label}
              {f.id === "alert" && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>3</span>}
              {f.id === "insight" && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>3</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
        {filtered.map(item => {
          const on = activeId === item.id;
          const isInsight = item.type === "insight";
          return (
            <div key={item.id} onClick={() => onSelect(item)}
              style={{
                padding: "12px", borderRadius: 12, marginBottom: 4, cursor: "pointer",
                background: on ? C.brandLight : "transparent",
                borderLeft: on ? `3px solid ${C.brand}` : "3px solid transparent",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--color-background-secondary)"; }}
              onMouseLeave={e => { if (!on) e.currentTarget.style.background = on ? C.brandLight : "transparent"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {isInsight ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                  </svg>
                ) : (
                  <Dot color={item.dot} size={8} />
                )}
                <span style={{ fontSize: 10, fontWeight: 600, color: isInsight ? C.brand : item.dot, background: item.tagBg, padding: "2px 7px", borderRadius: 6 }}>{item.tag}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-secondary)", marginLeft: "auto" }}>{item.time}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 3px", lineHeight: 1.4 }}>{item.title}</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.desc}</p>
            </div>
          );
        })}
      </div>

      {/* KPIs */}
      <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: "12px 16px" }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 10px" }}>Nhịp đập</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ padding: "6px 0" }}>
              <p style={{ fontSize: 10, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>{k.l}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>{k.v}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: k.cc }}>{k.c}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User */}
      <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 10, color: C.blue }}>MT</div>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Minh T.</span>
      </div>
    </div>
  );
}

/* =================== BLOCK: ANALYSIS =================== */
function AnalysisBlock({ query, onDismiss, onFollowUp }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-secondary)", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.brand, background: C.brandLight, padding: "3px 10px", borderRadius: 8 }}>Phân tích</span>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{query}</p>
        </div>
        <div onClick={onDismiss} style={{ cursor: "pointer", padding: 4, borderRadius: 6, display: "flex" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </div>
      </div>
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--color-border-tertiary)" }}>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 10px", fontWeight: 500 }}>Doanh thu miền Nam theo tài khoản (WoW)</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <Bar name="Vinamilk" w={65} color={C.red} val="-32%" />
              <Bar name="PNJ" w={45} color={C.red} val="-24%" />
              <Bar name="MWG" w={38} color={C.amber} val="-15%" />
              <Bar name="Còn lại" w={12} color={C.pos} val="+2%" />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: C.redBg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.red}22`, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.red }}>Nguyên nhân gốc</span>
              </div>
              <p style={{ fontSize: 13, color: "#791F1F", lineHeight: 1.55, margin: 0 }}>Cả 3 tài khoản có hợp đồng hết hạn tháng 3. Vinamilk thử nghiệm đối thủ, PNJ xin gia hạn ngân sách, MWG tái cấu trúc nội bộ.</p>
            </div>
            <div style={{ background: C.posLight, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.pos}22` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.pos} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#085041" }}>Hành động đề xuất</span>
              </div>
              {["Lên lịch gọi Vinamilk trong tuần", "Gói ưu đãi giữ chân PNJ", "MWG vào pipeline Q2"].map((a, j) => (
                <p key={j} style={{ fontSize: 13, color: "#04342C", lineHeight: 1.45, margin: "0 0 2px" }}>{j + 1}. {a}</p>
              ))}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.6, margin: "0 0 14px" }}>
          <strong>Có thể phục hồi nhưng cần hành động nhanh.</strong> Vinamilk rủi ro cao nhất — nếu không tái tiếp cận trước 15/4, khả năng win-back giảm còn ~20%.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Drill down Vinamilk", "Mô phỏng mất 3 tài khoản", "So sánh với khu vực khác", "Xuất báo cáo"].map((p, j) => (
            <div key={j} onClick={() => onFollowUp(p)}
              style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-secondary)", borderRadius: 20, padding: "7px 14px", fontSize: 12, color: "var(--color-text-primary)", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-tertiary)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-secondary)"}>
              {p} <span style={{ color: "var(--color-text-secondary)", marginLeft: 4 }}>↗</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =================== BLOCK: SIMULATION =================== */
function SimulationBlock({ query, onDismiss, onFollowUp }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-secondary)", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberBg, padding: "3px 10px", borderRadius: 8 }}>Mô phỏng</span>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{query}</p>
        </div>
        <div onClick={onDismiss} style={{ cursor: "pointer", padding: 4, borderRadius: 6, display: "flex" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </div>
      </div>
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { l: "Doanh thu ảnh hưởng", v: "-4.2 tỷ", sub: "Giảm 7.5% MRR", c: C.red },
            { l: "Pipeline bù đắp", v: "+1.8 tỷ", sub: "Từ enterprise deals", c: C.pos },
            { l: "Net impact", v: "-2.4 tỷ", sub: "Cần 8 tuần phục hồi", c: C.amber },
          ].map((m, i) => (
            <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--color-border-tertiary)" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 6px" }}>{m.l}</p>
              <p style={{ fontSize: 22, fontWeight: 600, color: m.c, margin: "0 0 2px" }}>{m.v}</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{m.sub}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.6, margin: "0 0 14px" }}>
          Mất 3 tài khoản sẽ <strong>kéo MRR xuống 51.8 tỷ</strong>, nhưng pipeline enterprise đang mạnh có thể bù ~43%. Kịch bản xấu nhất: mất thêm 2 tài khoản do domino — xác suất 15%.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Điều chỉnh tham số", "So sánh 3 kịch bản", "Xuất báo cáo"].map((p, j) => (
            <div key={j} onClick={() => onFollowUp(p)}
              style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-secondary)", borderRadius: 20, padding: "7px 14px", fontSize: 12, color: "var(--color-text-primary)", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-tertiary)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-secondary)"}>
              {p} <span style={{ color: "var(--color-text-secondary)", marginLeft: 4 }}>↗</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =================== BLOCK: LOADING =================== */
function LoadingBlock({ query, onDismiss }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-secondary)", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.brand, background: C.brandLight, padding: "3px 10px", borderRadius: 8 }}>Đang xử lý</span>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{query}</p>
        </div>
        <div onClick={onDismiss} style={{ cursor: "pointer", padding: 4, borderRadius: 6, display: "flex" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </div>
      </div>
      <div style={{ padding: "32px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 20, height: 20, border: `2px solid ${C.brand}`, borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 10px", animation: "spin 0.8s linear infinite" }} />
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Đang phân tích dữ liệu...</p>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* =================== WELCOME =================== */
function WelcomeState({ onSuggest, onSubmit }) {
  const suggests = ["Tại sao miền Nam giảm?", "So sánh khu vực Q1", "Mô phỏng cắt budget marketing", "Dự báo MRR Q2"];
  const [val, setVal] = useState("");
  const [focused, setFocused] = useState(false);
  const submit = () => { if (val.trim()) { onSubmit(val); setVal(""); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "0 40px 40px", textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: C.brandLight, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.brand} strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
      </div>
      <p style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Sẵn sàng phân tích</p>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 24px", maxWidth: 420, lineHeight: 1.6 }}>
        Chọn tín hiệu từ bên trái, hoặc bắt đầu với một gợi ý bên dưới.
      </p>

      {/* Suggestions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
        {suggests.map((s, i) => (
          <div key={i} onClick={() => onSuggest(s)}
            style={{ fontSize: 13, color: "var(--color-text-primary)", background: "var(--color-background-primary)", border: "1px solid var(--color-border-secondary)", padding: "8px 16px", borderRadius: 20, cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-primary)"}>
            {s} <span style={{ color: "var(--color-text-secondary)", marginLeft: 4 }}>↗</span>
          </div>
        ))}
      </div>

      {/* Command bar */}
      <div style={{
        width: "100%", maxWidth: 640,
        background: "var(--color-background-primary)",
        borderRadius: 16, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
        border: focused ? `1.5px solid ${C.brand}` : "1px solid var(--color-border-secondary)",
        boxShadow: focused ? `0 0 0 3px ${C.brand}15, 0 4px 16px rgba(0,0,0,0.08)` : "0 2px 8px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
        transition: "all 0.15s",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={focused ? C.brand : "var(--color-text-secondary)"} strokeWidth="2" style={{ flexShrink: 0, transition: "stroke 0.15s" }}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <input value={val} onChange={e => setVal(e.target.value)}
          placeholder="Vấn đề cần phân tích..."
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, color: "var(--color-text-primary)", width: "100%", fontFamily: "inherit" }} />
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-background-tertiary)", padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-mono)", flexShrink: 0 }}>⌘K</span>
      </div>
    </div>
  );
}

/* =================== TOP BAR (minimal) =================== */
function TopBar() {
  return (
    <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--color-background-primary)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>FPT BI</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>14 nguồn — 2 phút trước</span>
        <div style={{ position: "relative", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          <div style={{ position: "absolute", top: 0, right: 0, width: 7, height: 7, borderRadius: "50%", background: C.red, border: "2px solid var(--color-background-primary)" }} />
        </div>
      </div>
    </div>
  );
}

/* =================== CANVAS INPUT (sticky when blocks exist) =================== */
function CanvasInput({ onSubmit }) {
  const [val, setVal] = useState("");
  const [focused, setFocused] = useState(false);
  const submit = () => { if (val.trim()) { onSubmit(val); setVal(""); } };
  return (
    <div style={{
      display: "flex", justifyContent: "center",
      position: "sticky", top: 0, zIndex: 10,
      paddingBottom: 4,
      background: "linear-gradient(var(--color-background-tertiary) 80%, transparent)",
    }}>
      <div style={{
        width: "100%", maxWidth: 640,
        background: "var(--color-background-primary)",
        borderRadius: 16, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
        border: focused ? `1.5px solid ${C.brand}` : "1px solid var(--color-border-secondary)",
        boxShadow: focused ? `0 0 0 3px ${C.brand}15, 0 4px 16px rgba(0,0,0,0.08)` : "0 2px 8px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
        transition: "all 0.15s",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={focused ? C.brand : "var(--color-text-secondary)"} strokeWidth="2" style={{ flexShrink: 0, transition: "stroke 0.15s" }}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <input value={val} onChange={e => setVal(e.target.value)}
          placeholder="Vấn đề cần phân tích..."
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, color: "var(--color-text-primary)", width: "100%", fontFamily: "inherit" }} />
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-background-tertiary)", padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-mono)", flexShrink: 0 }}>⌘K</span>
      </div>
    </div>
  );
}

/* =================== APP =================== */
export default function App() {
  const [blocks, setBlocks] = useState([]);
  const [activeSignal, setActiveSignal] = useState(null);
  const canvasRef = useRef(null);
  const idRef = useRef(0);

  const addBlock = useCallback((query, type = "analysis") => {
    const id = ++idRef.current;
    setBlocks(prev => [{ id, query, type }, ...prev]);
    setTimeout(() => canvasRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }, []);

  const removeBlock = useCallback((id) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  }, []);

  const handleSignal = (signal) => {
    setActiveSignal(signal.id);
    addBlock(signal.title, "analysis");
  };

  const handleCommand = (query) => {
    const lower = query.toLowerCase();
    if (lower.includes("mô phỏng") || lower.includes("nếu") || lower.includes("simulate") || lower.includes("kịch bản")) {
      addBlock(query, "simulation");
    } else if (lower.includes("drill") || lower.includes("so sánh") || lower.includes("tại sao") || lower.includes("dự báo") || lower.includes("xuất")) {
      addBlock(query, "loading");
    } else {
      addBlock(query, "analysis");
    }
  };

  const hasBlocks = blocks.length > 0;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)", overflow: "hidden" }}>
      <FeedRail onSelect={handleSignal} activeId={activeSignal} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar />
        <div ref={canvasRef} style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", background: "var(--color-background-tertiary)", ...(hasBlocks ? { gap: 20 } : { justifyContent: "center" }) }}>
          {!hasBlocks ? (
            <WelcomeState onSuggest={handleCommand} onSubmit={handleCommand} />
          ) : (
            <>
              <CanvasInput onSubmit={handleCommand} />
              {blocks.map(b => {
                if (b.type === "simulation") return <SimulationBlock key={b.id} query={b.query} onDismiss={() => removeBlock(b.id)} onFollowUp={handleCommand} />;
                if (b.type === "loading") return <LoadingBlock key={b.id} query={b.query} onDismiss={() => removeBlock(b.id)} />;
                return <AnalysisBlock key={b.id} query={b.query} onDismiss={() => removeBlock(b.id)} onFollowUp={handleCommand} />;
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}