import { Request, Response, NextFunction } from 'express';

export function skipCsrf(paths: RegExp[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (paths.some(rx => rx.test(req.path))) (req as any).csrfExempt = true;
    next();
  };
}