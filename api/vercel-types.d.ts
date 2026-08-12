// Vercel Serverless Function 類型聲明
// 這些類型在 Vercel 運行時會自動提供

declare module '@vercel/node' {
  export interface VercelRequest {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    body: any;
    query?: Record<string, string | string[]>;
  }

  export interface VercelResponse {
    status(code: number): VercelResponse;
    json(body: any): void;
    send(body: any): void;
    end(body?: any): void;
    setHeader(name: string, value: string | string[]): void;
  }

  export type VercelHandler = (
    req: VercelRequest,
    res: VercelResponse
  ) => void | Promise<void>;
}

