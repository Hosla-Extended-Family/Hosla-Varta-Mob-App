import prisma from '../config/database';
import { FriendshipStatus } from '@prisma/client';

export class FriendRepository {
    async createRequest(requesterId: string, receiverId: string) {
        return prisma.friendship.create({
            data: {
                requesterId,
                receiverId,
                status: FriendshipStatus.PENDING,
            },
        });
    }

    async getFriendship(user1Id: string, user2Id: string) {
        return prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId: user1Id, receiverId: user2Id },
                    { requesterId: user2Id, receiverId: user1Id },
                ],
            },
        });
    }

    async getFriendshipById(id: string) {
        return prisma.friendship.findUnique({
            where: { id },
            include: {
                requester: { select: { id: true, name: true } },
                receiver: { select: { id: true, name: true } }
            }
        });
    }

    async acceptRequest(friendshipId: string, item: { requesterId: string, receiverId: string }) {
        // Transaction to update status AND create reciprocal friendship
        return prisma.$transaction([
            prisma.friendship.update({
                where: { id: friendshipId },
                data: {
                    status: FriendshipStatus.ACCEPTED,
                    acceptedAt: new Date()
                },
            }),
            prisma.friendship.create({
                data: {
                    requesterId: item.receiverId, // The receiver of original request becomes requester of reciprocal
                    receiverId: item.requesterId,
                    status: FriendshipStatus.ACCEPTED,
                    acceptedAt: new Date(),
                },
            }),
        ]);
    }

    async rejectRequest(friendshipId: string) {
        return prisma.friendship.update({
            where: { id: friendshipId },
            data: { status: FriendshipStatus.REJECTED },
        });
    }

    async removeFriend(user1Id: string, user2Id: string) {
        // Delete both rows
        return prisma.$transaction(async (tx) => {
            await tx.friendship.deleteMany({
                where: {
                    OR: [
                        { requesterId: user1Id, receiverId: user2Id },
                        { requesterId: user2Id, receiverId: user1Id },
                    ],
                },
            });
        });
    }

    async listFriends(userId: string) {
        return prisma.friendship.findMany({
            where: {
                requesterId: userId,
                status: FriendshipStatus.ACCEPTED,
            },
            include: {
                receiver: {
                    select: {
                        id: true,
                        name: true,
                        profilePicUrl: true,
                        // Add more fields if needed
                    },
                },
            },
        });
    }

    async listPendingRequests(userId: string) {
        return prisma.friendship.findMany({
            where: {
                receiverId: userId,
                status: FriendshipStatus.PENDING,
            },
            include: {
                requester: {
                    select: {
                        id: true,
                        name: true,
                        profilePicUrl: true,
                    },
                },
            },
        });
    }

    async checkFriendshipStatus(user1Id: string, user2Id: string): Promise<FriendshipStatus | null> {
        const friendship = await prisma.friendship.findFirst({
            where: {
                requesterId: user1Id,
                receiverId: user2Id
            },
            select: { status: true }
        });
        return friendship ? friendship.status : null;
    }
}
