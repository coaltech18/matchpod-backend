import { Router } from 'express';
import { requireAuth, requireOnboardingCompleted, AuthRequest } from '../middleware/auth';
import { ChatModel, MessageModel } from '../models/Chat';
import { MatchModel } from '../models/Match';
import { chatRateLimit } from '../middleware/rateLimit';

export const router = Router();

/**
 * GET /api/chats
 * List user's chat rooms (only for mutual matches)
 */
router.get('/', requireAuth, requireOnboardingCompleted, async (req: AuthRequest, res) => {
  try {
    // Find all MUTUAL matches where user is involved
    const matches = await MatchModel.find({
      $or: [{ userA: req.user!.id }, { userB: req.user!.id }],
      status: 'accepted',
      isMutual: true  // SAFETY: Only mutual matches can have chats
    }).select('_id').lean();

    const matchIds = matches.map(m => m._id);

    // Find chat rooms for these matches
    const chats = await ChatModel.find({ matchId: { $in: matchIds } })
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: chats
    });
  } catch (error) {
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
router.post('/message',
  chatRateLimit,
  requireAuth,
  requireOnboardingCompleted,
  async (req: AuthRequest, res) => {
    try {
      const { toUserId, text, matchId } = req.body as {
        toUserId?: string;
        text: string;
        matchId?: string
      };

      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Message text is required' });
      }

      const userId = req.user!.id;
      let validatedMatchId: string | null = null;

      // CASE 1: matchId provided directly - validate ownership
      if (matchId) {
        const match = await MatchModel.findOne({
          _id: matchId,
          $or: [
            { userA: userId },
            { userB: userId }
          ],
          status: 'accepted',
          isMutual: true  // SAFETY: Only mutual matches can chat
        });

        if (!match) {
          return res.status(403).json({
            error: 'Not authorized to send messages in this chat'
          });
        }

        validatedMatchId = (match._id as any).toString();
      }
      // CASE 2: toUserId provided - find match between users
      else if (toUserId) {
        if (toUserId === userId) {
          return res.status(400).json({ error: 'Cannot message yourself' });
        }

        const match = await MatchModel.findOne({
          $or: [
            { userA: userId, userB: toUserId },
            { userA: toUserId, userB: userId }
          ],
          status: 'accepted',
          isMutual: true  // SAFETY: Only mutual matches can chat
        });

        if (!match) {
          return res.status(404).json({
            error: 'Match not found. Users must have a mutual match to chat.'
          });
        }

        validatedMatchId = (match._id as any).toString();
      }
      // CASE 3: Neither provided
      else {
        return res.status(400).json({
          error: 'Either matchId or toUserId is required'
        });
      }

      // Find or create chat room
      let chat = await ChatModel.findOne({ matchId: validatedMatchId });
      if (!chat) {
        chat = await ChatModel.create({ matchId: validatedMatchId });
      }

      // Create message
      const message = await MessageModel.create({
        matchId: validatedMatchId,
        senderId: userId,
        content: text.trim(),
        type: 'text',
        status: 'sent'
      });

      // Update chat room with last message
      chat.lastMessage = (message._id as any).toString();
      await chat.save();

      res.status(201).json({
        success: true,
        data: { chat, message }
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

export default router;
