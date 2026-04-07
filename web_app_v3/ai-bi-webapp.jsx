import { useState, useRef, useEffect, useCallback } from "react";

const C = { brand: "#19226D", brandLight: "#E8EAF5", red: "#E24B4A", redBg: "#FCEBEB", amber: "#EF9F27", amberBg: "#FAEEDA", blue: "#185FA5", blueBg: "#E6F1FB", purple: "#534AB7", purpleBg: "#EEEDFE", amberDk: "#BA7517", pos: "#1D9E75", posLight: "#E1F5EE" };
const BD = "1px solid var(--color-border-secondary)";
const BDL = "1px solid var(--color-border-tertiary)";
const SH = "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)";
const SHL = "0 1px 2px rgba(0,0,0,0.04)";

const Dot = ({ color, size = 8 }) => <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }} />;
const Ico = ({ children, size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;

/* =================== SIDEBAR =================== */
function Sidebar({ active, go }) {
  const nav = [
    { id: "overview", label: "Tổng quan", icon: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></> },
    { id: "analysis", label: "Phân tích", icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
    { id: "explore", label: "Khám phá", icon: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></> },
  ];
  return (
    <div style={{ width: 220, background: "var(--color-background-primary)", borderRight: BD, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "20px 20px 24px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>FPT BI</span>
      </div>
      <div style={{ flex: 1, padding: "0 12px" }}>
        {nav.map(n => {
          const on = active === n.id;
          return (
            <div key={n.id} onClick={() => go(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, marginBottom: 4,
                background: on ? C.brandLight : "transparent", color: on ? C.brand : "var(--color-text-secondary)",
                cursor: "pointer", transition: "all 0.15s", fontWeight: on ? 600 : 400, fontSize: 14,
              }}>
              <Ico>{n.icon}</Ico>
              <span>{n.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "16px", borderTop: BDL }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12, color: C.blue }}>MT</div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Minh T.</p>
            <p style={{ fontSize: 11, margin: 0, color: "var(--color-text-secondary)" }}>Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== OVERVIEW =================== */
function Overview({ onAction }) {
  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <p style={{ fontSize: 24, fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Tổng quan</p>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>Cập nhật 2 phút trước — 14 nguồn dữ liệu</p>
        </div>
        <div style={{ position: "relative", cursor: "pointer", padding: 4 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          <div style={{ position: "absolute", top: 2, right: 2, width: 9, height: 9, borderRadius: "50%", background: C.red, border: "2px solid var(--color-background-primary)" }} />
        </div>
      </div>

      <div style={{ background: "var(--color-background-secondary)", borderRadius: 16, padding: "18px 22px", marginBottom: 28, border: BD, boxShadow: SH }}>
        <p style={{ fontSize: 15, color: "var(--color-text-primary)", margin: 0, lineHeight: 1.65 }}>
          Đã quét <strong>14 nguồn dữ liệu</strong> từ phiên trước. Doanh thu nhìn chung tích cực, nhưng <span style={{ color: C.red, fontWeight: 600 }}>khu vực miền Nam cần chú ý</span> — 3 tài khoản lớn bị đình trệ. Pipeline doanh nghiệp đạt mức cao nhất mọi thời đại.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          { l: "MRR", v: "56 tỷ", c: "+8.2%", cc: C.pos },
          { l: "Người dùng hoạt động", v: "12.8K", c: "+3.1%", cc: C.pos },
          { l: "NPS", v: "72", c: "ổn định", cc: "var(--color-text-secondary)" },
          { l: "Chi phí vận hành", v: "8.8 tỷ", c: "+5%", cc: C.red },
        ].map((k, i) => (
          <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 14, padding: "16px 18px", border: BD, boxShadow: SHL }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 8px" }}>{k.l}</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <p style={{ fontSize: 26, fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>{k.v}</p>
              <span style={{ fontSize: 13, color: k.cc, fontWeight: 500 }}>{k.c}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Tín hiệu</p>
          <div style={{ borderRadius: 16, border: BD, overflow: "hidden", boxShadow: SH }}>
            {[
              { dot: C.red, t: "Doanh thu miền Nam -18% WoW", d: "3 tài khoản lớn trì hoãn gia hạn.", tag: "Nghiêm trọng", tagC: C.red, tagBg: C.redBg },
              { dot: C.amber, t: "CAC đạt 3.2tr, vượt 12% mục tiêu", d: "CPC quảng cáo tìm kiếm tăng.", tag: "Theo dõi", tagC: C.amber, tagBg: C.amberBg },
              { dot: C.pos, t: "Pipeline doanh nghiệp +34% MoM", d: "Cao nhất từ trước đến nay.", tag: "Tích cực", tagC: C.pos, tagBg: C.posLight, last: true },
            ].map((s, i) => (
              <div key={i} onClick={() => onAction(s.t)}
                style={{ padding: "14px 16px", borderBottom: s.last ? "none" : BDL, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <Dot color={s.dot} size={9} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 3px", color: "var(--color-text-primary)" }}>{s.t}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{s.d}</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: s.tagC, background: s.tagBg, padding: "3px 8px", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0 }}>{s.tag}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Phân tích đề xuất</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["Phân tích sâu: tại sao miền Nam giảm?", "Mô phỏng: cắt 20% chi quảng cáo", "Tạo báo cáo cho ban lãnh đạo", "So sánh hiệu suất theo khu vực"].map((q, i) => (
              <div key={i} onClick={() => onAction(q)}
                style={{ background: "var(--color-background-secondary)", border: BD, borderRadius: 12, padding: "12px 16px", fontSize: 14, color: "var(--color-text-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: SHL, transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-tertiary)"}
                onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-secondary)"}>
                <span>{q}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2.5"><path d="M7 17l9.2-9.2M7 7h10v10" /></svg>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== ANALYSIS PAGE =================== */
const Bar = ({ name, w, color, val }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
    <span style={{ fontSize: 13, color: "var(--color-text-primary)", width: 80, textAlign: "right", flexShrink: 0 }}>{name}</span>
    <div style={{ flex: 1, height: 18, background: "var(--color-background-primary)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", right: 0, top: 0, width: `${w}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
    <span style={{ fontSize: 13, color, fontWeight: 600, width: 44, flexShrink: 0 }}>{val}</span>
  </div>
);

function Analysis({ query }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const pills = ["Soạn email cho Vinamilk", "Lịch sử giao dịch Vinamilk", "Mô phỏng mất 3 tài khoản", "Xuất báo cáo PDF"];

  useEffect(() => {
    if (query) {
      setMsgs([{ role: "user", text: query }, { role: "system", type: "full" }]);
    }
  }, [query]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = useCallback((text) => {
    if (!text.trim()) return;
    setMsgs(p => [...p, { role: "user", text }, { role: "system", type: "simple", text: "Đang xử lý dữ liệu liên quan..." }]);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "16px 32px", borderBottom: BD, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Phân tích</p>
        <span style={{ fontSize: 11, background: C.brandLight, color: C.brand, padding: "4px 12px", borderRadius: 10, fontWeight: 600 }}>Miền Nam</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex" }}>
        {/* Main thread */}
        <div style={{ flex: 1, padding: "24px 32px 16px", maxWidth: 680 }}>
          {msgs.map((m, i) => {
            if (m.role === "user") return (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
                <div style={{ maxWidth: "75%", background: "var(--color-text-primary)", borderRadius: "18px 18px 4px 18px", padding: "11px 16px" }}>
                  <p style={{ fontSize: 15, color: "var(--color-background-primary)", lineHeight: 1.5, margin: 0 }}>{m.text}</p>
                </div>
              </div>
            );
            if (m.type === "simple") return (
              <div key={i} style={{ marginBottom: 20, maxWidth: "75%" }}>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "4px 18px 18px 18px", padding: "11px 16px", border: BDL }}>
                  <p style={{ fontSize: 15, color: "var(--color-text-primary)", lineHeight: 1.55, margin: 0 }}>{m.text}</p>
                </div>
              </div>
            );
            return (
              <div key={i} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 15, color: "var(--color-text-primary)", lineHeight: 1.6, margin: "0 0 16px" }}>Sự sụt giảm tập trung vào một số tài khoản cụ thể, không phải toàn bộ khu vực:</p>

                <div style={{ background: "var(--color-background-secondary)", borderRadius: 14, padding: "16px 18px", marginBottom: 14, border: BDL, boxShadow: SHL }}>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>Doanh thu miền Nam theo tài khoản (thay đổi WoW)</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Bar name="Vinamilk" w={65} color={C.red} val="-32%" />
                    <Bar name="PNJ" w={45} color={C.red} val="-24%" />
                    <Bar name="MWG" w={38} color={C.amber} val="-15%" />
                    <Bar name="Còn lại" w={12} color={C.pos} val="+2%" />
                  </div>
                </div>

                <div style={{ background: C.redBg, borderRadius: 14, padding: "16px 18px", marginBottom: 14, border: `1px solid ${C.red}33`, boxShadow: SHL }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>Nguyên nhân gốc</span>
                  </div>
                  <p style={{ fontSize: 14, color: "#791F1F", lineHeight: 1.55, margin: 0 }}>Cả 3 tài khoản đều có hợp đồng hết hạn trong tháng 3. Vinamilk đang thử nghiệm đối thủ, PNJ xin gia hạn ngân sách, MWG đang tái cấu trúc nội bộ.</p>
                </div>

                <p style={{ fontSize: 15, color: "var(--color-text-primary)", lineHeight: 1.6, margin: "0 0 16px" }}><strong>Có thể phục hồi nhưng cần hành động nhanh.</strong> Vinamilk rủi ro cao nhất — nếu không tái tiếp cận trước 15/4, khả năng win-back giảm còn ~20%.</p>

                <div style={{ background: C.posLight, borderRadius: 14, padding: "16px 18px", marginBottom: 16, border: `1px solid ${C.pos}33`, boxShadow: SHL }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pos} strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#085041" }}>Hành động đề xuất</span>
                  </div>
                  {["Lên lịch gọi Vinamilk trong tuần này", "Chuẩn bị gói ưu đãi giữ chân cho PNJ", "Đưa MWG vào pipeline Q2 (ưu tiên thấp)"].map((a, j) => (
                    <p key={j} style={{ fontSize: 14, color: "#04342C", lineHeight: 1.5, margin: "0 0 4px" }}>{j + 1}. {a}</p>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {pills.map((p, j) => (
                    <div key={j} onClick={() => send(p)}
                      style={{ background: "var(--color-background-secondary)", border: BD, borderRadius: 20, padding: "9px 14px", fontSize: 13, color: "var(--color-text-primary)", cursor: "pointer", boxShadow: SHL, transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-tertiary)"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-secondary)"}>
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Right sidebar: context */}
        <div style={{ width: 260, borderLeft: BDL, padding: "24px 20px", flexShrink: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>Dữ liệu được tham chiếu</p>
          {[
            { t: "revenue_south_q1.csv", d: "Bảng doanh thu miền Nam" },
            { t: "accounts_renewal.csv", d: "Lịch gia hạn hợp đồng" },
            { t: "competitor_intel.xlsx", d: "Báo cáo đối thủ T3/2025" },
          ].map((f, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: BDL, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>{f.t}</p>
                <p style={{ fontSize: 11, margin: "2px 0 0", color: "var(--color-text-secondary)" }}>{f.d}</p>
              </div>
            </div>
          ))}

          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1, margin: "24px 0 14px" }}>Phân tích liên quan</p>
          {["Xu hướng churn Q1 theo segment", "Hiệu quả retention campaign 2024", "Benchmark CAC ngành SaaS VN"].map((r, i) => (
            <div key={i} onClick={() => send(r)}
              style={{ padding: "8px 0", borderBottom: BDL, cursor: "pointer", fontSize: 13, color: C.brand, fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
              onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
              {r}
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "12px 32px 20px", borderTop: BD, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 680 }}>
          <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 24, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, border: BD, boxShadow: SHL }}>
            <Dot color={C.brand} size={8} />
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Tiếp tục phân tích..."
              onKeyDown={e => { if (e.key === "Enter" && input.trim()) { send(input); setInput(""); } }}
              style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, color: "var(--color-text-primary)", width: "100%", fontFamily: "inherit" }} />
          </div>
          <div onClick={() => { if (input.trim()) { send(input); setInput(""); } }}
            style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--color-text-primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-background-primary)" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== EXPLORE =================== */
function Explore({ onAction }) {
  const spaces = [
    { icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />, bg: C.brandLight, stroke: C.brand, t: "Doanh thu", d: "MRR, ARR, churn, mở rộng", sc: C.red, st: "1 tín hiệu" },
    { icon: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></>, bg: C.amberBg, stroke: C.amberDk, t: "Marketing", d: "CAC, kênh, chiến dịch", sc: C.amber, st: "1 tín hiệu" },
    { icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>, bg: C.blueBg, stroke: C.blue, t: "Bán hàng", d: "Pipeline, win rate, đội ngũ", sc: C.pos, st: "Ổn định" },
    { icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>, bg: C.purpleBg, stroke: C.purple, t: "Sản phẩm", d: "DAU, retention, tính năng", sc: C.pos, st: "Ổn định" },
  ];
  const stories = [
    { t: "Vì sao deal doanh nghiệp tăng tốc", d: "Phân tích sâu kết nối chương trình đối tác với pipeline tăng. Kèm mô hình dự báo cho Q2.", tag: "Bán hàng", time: "2 giờ trước" },
    { t: "Báo cáo hiệu quả marketing Q1", d: "Chi phí vs. kết quả tất cả kênh. Organic vượt trội paid gấp 3 lần.", tag: "Marketing", time: "Hôm qua" },
    { t: "Cảnh báo churn: 12 tài khoản", d: "Mô hình dự đoán phát hiện xu hướng giảm tương tác ở 12 tài khoản mid-market trong 30 ngày.", tag: "Doanh thu", time: "2 ngày trước" },
  ];
  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      <p style={{ fontSize: 24, fontWeight: 600, margin: "0 0 6px", color: "var(--color-text-primary)" }}>Khám phá</p>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 28px" }}>Dữ liệu theo lĩnh vực và phân tích tự động</p>

      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Không gian dữ liệu</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        {spaces.map((s, i) => (
          <div key={i} onClick={() => onAction(s.t)}
            style={{ background: "var(--color-background-primary)", border: BD, borderRadius: 16, padding: 18, cursor: "pointer", boxShadow: SH, transition: "box-shadow 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = SH}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={s.stroke} strokeWidth="2">{s.icon}</svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{s.t}</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.4, margin: "0 0 12px" }}>{s.d}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Dot color={s.sc} size={7} />
              <span style={{ fontSize: 11, color: s.sc, fontWeight: 600 }}>{s.st}</span>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Phân tích gần đây</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stories.map((s, i) => (
          <div key={i} onClick={() => onAction(s.t)}
            style={{ background: "var(--color-background-primary)", border: BD, borderRadius: 14, padding: "16px 20px", cursor: "pointer", boxShadow: SH, display: "flex", alignItems: "flex-start", gap: 16, transition: "background 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-primary)"}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{s.t}</p>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.45, margin: 0 }}>{s.d}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", padding: "3px 10px", borderRadius: 8, border: BDL }}>{s.tag}</span>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{s.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================== APP =================== */
export default function App() {
  const [page, setPage] = useState("overview");
  const [analysisQuery, setAnalysisQuery] = useState("Tại sao doanh thu miền Nam giảm 18%?");

  const goAnalysis = (q) => { setAnalysisQuery(q); setPage("analysis"); };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)", overflow: "hidden" }}>
      <Sidebar active={page} go={setPage} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--color-background-primary)" }}>
        {page === "overview" && (
          <>
            <div style={{ flex: 1, overflowY: "auto" }}><Overview onAction={goAnalysis} /></div>
            <div style={{ maxWidth: 960, padding: "0 32px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 24, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, border: BD, boxShadow: SHL }}>
                  <Dot color={C.brand} size={8} />
                  <input placeholder="Vấn đề cần phân tích..." onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) goAnalysis(e.target.value); }}
                    style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, color: "var(--color-text-primary)", width: "100%", fontFamily: "inherit" }} />
                </div>
              </div>
            </div>
          </>
        )}
        {page === "analysis" && <Analysis query={analysisQuery} />}
        {page === "explore" && (
          <>
            <div style={{ flex: 1, overflowY: "auto" }}><Explore onAction={goAnalysis} /></div>
            <div style={{ maxWidth: 960, padding: "0 32px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 24, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, border: BD, boxShadow: SHL }}>
                  <Dot color={C.brand} size={8} />
                  <input placeholder="Vấn đề cần phân tích..." onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) goAnalysis(e.target.value); }}
                    style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, color: "var(--color-text-primary)", width: "100%", fontFamily: "inherit" }} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}