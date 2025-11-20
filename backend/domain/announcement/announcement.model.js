import { Schema, model } from 'mongoose';

const announcementSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ['Academic', 'Financial', 'Event', 'Accommodation'],
      message: 'Category must be Academic, Financial, Event, or Accommodation'
    }
  },
  priority: {
    type: String,
    required: [true, 'Priority is required'],
    enum: {
      values: ['low', 'medium', 'high'],
      message: 'Priority must be low, medium, or high'
    },
    default: 'medium'
  },
  image: {
    type: String,
    required: [true, 'Image URL is required']
  },
  date: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  targetAudience: {
    type: [String],
    enum: ['all', 'undergraduate', 'postgraduate', 'international', 'domestic'],
    default: ['all']
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Index for better query performance
announcementSchema.index({ category: 1, isActive: 1, date: -1 });
announcementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
announcementSchema.index({ isActive: 1, date: -1 });

// Virtual for checking if announcement is expired
announcementSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Method to check if announcement is viewable
announcementSchema.methods.isViewable = function() {
  return this.isActive && !this.isExpired;
};

// Static method to get active announcements by category
announcementSchema.statics.getActiveByCategory = function(category = 'all') {
  const query = { 
    isActive: true, 
    expiresAt: { $gt: new Date() } 
  };
  
  if (category !== 'all') {
    query.category = category;
  }
  
  return this.find(query)
    .sort({ date: -1, priority: -1 })
    .populate('createdBy', 'name email');
};

export default model('Announcement', announcementSchema);