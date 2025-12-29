import express from 'express';
import { getPasswordStatus, changeUserPassword } from './auth.service.js';
import authenticate from '../../middlewares/authenticate.js';

const router = express.Router();

// Get password status (protected route)
router.get('/:userId/password-status', authenticate(), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own password status
    if (req.user._id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: "Unauthorized: You can only view your own password status" 
      });
    }
    
    const passwordStatus = await getPasswordStatus(userId);
    res.status(200).json(passwordStatus);
  } catch (error) {
    console.error("Error fetching password status:", error);
    res.status(500).json({ error: error.message });
  }
});

// Change password (protected route)
router.put('/password', authenticate(), async (req, res) => {
  try {
    const userId = req.user._id
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: "Both currentPassword and newPassword are required" 
      });
    }
    
    // Ensure user can only change their own password
    if (req.user._id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: "Unauthorized: You can only change your own password" 
      });
    }
    
    const result = await changeUserPassword(userId, currentPassword, newPassword);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(400).json({ error: error.message });
  }
});

// Admin endpoint to force password reset
router.post('/:userId/force-password-reset', authenticate(), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only admins can force password reset
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: "Unauthorized: Only admins can force password reset" 
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Set password expiry to force change on next login
    user.passwordExpiryDays = 0; // Immediate expiry
    await user.save();
    
    res.status(200).json({ 
      message: "Password reset forced successfully. User will need to change password on next login.",
      userId 
    });
  } catch (error) {
    console.error("Error forcing password reset:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;