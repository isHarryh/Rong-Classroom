export function Brand() {
  return (
    <div className="header-brand">
      {/* eslint-disable-next-line @next/next/no-img-element -- static app icon served from /icon.svg */}
      <img className="brand-logo" src="/icon.svg" alt="" width={32} height={32} />
      <span>榕课堂管理端</span>
    </div>
  );
}
