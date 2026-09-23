/** 公式の商標検索サービス（J-PlatPat）の固定アドレス（research R8、FR-012）。画面の取得はしない（FR-017）。 */
export function jplatpatUrl(applicationNumber: string): string {
  return `https://www.j-platpat.inpit.go.jp/c1801/TR/JP-${encodeURIComponent(applicationNumber)}/40/ja`;
}
