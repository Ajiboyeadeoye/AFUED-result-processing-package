import { dataMaps } from '../../config/dataMap.js';
import fetchDataHelper from '../../utils/fetchDataHelper.js';
import announcementModel from './announcement.model.js';

// @desc    Get all announcements with filtering
// @route   GET /api/announcements
// @access  Public
const getAnnouncements = async (req, res) => {
    const fetchConfig = {
        configMap: dataMaps.Announcement,
        autoPopulate: true,
        models: { announcementModel },
        populate: ["createdBy"],
    };

    let result = await fetchDataHelper(req, res, announcementModel, fetchConfig);
    return result;
};

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Public
const getAnnouncement = async (req, res) => {
    const announcement = await announcementModel
        .findOne({
            _id: req.params.id,
            isActive: true,
            expiresAt: { $gt: new Date() }
        })
        .populate('createdBy', 'name email');

    if (!announcement) {
        res.status(404);
        throw new Error('Announcement not found');
    }

    res.json({
        success: true,
        data: announcement
    });
};

// @desc    Create new announcement
// @route   POST /api/announcements
// @access  Private/Admin
const createAnnouncement = async (req, res) => {
    const {
        title,
        description,
        content,
        category,
        priority,
        image,
        expiresAt,
        targetAudience,
        tags,

        fields, search_term, filters, page,
    } = req.body;

    // 🔍 If this is a list/filter request, handle early
    if (fields || search_term || filters || page) {
        return getAnnouncements(req, res)
    }
    const { _id } = req.user;
    if (!title || !description || !content || !category || !image || !expiresAt) {
        res.status(400);
        throw new Error('Please fill all required fields');
    }

    if (new Date(expiresAt) <= new Date()) {
        res.status(400);
        throw new Error('Expiration date must be in the future');
    }

    const announcement = await announcementModel.create({
        title,
        description,
        content,
        category,
        priority: priority || 'medium',
        image,
        expiresAt,
        targetAudience: targetAudience || ['all'],
        tags: tags || [],
        createdBy: req.user._id
    });

    const populatedAnnouncement = await announcementModel
        .findById(announcement._id)
        .populate('createdBy', 'name email');

    res.status(201).json({
        success: true,
        data: populatedAnnouncement
    });
};

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin
const updateAnnouncement = async (req, res) => {
    let announcement = await announcementModel.findById(req.params.id);

    if (!announcement) {
        res.status(404);
        throw new Error('Announcement not found');
    }

    if (announcement.createdBy.toString() !== req.user.id && !req.user.isAdmin) {
        res.status(403);
        throw new Error('Not authorized to update this announcement');
    }

    announcement = await announcementModel
        .findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        })
        .populate('createdBy', 'name email');

    res.json({
        success: true,
        data: announcement
    });
};

// @desc    Delete announcement (soft delete)
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
const deleteAnnouncement = async (req, res) => {
    const announcement = await announcementModel.findById(req.params.id);

    if (!announcement) {
        res.status(404);
        throw new Error('Announcement not found');
    }


    await announcement.deleteOne();


    res.json({
        success: true,
        message: 'Announcement deleted successfully'
    });
};

// @desc    Get announcement categories
// @route   GET /api/announcements/categories
// @access  Public
const getCategories = async (req, res) => {
    const categories = await announcementModel.distinct('category', {
        isActive: true,
        expiresAt: { $gt: new Date() }
    });

    res.json({
        success: true,
        data: ['all', ...categories]
    });
};

export {
    getAnnouncements,
    getAnnouncement,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getCategories
};
