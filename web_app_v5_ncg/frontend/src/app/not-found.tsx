export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-[14px] font-semibold text-slate-900">Không tìm thấy trang</p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          Đường dẫn bạn truy cập không tồn tại hoặc đã bị thay đổi.
        </p>
        <a
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#19226D] px-4 py-2 text-[13px] font-semibold text-white"
        >
          Về trang chủ
        </a>
      </div>
    </div>
  );
}

