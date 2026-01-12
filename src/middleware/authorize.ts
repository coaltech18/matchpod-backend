import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/User';
import { ChatModel } from '../models/Chat';
import { MatchModel } from '../models/Match';
import { AuthRequest } from './auth';

export interface AuthorizeRequest extends AuthRequest {
  resourceOwnerId?: string;
}

/**
 * Check if user owns the resource
 */
export function requireOwnership(resourceType: 'user' | 'chat' | 'match') {
  return async (req: AuthorizeRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const resourceId = req.params.id || req.params.userId || req.params.chatId || req.params.matchId;
      if (!resourceId) {
        return res.status(400).json({ error: 'Resource ID required' });
      }

      let isOwner = false;

      switch (resourceType) {
        case 'user':
          // Users can only access their own profile
          isOwner = resourceId === userId;
          break;

        case 'chat':
          // Check if user is part of the chat via match
          const chat = await ChatModel.findById(resourceId).populate('matchId');
          if (chat) {
            const match = await MatchModel.findById((chat as any).matchId);
            if (match) {
              isOwner = (match as any).userA.toString() === userId || (match as any).userB.toString() === userId;
            }
          }
          break;

        case 'match':
          // Check if user is part of the match
          const match = await MatchModel.findById(resourceId);
          if (match) {
            isOwner = (match as any).userA.toString() === userId || (match as any).userB.toString() === userId;
          }
          break;
      }

      if (!isOwner) {
        return res.status(403).json({ error: 'Access denied' });
      }

      req.resourceOwnerId = resourceId;
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

/**
 * Check if user can access another user's profile
 */
export function requireProfileAccess() {
  return async (req: AuthorizeRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const targetUserId = req.params.userId;

      if (!userId || !targetUserId) {
        return res.status(400).json({ error: 'User IDs required' });
      }

      // Users can always access their own profile
      if (userId === targetUserId) {
        return next();
      }

      // Check if users have matched (can view each other's profiles)
      const match = await MatchModel.findOne({
        $or: [
          { userA: userId, userB: targetUserId },
          { userA: targetUserId, userB: userId }
        ],
        isMutual: true
      });

      if (!match) {
        return res.status(403).json({ error: 'Profile access denied' });
      }

      next();
    } catch (error) {
      console.error('Profile access check error:', error);
      return res.status(500).json({ error: 'Profile access check failed' });
    }
  };
}

/**
 * Check if user can send messages to another user
 */
export function requireMessagePermission() {
  return async (req: AuthorizeRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const targetUserId = req.body.toUserId;

      if (!userId || !targetUserId) {
        return res.status(400).json({ error: 'User IDs required' });
      }

      // Users cannot message themselves
      if (userId === targetUserId) {
        return res.status(400).json({ error: 'Cannot message yourself' });
      }

      // Check if users have matched
      const match = await MatchModel.findOne({
        $or: [
          { userA: userId, userB: targetUserId },
          { userA: targetUserId, userB: userId }
        ],
        isMutual: true
      });

      if (!match) {
        return res.status(403).json({ error: 'Cannot message unmatched users' });
      }

      next();
    } catch (error) {
      console.error('Message permission check error:', error);
      return res.status(500).json({ error: 'Message permission check failed' });
    }
  };
}

/**
 * Check if user can perform swipe action
 */
export function requireSwipePermission() {
  return async (req: AuthorizeRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const targetUserId = req.body.targetUserId;

      if (!userId || !targetUserId) {
        return res.status(400).json({ error: 'User IDs required' });
      }

      // Users cannot swipe on themselves
      if (userId === targetUserId) {
        return res.status(400).json({ error: 'Cannot swipe on yourself' });
      }

      // Check if target user exists and is active
      const targetUser = await UserModel.findById(targetUserId);
      if (!targetUser || !targetUser.isActive) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      // Check if user has already swiped on this target
      const existingSwipe = await MatchModel.findOne({
        userA: userId,
        userB: targetUserId
      });

      if (existingSwipe) {
        return res.status(409).json({ error: 'Already swiped on this user' });
      }

      next();
    } catch (error) {
      console.error('Swipe permission check error:', error);
      return res.status(500).json({ error: 'Swipe permission check failed' });
    }
  };
}

/**
 * Check if user can update their profile
 */
export function requireProfileUpdate() {
  return async (req: AuthorizeRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const targetUserId = req.params.userId;

      if (!userId || !targetUserId) {
        return res.status(400).json({ error: 'User IDs required' });
      }

      // Users can only update their own profile
      if (userId !== targetUserId) {
        return res.status(403).json({ error: 'Can only update your own profile' });
      }

      next();
    } catch (error) {
      console.error('Profile update check error:', error);
      return res.status(500).json({ error: 'Profile update check failed' });
    }
  };
}

/**
 * Check if user can access potential matches
 */
export function requireMatchesAccess() {
  return async (req: AuthorizeRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user profile is complete
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Basic profile completeness check
      if (!user.name || !user.age || !user.gender || !user.occupation) {
        return res.status(400).json({ error: 'Complete your profile to view matches' });
      }

      next();
    } catch (error) {
      console.error('Matches access check error:', error);
      return res.status(500).json({ error: 'Matches access check failed' });
    }
  };
}

export default {
  requireOwnership,
  requireProfileAccess,
  requireMessagePermission,
  requireSwipePermission,
  requireProfileUpdate,
  requireMatchesAccess,
};
