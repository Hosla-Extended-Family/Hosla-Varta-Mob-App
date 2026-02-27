import { FriendRepository } from '../repositories/FriendRepository';
import prisma from '../config/database';
import { AppError } from '../utils/AppError';
import { ErrorCode } from '../utils/errorCodes';
import { FriendshipStatus } from '@prisma/client';

const friendRepository = new FriendRepository();

export class FriendService {
    static async sendRequest(requesterId: string, receiverId: string) {
        if (requesterId === receiverId) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, 'Cannot send friend request to self');
        }

        const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
        if (!receiver) {
            throw new AppError(ErrorCode.NOT_FOUND, 'User not found');
        }

        // Check if blocked
        const blocked = await prisma.blockedUser.findFirst({
            where: {
                OR: [
                    { blockerId: requesterId, blockedId: receiverId }, // Requester blocked Receiver
                    { blockerId: receiverId, blockedId: requesterId }, // Receiver blocked Requester
                ],
            },
        });

        if (blocked) {
            throw new AppError(ErrorCode.FORBIDDEN, 'Cannot send request (blocked)');
        }

        // Check existing friendship
        const existing = await friendRepository.getFriendship(requesterId, receiverId);

        if (existing) {
            if (existing.status === FriendshipStatus.ACCEPTED) {
                throw new AppError(ErrorCode.VALIDATION_ERROR, 'Already friends');
            }
            if (existing.status === FriendshipStatus.PENDING) {
                // If I am the one who sent it, error
                if (existing.requesterId === requesterId) {
                    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Friend request already sent');
                }
                // If they sent it, auto-accept
                if (existing.receiverId === requesterId) {
                    return this.acceptRequest(requesterId, existing.id);
                }
            }
            // If REJECTED, can we resend? Usually yes, after some time. 
            // For now, let's allow if REJECTED (create new or update?). 
            // Schema has unique constraint on [requesterId, receiverId], so we must UPDATE if exists, or delete and create.
            // But simpler: just throw error if REJECTED for now, or handle re-request.
            // Strict rules: "If reverse pending exists → auto-accept". "Cannot send like if already friends".
            // Let's assume if REJECTED, we can update to PENDING.
        }

        // Check if there is a row (A, B) or (B, A). 
        // If (A->B) exists:
        //   PENDING: wait
        //   ACCEPTED: done
        //   REJECTED: ?
        // If (B->A) exists:
        //   PENDING: auto-accept (handled above)

        // If existing row matches exact direction (A->B)
        const exactExisting = await prisma.friendship.findUnique({
            where: {
                requesterId_receiverId: {
                    requesterId,
                    receiverId
                }
            }
        });

        if (exactExisting) {
            if (exactExisting.status === FriendshipStatus.REJECTED) {
                // Allow re-requesting by updating status
                return prisma.friendship.update({
                    where: { id: exactExisting.id },
                    data: { status: FriendshipStatus.PENDING, createdAt: new Date() } // reset time
                });
            }
            // Should have been caught by general check, but just in case
            if (exactExisting.status === FriendshipStatus.ACCEPTED) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Already friends');
            if (exactExisting.status === FriendshipStatus.PENDING) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Request already sent');
        }

        return friendRepository.createRequest(requesterId, receiverId);
    }

    static async acceptRequest(userId: string, friendshipId: string) {
        const friendship = await friendRepository.getFriendshipById(friendshipId);
        if (!friendship) {
            throw new AppError(ErrorCode.NOT_FOUND, 'Friend request not found');
        }

        if (friendship.receiverId !== userId) {
            throw new AppError(ErrorCode.FORBIDDEN, 'Only receiver can accept request');
        }

        if (friendship.status !== FriendshipStatus.PENDING) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, 'Request is not pending');
        }

        return friendRepository.acceptRequest(friendshipId, {
            requesterId: friendship.requesterId,
            receiverId: friendship.receiverId
        });
    }

    static async rejectRequest(userId: string, friendshipId: string) {
        const friendship = await friendRepository.getFriendshipById(friendshipId);
        if (!friendship) {
            throw new AppError(ErrorCode.NOT_FOUND, 'Friend request not found');
        }

        if (friendship.receiverId !== userId) {
            throw new AppError(ErrorCode.FORBIDDEN, 'Only receiver can reject request');
        }

        if (friendship.status !== FriendshipStatus.PENDING) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, 'Request is not pending');
        }

        return friendRepository.rejectRequest(friendshipId);
    }

    static async removeFriend(userId: string, friendshipId: string) {
        const friendship = await friendRepository.getFriendshipById(friendshipId);
        if (!friendship) {
            throw new AppError(ErrorCode.NOT_FOUND, 'Friendship not found');
        }

        if (friendship.requesterId !== userId && friendship.receiverId !== userId) {
            throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized');
        }

        // If it's ACCEPTED, we delete both reciprocal rows
        if (friendship.status === FriendshipStatus.ACCEPTED) {
            return friendRepository.removeFriend(friendship.requesterId, friendship.receiverId);
        }

        // If it's PENDING, REJECTED, or BLOCKED, we just delete the row
        // This allows both requester to "cancel" and receiver to "dismiss/reject" via the same API
        return prisma.friendship.delete({ where: { id: friendshipId } });
    }

    static async listFriends(userId: string) {
        return friendRepository.listFriends(userId);
    }

    static async listRequests(userId: string) {
        return friendRepository.listPendingRequests(userId);
    }
}
