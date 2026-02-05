import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
export const verifyUser = (...allowedRoles) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Token format is invalid" });
    }

    try {
      const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
      if (!secret) {
        return res.status(500).json({
          message:
            "Server misconfiguration: JWT secret is not set. Configure JWT_SECRET (recommended) or JWT_SECRET_KEY.",
        });
      }

      const decoded = jwt.verify(token, secret);
      req.user = decoded;

      if (
        allowedRoles.length &&
        !allowedRoles.includes("ANY") &&
        !allowedRoles.includes(req.user?.role) &&
        !allowedRoles.includes(req.user?.type)
      ) {
        return res
          .status(403)
          .json({ message: "Access denied. Insufficient permission." });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  };
};
