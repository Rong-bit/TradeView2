import type { Holding, PortfolioSummary } from '../types';

/** 若未設定 API_KEY，儀表板 AI 顧問會使用此 stub，建置與部署可正常通過 */
export const analyzePortfolio = async (
  _holdings: Holding[],
  _summary: PortfolioSummary
): Promise<string> => {
  return '請在環境變數中設定 API_KEY 以使用 Gemini AI 投資顧問功能。';
};
