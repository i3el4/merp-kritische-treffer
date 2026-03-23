// critParser.js
// Extrahiert strukturierte Daten aus Krit-visual-Texten (Regex-basiert).

/**
 * Parst den visual- oder tts-Text eines Krit-Eintrags.
 * @param {string} text Der visual- oder tts-Text
 * @returns {{ tp: number, tpPerRound: number, ben: number, benoPar: number, oPar: number, par: number, init: number, ko: boolean, severity: 'normal'|'incapacitated'|'lethal' }}
 */
export function parseCritText(text) {
  const result = {
    tp: 0,
    tpPerRound: 0,
    ben: 0,
    benoPar: 0,
    oPar: 0,
    par: 0,
    init: 0,
    ko: false,
    severity: 'normal'
  };
  if (!text || typeof text !== 'string') return result;

  // Sofortschaden: +X T (nicht T/Rd)
  const tpMatch = text.match(/\+(\d+)\s*T(?:\s|\.|,|$)/);
  if (tpMatch) result.tp = parseInt(tpMatch[1], 10) || 0;

  // Laufender Schaden: +X T/Rd
  const tprMatch = text.match(/\+(\d+)\s*T\/Rd/);
  if (tprMatch) result.tpPerRound = parseInt(tprMatch[1], 10) || 0;

  // X Rd benoPar (vor "ben" prüfen, da benoPar "ben" enthält)
  const benoParMatch = text.match(/(\d+)\s*Rd\s+benoPar/i);
  if (benoParMatch) result.benoPar = Math.max(result.benoPar, parseInt(benoParMatch[1], 10) || 0);

  // X Rd ben. (ohne oPar)
  const benMatch = text.match(/(\d+)\s*Rd\s+ben(?:\s|\.|,|$)/i);
  if (benMatch) result.ben = Math.max(result.ben, parseInt(benMatch[1], 10) || 0);

  // X Rd oPar (nur keine Parade)
  const oParMatch = text.match(/(\d+)\s*Rd\s+oPar/i);
  if (oParMatch) result.oPar = Math.max(result.oPar, parseInt(oParMatch[1], 10) || 0);

  // X Rd par (Parade-Malus)
  const parMatch = text.match(/(\d+)\s*Rd\s+par(?:\s|\.|,|$)/i);
  if (parMatch) result.par = Math.max(result.par, parseInt(parMatch[1], 10) || 0);

  // X Rd Init-Verlust / Initiativeverlust
  const initMatch = text.match(/(\d+)\s*Rd\s+(?:Init[- ]?Verlust|Initiativeverlust)/i);
  if (initMatch) result.init = Math.max(result.init, parseInt(initMatch[1], 10) || 0);

  // K.O.-Status
  const koPatterns = [
    /\bniedergestreckt\b/i,
    /\bbewusstlos\b/i,
    /\bK\.O\.\b/i,
    /\bKoma\b/i,
    /\bsofort\s+tödlich\b/i,
    /\btödlich\s+in\s+\d+/i,
    /\bsofort\s+tot\b/i
  ];
  result.ko = koPatterns.some(p => p.test(text));
  if (/\bsofort\s+tödlich\b|\bsofort\s+tot\b|\btödlich\s+in\s+\d+/i.test(text)) {
    result.severity = 'lethal';
  } else if (result.ko) {
    result.severity = 'incapacitated';
  }

  return result;
}
