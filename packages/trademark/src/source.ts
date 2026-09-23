/** 商標データへの問い合わせのアダプタ（憲章 III、research R1）。取得元を差し替えても照合の側を変えずに済むようにする。 */

export interface MarkRecord {
  applicationNumber: string;
  registrationNumber: string | null;
  markText: string;
  holderName: string;
  classes: number[];
  status: "pending" | "registered";
}

export interface ReadingCandidate {
  mark: MarkRecord;
  reading: string;
}

export interface DatasetInfo {
  id: string;
  /** 基準日（YYYY-MM-DD） */
  asOfDate: string;
}

export interface TrademarkSource {
  /** 照合に使うデータセット。まだ取り込んでいなければ null */
  activeDataset(): Promise<DatasetInfo | null>;
  /** 正規化後の文字が同じ商標。classes が空なら全区分 */
  findIdentical(normalizedText: string, classes: number[]): Promise<MarkRecord[]>;
  /**
   * 称呼キーで粗く抽出した類似の候補（順位づけは classify で行う）。
   * 正規化後の文字が excludeNormalizedText と同じ商標は「同一」なので含めない（同一の上限を超えた分が類似に紛れないように）。
   */
  findSimilarCandidates(
    readingKey: string,
    classes: number[],
    excludeNormalizedText: string,
  ): Promise<ReadingCandidate[]>;
  /** 正規化後の文字が同じ商標の称呼（多い順）。読みの推定に使う（research R3） */
  readingsForText(normalizedText: string): Promise<string[]>;
}
