/**
 * Typed stand-ins for Express req/res in middleware unit tests.
 * Only the members the code under test touches are implemented; the cast
 * through `unknown` is confined to this file.
 */
import type { Request, Response } from "express";

export interface FakeRes {
  statusCode: number;
  body: unknown;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
}

export function fakeRes(): FakeRes {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

export interface FakeReqInit {
  method: string;
  headers?: Record<string, string>;
  session?: { csrfToken?: string };
}

export function asReq(init: FakeReqInit): Request {
  return { headers: {}, session: {}, ...init } as unknown as Request;
}

export function asRes(res: FakeRes): Response {
  return res as unknown as Response;
}
