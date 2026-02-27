import express from 'express';
import { FriendController } from '../controllers/FriendController';
import { verifyToken } from '../middlewares/verifyToken';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

router.post('/request/:userId', FriendController.sendRequest);
router.post('/accept/:friendshipId', FriendController.acceptRequest);
router.post('/reject/:friendshipId', FriendController.rejectRequest);
router.delete('/:friendshipId', FriendController.removeFriend);
router.get('/', FriendController.listFriends);
router.get('/requests', FriendController.listRequests);

export default router;
