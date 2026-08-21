import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errors.js";

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
  }

  // 예상하지 못한 에러: 내부 정보를 노출하지 않는다
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL", message: "Something went wrong" },
  });
}
