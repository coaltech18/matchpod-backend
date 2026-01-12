import { Request } from 'express';
import { User } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      file?: {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      };
    }
  }
}
