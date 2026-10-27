export const MIN_LEXEME_COVERAGE_BP = 5000;
export const MIN_SIMILARITY_BP = 6000; // Not tuned against real questions (see roadmap owed list).

export interface CoverageSignals {
  lexemeCount: number;
  bestLexemeMatches: number;
  bestSimilarityBp: number | null;
}

export function isCovered(s: CoverageSignals): boolean {
  return (
    (s.lexemeCount > 0 && s.bestLexemeMatches * 10000 >= MIN_LEXEME_COVERAGE_BP * s.lexemeCount) ||
    (s.bestSimilarityBp !== null && s.bestSimilarityBp >= MIN_SIMILARITY_BP)
  );
}
