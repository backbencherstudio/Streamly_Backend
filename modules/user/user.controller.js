import { OAuth2Client } from "google-auth-library";

import dotenv from "dotenv";
import validator from "validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import {
  generateOTP,
  receiveEmails,
  sendForgotPasswordOTP,
  sendRegistrationOTPEmail,
} from "../../utils/mailService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";

const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hash user password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(8);
  return await bcrypt.hash(password, salt);
};

//--------------------register user--------------------
// Register a new user
export const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }
    const hashedPassword = await hashPassword(password);
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("Error in registerUser:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
//login route
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const missingField = ["email", "password"].find(
      (field) => !req.body[field]
    );
    if (missingField) {
      return res.status(400).json({
        message: `${missingField} is required!`,
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.status === "deactivated") {
      return res.status(403).json({
        message: "Your account is deactivated. Please activate your account.",
      });
    }

    if (user.type == "ADMIN") {
      return res.status(403).json({
        message: "ADMIN YOU MUST LOG IN FROM ADMIN PANEL",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, type: user.type },
      process.env.JWT_SECRET,
      { expiresIn: "100d" }
    );

    console.log("Token expires at:", token);

    if (user.status === "deactivated") {
      return res.status(403).json({
        message: "Your account is deactivated. Please activate your account.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

//---------------------forgot password--------------------
// Forgot password OTP send
export const forgotPasswordOTPsend = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingTempUser = await prisma.temp.findUnique({
      where: { email },
    });

    if (existingTempUser) {
      if (new Date() > new Date(existingTempUser.expires_at)) {
        await prisma.temp.delete({ where: { email } });

        const otp = generateOTP();
        await prisma.temp.create({
          data: {
            email,
            otp,
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
          },
        });

        sendForgotPasswordOTP(email, otp);

        return res.status(200).json({
          message: "OTP expired. A new OTP has been sent to your email.",
        });
      }

      return res.status(400).json({
        message:
          "An OTP has already been sent to this email. Please check your inbox or wait for expiration.",
        shouldResendOtp: false,
      });
    }

    const otp = generateOTP();

    await prisma.temp.create({
      data: {
        email,
        otp,
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    sendForgotPasswordOTP(email, otp);

    return res.status(200).json({
      message:
        "OTP sent successfully to your email. Please verify it to continue.",
    });
  } catch (error) {
    console.error("Error in sendForgotPasswordOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// Match forgot password OTP
export const verifyForgotPasswordOTP = async (req, res) => {
  try {
    const { otp, email } = req.body;

    if (!otp || !email) {
      return res.status(400).json({ message: "OTP and email are required" });
    }

    const existingTempUser = await prisma.temp.findUnique({
      where: { email },
    });

    if (!existingTempUser) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    if (new Date() > new Date(existingTempUser.expires_at)) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
        shouldResendOtp: true,
        ucodeId: existingTempUser.id,
      });
    }

    if (existingTempUser.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const jwtToken = jwt.sign(
      {
        userId: existingTempUser.id,
        email: existingTempUser.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "10d" }
    );

    await prisma.temp.delete({
      where: { id: existingTempUser.id },
    });

    return res.status(200).json({
      success: true,
      message: "OTP matched successfully. You can now reset your password.",
      token: jwtToken,
    });
  } catch (error) {
    console.error("Error in verifyForgotPasswordOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
      return res
        .status(400)
        .json({ message: "Authorization token is required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const { email } = decoded;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
      },
    });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//---------------------user profile--------------------
// Check if user is authenticated
export const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    req.user = decoded; // Add user data to req.user
    next();
  });
};
//update user image
export const updateImage = async (req, res) => {
  console.log("Image upload: ", req.file);

  try {
    const id = req.user?.userId;
    const newImage = req.file;

    if (!newImage) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: id },
    });

    if (!existingUser) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", newImage.filename));
      return res.status(404).json({ message: "User not found" });
    }

    if (existingUser.avatar) {
      const oldImagePath = path.join(
        __dirname,
        "../../uploads",
        existingUser.avatar
      );
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const user = await prisma.user.update({
      where: { id: id },
      data: {
        avatar: newImage.filename,
      },
    });

    const imageUrl = `http://localhost:4005/uploads/${newImage.filename}`;

    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
      data: { ...user, imageUrl },
    });
  } catch (error) {
    console.error("Error during image upload:", error);

    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

//update user details
export const updateUserDetails = async (req, res) => {
  try {
    const {
      name,
      email,
      dateOfBirth,
      address,
      country,
      city,
      state,
      postalCode,
      language,
      phone,
      bio,
    } = req.body;
    const id = req.user?.userId;

    if (!id) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const user = await prisma.user.update({
      where: { id: id },
      data: {
        name: name,
        email: email,
        dateOfBirth: dateOfBirth,
        address: address,
        country: country,
        city: city,
        state: state,
        postalCode: postalCode,
        language: language,
        phone: phone,
        bio: bio,
      },
    });

    return res.status(200).json({
      success: true,
      message: "User details updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error updating user details:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "User not found" });
    }
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

//change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new passwords are required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId, type: "USER" },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashedNewPassword = await hashPassword(newPassword);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
      },
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
//send mail to admin
export const sendMailToAdmin = async (req, res) => {
  try {
    const { subject, message } = req.body;

    const user_email = req.user?.email;
    const userId = req.user?.userId;

    if (!user_email || !userId) {
      return res.status(400).json({ message: "User email or ID is missing" });
    }

    const user = await prisma.user.findUnique({
      where: { email: user_email, id: userId, type: "USER" },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!isEmail(user_email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const token = Math.floor(10000000 + Math.random() * 90000000).toString(); // Generate a random 8-digit token

    const mail = await prisma.mail.create({
      data: {
        user_id: userId,
        user_email,
        user_name: user.name,
        subject,
        message,
        token: token,
      },
    });

    receiveEmails(user_email, subject, message);

    return res.status(200).json({
      success: true,
      message: "Mail sent to admin successfully",
      data: mail,
    });
  } catch (error) {
    console.error("Error sending mail to admin:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
//get me
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const imageUrl = user.avatar
      ? `http://localhost:4005/uploads/${user.avatar}`
      : null;

    return res.status(200).json({
      success: true,
      message: "User details retrieved successfully",
      data: { ...user, imageUrl },
    });
  } catch (error) {
    console.error("Error retrieving user details:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// Google login via ID token from frontend
export const googleLogin = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: "ID token is required" });
  }

  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  try {
    // Verify the ID Token with Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    console.log("Google Token Payload:", payload); // Log the payload for debugging

    // Check if email exists in the payload
    const email = payload.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is missing from the Google token payload",
      });
    }
    const name = payload.name;
    const avatar = payload.picture;

    // Check if the user already exists in the database
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create new user if they do not exist
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar,
          password: "", // No password needed for Google login
        },
      });
    } else {
      // Update user information if necessary
      user = await prisma.user.update({
        where: { email },
        data: { name, avatar },
      });
    }

    // Issue a JWT token for the session
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        type: user.type,
        googleId: payload.sub,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Send back the success response with user data and token
    return res.status(200).json({
      success: true,
      message: "Google login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      token,
    });
  } catch (error) {
    // Return an error response if something goes wrong
    return res.status(401).json({
      success: false,
      message: "Invalid Google token",
      error: error.message,
    });
  }
};
