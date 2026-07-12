const TICKER_ITEMS = [
  "WhatsApp Business",
  "Inbox Unificado",
  "Bot com IA",
  "API Oficial Meta",
  "Automações",
  "Atendimento 24h",
];

function TickerContent() {
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {TICKER_ITEMS.map((item, i) => (
        <span key={i} className="flex items-center">
          <span className="px-4">{item}</span>
          <span>✦</span>
        </span>
      ))}
    </span>
  );
}

/** Marquee horizontal infinito — usado em /register e /connections (item B). */
export function Ticker() {
  return (
    <div className="ticker-wrap" aria-hidden>
      <div className="ticker-track py-2 text-[13px] font-bold uppercase tracking-[0.06em] text-black">
        <TickerContent />
        <TickerContent />
      </div>
    </div>
  );
}
