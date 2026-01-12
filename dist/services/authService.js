"use strict";
/**
 * Authentication Service
 * Phase 2: Uses centralized config for JWT settings
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.generateRefreshToken = exports.generateToken = exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const verifyToken = (token) => {
    try {
        const { secret } = (0, env_1.getJwtConfig)();
        return jsonwebtoken_1.default.verify(token, secret);
    }
    catch (error) {
        throw new Error('Invalid token');
    }
};
exports.verifyToken = verifyToken;
const generateToken = (payload) => {
    const { secret, expiresIn } = (0, env_1.getJwtConfig)();
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn });
};
exports.generateToken = generateToken;
const generateRefreshToken = (payload) => {
    const { refreshSecret, refreshExpiresIn } = (0, env_1.getJwtConfig)();
    return jsonwebtoken_1.default.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn });
};
exports.generateRefreshToken = generateRefreshToken;
const verifyRefreshToken = (token) => {
    try {
        const { refreshSecret } = (0, env_1.getJwtConfig)();
        return jsonwebtoken_1.default.verify(token, refreshSecret);
    }
    catch (error) {
        throw new Error('Invalid refresh token');
    }
};
exports.verifyRefreshToken = verifyRefreshToken;
