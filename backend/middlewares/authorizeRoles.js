const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          message: "Access denied. You are not authorized to perform this action.",
          error: true
        });
      }
      next();
    } catch (error) {
      res.status(500).json({ message: "Authorization error", error: true });
    }
  };
};

module.exports = authorizeRoles;
