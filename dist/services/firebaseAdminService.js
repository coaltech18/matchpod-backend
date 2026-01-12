"use strict";
/**
 * Firebase Admin Service
 * Server-side Firebase operations for Phone Authentication
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeFirebaseAdmin = initializeFirebaseAdmin;
exports.verifyIdToken = verifyIdToken;
exports.getUserByPhoneNumber = getUserByPhoneNumber;
exports.createUserWithPhone = createUserWithPhone;
exports.createCustomToken = createCustomToken;
exports.verifyPhoneNumber = verifyPhoneNumber;
exports.deleteUser = deleteUser;
exports.setCustomClaims = setCustomClaims;
exports.isFirebaseInitialized = isFirebaseInitialized;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
// Firebase Admin initialization flag
let isInitialized = false;
/**
 * Initialize Firebase Admin SDK
 * Call this once at server startup
 */
function initializeFirebaseAdmin() {
    if (isInitialized) {
        console.log('✅ Firebase Admin already initialized');
        return;
    }
    try {
        let serviceAccount;
        // Option 1: Use FIREBASE_SERVICE_ACCOUNT_JSON env var (for Render/cloud deployment)
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            try {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
                console.log('✅ Firebase service account loaded from environment variable');
            }
            catch (parseError) {
                console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', parseError);
                console.warn('⚠️ Firebase Admin will not be initialized. OTP will fall back to demo mode.');
                return;
            }
        }
        else {
            // Option 2: Load from file path (for local development)
            const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
                path_1.default.resolve(process.cwd(), 'config/firebase-service-account.json');
            const fs = require('fs');
            if (!fs.existsSync(serviceAccountPath)) {
                console.warn('⚠️ Firebase service account file not found at:', serviceAccountPath);
                console.warn('⚠️ Firebase Admin will not be initialized. OTP will fall back to demo mode.');
                return;
            }
            serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            console.log('✅ Firebase service account loaded from file');
        }
        firebase_admin_1.default.initializeApp({
            credential: firebase_admin_1.default.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
        });
        isInitialized = true;
        console.log('✅ Firebase Admin initialized successfully');
    }
    catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error);
        console.warn('⚠️ Firebase features will be disabled');
    }
}
/**
 * Verify Firebase ID Token
 * @param idToken Firebase ID token from client
 * @returns Decoded token with user info
 */
async function verifyIdToken(idToken) {
    try {
        if (!isInitialized) {
            throw new Error('Firebase Admin not initialized');
        }
        const decodedToken = await firebase_admin_1.default.auth().verifyIdToken(idToken);
        console.log('✅ Firebase ID token verified for user:', decodedToken.uid);
        return decodedToken;
    }
    catch (error) {
        console.error('❌ Firebase ID token verification failed:', error.message);
        throw new Error('Invalid Firebase ID token');
    }
}
/**
 * Get Firebase user by phone number
 * @param phoneNumber E.164 format (+919876543210)
 * @returns Firebase user record
 */
async function getUserByPhoneNumber(phoneNumber) {
    try {
        if (!isInitialized) {
            throw new Error('Firebase Admin not initialized');
        }
        const user = await firebase_admin_1.default.auth().getUserByPhoneNumber(phoneNumber);
        console.log('✅ Firebase user found:', user.uid);
        return user;
    }
    catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log('ℹ️ No Firebase user found for phone:', phoneNumber);
            return null;
        }
        console.error('❌ Error fetching Firebase user:', error.message);
        throw error;
    }
}
/**
 * Create Firebase user with phone number
 * @param phoneNumber E.164 format (+919876543210)
 * @returns Created user record
 */
async function createUserWithPhone(phoneNumber) {
    try {
        if (!isInitialized) {
            throw new Error('Firebase Admin not initialized');
        }
        const user = await firebase_admin_1.default.auth().createUser({
            phoneNumber
        });
        console.log('✅ Firebase user created:', user.uid);
        return user;
    }
    catch (error) {
        console.error('❌ Error creating Firebase user:', error.message);
        throw error;
    }
}
/**
 * Generate custom token for a user
 * Used for authenticating users without SDK
 * @param uid Firebase user UID
 * @param additionalClaims Optional custom claims
 * @returns Custom token
 */
async function createCustomToken(uid, additionalClaims) {
    try {
        if (!isInitialized) {
            throw new Error('Firebase Admin not initialized');
        }
        const customToken = await firebase_admin_1.default.auth().createCustomToken(uid, additionalClaims);
        console.log('✅ Custom token created for user:', uid);
        return customToken;
    }
    catch (error) {
        console.error('❌ Error creating custom token:', error.message);
        throw error;
    }
}
/**
 * Verify phone number and code (server-side OTP verification)
 * Note: Firebase doesn't provide direct OTP verification on server
 * This is a placeholder for custom implementation
 *
 * @param phoneNumber E.164 format
 * @param code OTP code
 * @returns Verification result
 */
async function verifyPhoneNumber(phoneNumber, code) {
    // Note: Firebase Admin SDK doesn't support direct OTP verification
    // You would need to:
    // 1. Use Firebase client SDK on mobile to verify OTP
    // 2. Send ID token to server for verification (recommended approach)
    // 3. Or implement custom OTP storage/verification logic
    throw new Error('Direct phone verification not supported. Use ID token verification instead.');
}
/**
 * Delete Firebase user
 * @param uid Firebase user UID
 */
async function deleteUser(uid) {
    try {
        if (!isInitialized) {
            throw new Error('Firebase Admin not initialized');
        }
        await firebase_admin_1.default.auth().deleteUser(uid);
        console.log('✅ Firebase user deleted:', uid);
    }
    catch (error) {
        console.error('❌ Error deleting Firebase user:', error.message);
        throw error;
    }
}
/**
 * Set custom claims for a user
 * @param uid Firebase user UID
 * @param claims Custom claims object
 */
async function setCustomClaims(uid, claims) {
    try {
        if (!isInitialized) {
            throw new Error('Firebase Admin not initialized');
        }
        await firebase_admin_1.default.auth().setCustomUserClaims(uid, claims);
        console.log('✅ Custom claims set for user:', uid);
    }
    catch (error) {
        console.error('❌ Error setting custom claims:', error.message);
        throw error;
    }
}
/**
 * Check if Firebase Admin is initialized
 */
function isFirebaseInitialized() {
    return isInitialized;
}
exports.default = {
    initializeFirebaseAdmin,
    verifyIdToken,
    getUserByPhoneNumber,
    createUserWithPhone,
    createCustomToken,
    verifyPhoneNumber,
    deleteUser,
    setCustomClaims,
    isFirebaseInitialized
};
