import { Router } from 'express';
const router = Router();
import {  updateAnnouncement, deleteAnnouncement, getCategories, getAnnouncement, createAnnouncement, getAnnouncements } from './annoucement.controller.js';

// Import middleware
import authenticate from '../../middlewares/authenticate.js';

// Public routes
router.get('/', getAnnouncements);
router.get('/categories', getCategories);
router.get('/:id', getAnnouncement);

// Admin only routes
router.post('/', authenticate(['admin', 'instructor']), createAnnouncement);
router.put('/:id', authenticate(['admin', 'instructor']), updateAnnouncement);
router.delete('/:id', authenticate('admin'), deleteAnnouncement);

export default router;