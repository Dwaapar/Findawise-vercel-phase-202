import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    id?: string;
    // Additional session fields can be added here
  }
}

declare global {
  namespace Express {
    interface Request {
      session: import('express-session').SessionData;
    }
  }
}