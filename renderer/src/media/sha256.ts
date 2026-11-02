/** Convex Storage uses standard base64 SHA-256; local tools commonly use hex.
 * Normalize only digests, never caller identities or stored asset lineage.
 * Pure JS so Convex, browser code and the Node renderer share one contract. */
export function normalizeSha256(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return undefined;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes:number[]=[];let bits=0;let remaining=0;
  for(let index=0;index<43;index++){
    remaining=(remaining<<6)|alphabet.indexOf(value[index]);bits+=6;
    if(bits>=8){bits-=8;bytes.push((remaining>>>bits)&255);remaining&=(1<<bits)-1;}
  }
  // Reject noncanonical padding bits, not merely decodable base64 strings.
  if(bytes.length!==32||bits!==2||remaining!==0)return undefined;
  return bytes.map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function sha256Equal(left: unknown,right: unknown): boolean {
  const normalized=normalizeSha256(left);
  return normalized!==undefined&&normalized===normalizeSha256(right);
}
