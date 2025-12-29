// Add to your existing authService.js file

import { hashData, verifyHashedData } from "../../utils/hashData.js";
import Admin from "../admin/admin.model.js";
import lecturerModel from "../lecturer/lecturer.model.js";
import studentModel from "../student/student.model.js";
import User from "../user/user.model.js";

/**
 * Change user password with validation and history tracking
 */
export const changeUserPassword = async (userId, currentPassword, newPassword) => {
  try {
    console.log(`🔐 Changing password for user: ${userId}`);

    // 1. Find the user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // 2. Verify current password
    const isCurrentPasswordValid = await verifyHashedData(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      // Check if user is using default password pattern
      const userDetails = await getUserDetailsByRole(userId, user.role);
      const defaultPasswordPattern = `AFUED@${userDetails?.staff_id || userDetails?.matric_no || ''}`;
      
      if (currentPassword !== defaultPasswordPattern && 
          currentPassword !== (userDetails?.staff_id || userDetails?.matric_no)) {
        throw new Error("Current password is incorrect");
      }
    }

    // 3. Check if new password is different from current
    const isSameAsCurrent = await verifyHashedData(newPassword, user.password);
    if (isSameAsCurrent) {
      throw new Error("New password cannot be the same as current password");
    }

    // 4. Check password history (prevent reuse of last 3 passwords)
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      const recentPasswords = user.passwordHistory
        .slice(-3) // Get last 3 passwords
        .map(item => item.password);
      
      for (const oldPassword of recentPasswords) {
        const isReused = await verifyHashedData(newPassword, oldPassword);
        if (isReused) {
          throw new Error("Cannot reuse a previous password. Please choose a new one.");
        }
      }
    }

    // 5. Validate password strength
    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    // 6. Hash the new password
    const hashedNewPassword = await hashData(newPassword);

    // 7. Update user with new password and track history
    user.password = hashedNewPassword;
    user.lastPasswordChange = Date.now();
    
    // Add to password history (keep last 5 passwords)
    user.passwordHistory.push({
      password: hashedNewPassword,
      changedAt: Date.now()
    });
    
    // Limit history to last 5 passwords
    if (user.passwordHistory.length > 5) {
      user.passwordHistory = user.passwordHistory.slice(-5);
    }

    await user.save();

    console.log("✅ Password changed successfully");

    return {
      success: true,
      message: "Password changed successfully",
      lastPasswordChange: user.lastPasswordChange,
      passwordAgeDays: 0 // Reset to 0 since just changed
    };

  } catch (error) {
    console.error("❌ Password change error:", error.message);
    throw error;
  }
};

/**
 * Helper function to get user details based on role
 */
const getUserDetailsByRole = async (userId, role) => {
  switch (role.toLowerCase()) {
    case 'admin':
      return await Admin.findById(userId);
    case 'lecturer':
      return await lecturerModel.findById(userId);
    case 'student':
      return await studentModel.findById(userId);
    default:
      return null;
  }
};

/**
 * Get password status for a user
 */
export const getPasswordStatus = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const passwordAgeDays = Math.floor(
      (Date.now() - new Date(user.lastPasswordChange).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const daysRemaining = user.passwordExpiryDays - passwordAgeDays;
    const expiryDate = new Date(user.lastPasswordChange);
    expiryDate.setDate(expiryDate.getDate() + user.passwordExpiryDays);

    // Determine password strength (you can enhance this logic)
    let passwordStrength = "medium";
    if (user.password) {
      // Simple strength check - enhance as needed
      const hasUpperCase = /[A-Z]/.test(user.password);
      const hasLowerCase = /[a-z]/.test(user.password);
      const hasNumbers = /\d/.test(user.password);
      const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(user.password);
      
      const strengthScore = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars]
        .filter(Boolean).length;
      
      if (strengthScore >= 4) passwordStrength = "strong";
      else if (strengthScore <= 2) passwordStrength = "weak";
    }

    // Determine urgency
    let urgency = "none";
    if (daysRemaining <= 0) urgency = "critical";
    else if (daysRemaining <= 7) urgency = "high";
    else if (daysRemaining <= 30) urgency = "medium";
    else if (passwordStrength === "weak") urgency = "low";

    return {
      passwordAgeDays,
      passwordExpiryDays: user.passwordExpiryDays,
      daysRemaining,
      expiryDate,
      lastPasswordChange: user.lastPasswordChange,
      passwordStrength,
      urgency,
      needsChange: urgency !== "none" || passwordStrength === "weak",
      message: getPasswordMessage(urgency, passwordStrength, daysRemaining)
    };
  } catch (error) {
    console.error("❌ Error getting password status:", error);
    throw error;
  }
};

const getPasswordMessage = (urgency, strength, daysRemaining) => {
  if (urgency === "critical") return "Password has expired! Change immediately.";
  if (urgency === "high") return `Password expires in ${daysRemaining} days`;
  if (urgency === "medium") return "Consider changing your password soon";
  if (strength === "weak") return "Weak password detected. Consider strengthening.";
  return "Password is secure";
};