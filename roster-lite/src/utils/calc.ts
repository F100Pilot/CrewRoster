// A small, safe calculator for the money fields (user: "nos sítios onde posso acrescentar o
// somatório de valores, deveria ter uma máquina de calcular"): + − × ÷ and brackets over numbers
// written the Portuguese way ("236,38", "7.413,47") or with a dot ("236.38"). No eval — a tiny
// recursive-descent parser. Returns null for anything it can't read.

// "7.413,47" → 7413.47 · "236,38" → 236.38 · "236.38" → 236.38 · "1.234" → 1234 (dot + 3 digits =
// thousands, as written on the payslip).
function toNumber(raw: string): number | null {
  let t = raw;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  return Number(t);
}

export function evalExpression(input: string): number | null {
  const src = input.replace(/\s/g, '').replace(/[×xX*]/g, '*').replace(/[÷:/]/g, '/').replace(/[−–]/g, '-').replace(/€/g, '');
  if (!src) return null;
  let i = 0;
  const peek = () => src[i];
  const number = (): number | null => {
    const m = /^[\d.,]+/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return toNumber(m[0]);
  };
  const factor = (): number | null => {
    if (peek() === '-') { i++; const v = factor(); return v === null ? null : -v; }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') return null;
      i++;
      return v;
    }
    return number();
  };
  const term = (): number | null => {
    let v = factor();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const r = factor();
      if (r === null || (op === '/' && r === 0)) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  if (v === null || i !== src.length || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100; // money: to the cent
}

// True when the text is a sum/expression rather than a plain number (worth showing "= …").
export const isExpression = (s: string) => /\d\s*[+\-−×xX*÷:/]\s*[\d(]/.test(s) || /[()]/.test(s);
