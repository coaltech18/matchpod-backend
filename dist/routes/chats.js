"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Chat_1 = require("../models/Chat");
const Match_1 = require("../models/Match");
const rateLimit_1 = require("../middleware/rateLimit");
exports.router = (0, express_1.Router)();
/**
 * GET /api/chats
 * List user's chat rooms (only for mutual matches)
 */
exports.router.get('/', auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        // Find all MUTUAL matches where user is involved
        const matches = await Match_1.MatchModel.find({
            $or: [{ userA: req.user.id }, { userB: req.user.id }],
            status: 'accepted',
            isMutual: true // SAFETY: Only mutual matches can have chats
        }).select('_id').lean();
        const matchIds = matches.map(m => m._id);
        // Find chat rooms for these matches
        const chats = await Chat_1.ChatModel.find({ matchId: { $in: matchIds } })
            .populate('lastMessage')
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean();
        res.json({
            success: true,
            data: chats
        });
    }
    catch (error) {
        console.error('Error listing chats:', error);
        res.status(500).json({ error: 'Failed to list chats' });
    }
});
/**
 * POST /api/chats/message
 * Send a message (creates chat room if none exists)
 *
 * SAFETY CHECKS:
 * - User must be authenticated
 * - Match must exist
 * - Match must be mutual (isMutual === true)
 * - User must be part of the match
 */
exports.router.post('/message', rateLimit_1.chatRateLimit, auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        const { toUserId, text, matchId } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Message text is required' });
        }
        const userId = req.user.id;
        let validatedMatchId = null;
        // CASE 1: matchId provided directly - validate ownership
        if (matchId) {
            const match = await Match_1.MatchModel.findOne({
                _id: matchId,
                $or: [
                    { userA: userId },
                    { userB: userId }
                ],
                status: 'accepted',
                isMutual: true // SAFETY: Only mutual matches can chat
            });
            if (!match) {
                return res.status(403).json({
                    error: 'Not authorized to send messages in this chat'
                });
            }
            validatedMatchId = match._id.toString();
        }
        // CASE 2: toUserId provided - find match between users
        else if (toUserId) {
            if (toUserId === userId) {
                return res.status(400).json({ error: 'Cannot message yourself' });
            }
            const match = await Match_1.MatchModel.findOne({
                $or: [
                    { userA: userId, userB: toUserId },
                    { userA: toUserId, userB: userId }
                ],
                status: 'accepted',
                isMutual: true // SAFETY: Only mutual matches can chat
            });
            if (!match) {
                return res.status(404).json({
                    error: 'Match not found. Users must have a mutual match to chat.'
                });
            }
            validatedMatchId = match._id.toString();
        }
        // CASE 3: Neither provided
        else {
            return res.status(400).json({
                error: 'Either matchId or toUserId is required'
            });
        }
        // Find or create chat room
        let chat = await Chat_1.ChatModel.findOne({ matchId: validatedMatchId });
        if (!chat) {
            chat = await Chat_1.ChatModel.create({ matchId: validatedMatchId });
        }
        // Create message
        const message = await Chat_1.MessageModel.create({
            matchId: validatedMatchId,
            senderId: userId,
            content: text.trim(),
            type: 'text',
            status: 'sent'
        });
        // Update chat room with last message
        chat.lastMessage = message._id.toString();
        await chat.save();
        res.status(201).json({
            success: true,
            data: { chat, message }
        });
    }
    catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});
exports.default = exports.router;
