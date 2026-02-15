import dotenv from "dotenv";
import validator from "validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { userIdSocketMap } from "../../utils/notificationService.js";
import {
  generateOTP,
  receiveEmails,
  sendForgotPasswordOTP,
  sendRegistrationOTPEmail,
} from "../../utils/mailService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import passport from "../../config/passport.js"; // Import the configured passport instance
import {
  sendNotification,
  sendWelcomeNotification,
} from "../../utils/notificationService.js";
import { s3 } from "../libs/s3Clinent.js";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildPublicS3Url = ({ bucket, key }) => {
  if (!bucket || !key) return null;

  const endpoint = process.env.AWS_S3_ENDPOINT;
  const region = process.env.AWS_REGION || "us-east-1";
  if (endpoint) {
    const trimmed = String(endpoint).replace(/\/$/, "");
    return `${trimmed}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const resolveAvatarUrl = (avatarValue) => {
  if (!avatarValue) return null;

  // If already a URL, return as-is
  if (typeof avatarValue === "string" && /^https?:\/\//i.test(avatarValue)) {
    return avatarValue;
  }

  // If it's an S3 key-like value (we store key in DB), build public URL
  if (typeof avatarValue === "string" && avatarValue.includes("/")) {
    const bucket = process.env.AWS_S3_BUCKET;
    return buildPublicS3Url({ bucket, key: avatarValue });
  }

  // Legacy local filename
  return `http://localhost:4005/uploads/${avatarValue}`;
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "JWT secret is not configured. Set JWT_SECRET (recommended) or JWT_SECRET_KEY in your environment.",
    );
  }
  return secret;
};

// Hash user password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(8);
  return await bcrypt.hash(password, salt);
};

//get me
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      console.log("Authentication failed. User ID is undefined:", req.user); // Log user info for debugging
      return res.status(400).json({ message: "User not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        date_of_birth: true,
        phone_number: true,
        city: true,
        postal_code: true,
        bio: true,
        address: true,
        country: true,
        state: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const imageUrl = resolveAvatarUrl(user.avatar);

    return res.status(200).json({
      success: true,
      message: "User details retrieved successfully",
      data: { ...user, imageUrl },
    });
  } catch (error) {
    // Log the error to help with debugging
    console.error("Error retrieving user details:", error);

    // Return a generic error response
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

//--------------------register user--------------------
// Register a new user
// export const registerUser = async (req, res) => {
//   try {
//     const { email, password, name } = req.body;

//     // Input validation
//     if (!email || !password || !name) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     if (!isEmail(email)) {
//       return res.status(400).json({ message: "Invalid email format" });
//     }

//     if (password.length < 8) {
//       return res
//         .status(400)
//         .json({ message: "Password must be at least 8 characters long" });
//     }

//     if (name.length < 3) {
//       return res
//         .status(400)
//         .json({ message: "Name must be at least 3 characters long" });
//     }

//     // Check if user already exists
//     const existingUser = await prisma.user.findUnique({
//       where: { email },
//     });
//     if (existingUser) {
//       return res.status(400).json({ message: "Email already registered" });
//     }

//     // Hash password and create new user
//     // const hashedPassword = await hashPassword(password);
//     // const newUser = await prisma.user.create({
//     //   data: {
//     //     email,
//     //     password: hashedPassword,
//     //     name,
//     //   },
//     // });

//     // otp generation and sending mail
//     const existingTempUser = await prisma.temp.findUnique({
//       where: { email },
//     });

//     if (existingTempUser) {
//       if (new Date() > new Date(existingTempUser.expires_at)) {
//         await prisma.temp.delete({ where: { email } });

//         const otp = generateOTP();
//         await prisma.temp.create({
//           data: {
//             email,
//             otp,
//             expires_at: new Date(Date.now() + 15 * 60 * 1000),
//           },
//         });

//         sendRegistrationOTPEmail(email, otp);

//         return res.status(200).json({
//           message: "OTP expired. A new OTP has been sent to your email.",
//         });
//       }

//       return res.status(400).json({
//         message:
//           "An OTP has already been sent to this email. Please check your inbox or wait for expiration.",
//         shouldResendOtp: false,
//       });
//     }

//     const otp = generateOTP();

//     await prisma.temp.create({
//       data: {
//         email,
//         otp,
//         expires_at: new Date(Date.now() + 15 * 60 * 1000),
//       },
//     });

//     sendRegistrationOTPEmail(email, otp);

//     return res.status(201).json({
//       success: true,
//       message: "User registered successfully",
//     });
//   } catch (error) {
//     console.error("Error in registerUser:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };
export const registerUser = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    if (name.length < 3) {
      return res.status(400).json({
        message: "Name must be at least 3 characters long",
      });
    }

    // Check existing user
    const existingUser = await prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const existingTemp = await prisma.temp.findUnique({ where: { email } });
    if (
      existingTemp &&
      existingTemp.type === "REGISTER" &&
      new Date() < new Date(existingTemp.expires_at)
    ) {
      return res.status(400).json({
        message: "OTP already sent. Please wait before requesting again.",
      });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let otp;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        otp = generateOTP();
        await prisma.temp.upsert({
          where: { email },
          create: {
            email,
            password, // store raw OR hashed (better: hash here)
            name,
            otp,
            type: "REGISTER",
            expires_at: expiresAt,
            is_verified: 0,
          },
          update: {
            password,
            name,
            otp,
            type: "REGISTER",
            expires_at: expiresAt,
            is_verified: 0,
          },
        });
        break;
      } catch (e) {
        if (e?.code === "P2002" && e?.meta?.target?.includes("otp")) {
          continue;
        }
        throw e;
      }
    }

    if (!otp) {
      return res.status(500).json({ message: "Failed to generate OTP" });
    }

    await sendRegistrationOTPEmail(email, otp);

    return res.status(200).json({
      success: true,
      message:
        "OTP sent successfully to your email. Please verify it to complete registration.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const verifyRegisterOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const tempUser = await prisma.temp.findFirst({
      where: { email, type: "REGISTER" },
    });

    if (!tempUser) {
      return res.status(400).json({ message: "Invalid request" });
    }

    if (new Date() > new Date(tempUser.expires_at)) {
      return res.status(400).json({ message: "OTP expired" });
    }

    if (tempUser.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const hashedPassword = await hashPassword(tempUser.password);

    const newUser = await prisma.user.create({
      data: {
        email: tempUser.email,
        password: hashedPassword,
        name: tempUser.name,
        email_verified: true,
      },
    });

    await prisma.temp.delete({ where: { id: tempUser.id } });

    await sendWelcomeNotification(newUser.id);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: newUser,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ======================= login route ========================
export const loginUser = async (req, res) => {
  try {
    const { email, password, deviceToken, deviceOS, deviceType, deviceName } =
      req.body;

    const missingField = ["email", "password"].find(
      (field) => !req.body[field],
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
        message: "deactivated",
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message:
          "Your account is suspended. Please contact support for assistance.",
      });
    }

    const isAdminUser =
      String(user.role || "").toLowerCase() === "admin" ||
      String(user.type || "").toLowerCase() === "admin";

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    if (!isAdminUser) {
      // Enforce device limit only when user has an active subscription (viewer or creator)
      const [activeViewerSub, activeCreatorSub] = await Promise.all([
        prisma.subscription.findFirst({
          where: { user_id: user.id, status: "active" },
          select: { id: true },
        }),
        prisma.creatorSubscription.findFirst({
          where: { user_id: user.id, status: "active" },
          select: { id: true },
        }),
      ]);

      const hasActiveSubscription = Boolean(
        activeViewerSub || activeCreatorSub,
      );
      const maxDevices = 3;

      if (hasActiveSubscription && !deviceToken) {
        return res.status(400).json({
          message: "deviceToken is required for subscribed users",
          code: "DEVICE_TOKEN_REQUIRED",
        });
      }

      if (deviceToken) {
        const tokenValue = String(deviceToken).trim();

        const existingToken = await prisma.deviceToken.findUnique({
          where: { token: tokenValue },
          select: { id: true, user_id: true },
        });

        // Prevent reusing the same device token across multiple users
        // if (existingToken && existingToken.user_id !== user.id) {
        //   return res.status(409).json({
        //     message: "This device is already linked to another account",
        //     code: "DEVICE_TOKEN_IN_USE",
        //   });
        // }

        if (hasActiveSubscription) {
          const userDeviceCount = await prisma.deviceToken.count({
            where: { user_id: user.id },
          });

          const isKnownDevice = Boolean(existingToken);

          if (!isKnownDevice && userDeviceCount >= maxDevices) {
            return res.status(403).json({
              message: `Device limit reached. Max ${maxDevices} devices per subscription.`,
              code: "DEVICE_LIMIT_REACHED",
              maxDevices,
              currentDevices: userDeviceCount,
            });
          }
        }

        // Save or update device token (do NOT reassign to other users)
        if (existingToken) {
          await prisma.deviceToken.update({
            where: { token: tokenValue },
            data: {
              device_os: deviceOS,
              device_type: deviceType,
              device_name: deviceName,
            },
          });
        } else {
          await prisma.deviceToken.create({
            data: {
              user_id: user.id,
              token: tokenValue,
              device_os: deviceOS,
              device_type: deviceType,
              device_name: deviceName,
            },
          });
        }
      }
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, type: user.type },
      getJwtSecret(),
      { expiresIn: "30d" },
    );

    if (user.status === "deactivated") {
      return res.status(403).json({
        message: "Your account is deactivated. Please activate your account.",
      });
    }

    //connect user to socket
    await sendNotification(user.id, "You have successfully logged in.");

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        role: user.role,
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

    const existingTempUser = await prisma.temp.findUnique({ where: { email } });

    if (
      existingTempUser &&
      existingTempUser.type === "FORGOT" &&
      new Date() <= new Date(existingTempUser.expires_at)
    ) {
      return res.status(400).json({
        message:
          "An OTP has already been sent to this email. Please check your inbox or wait for expiration.",
        shouldResendOtp: false,
      });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let otp;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        otp = generateOTP();
        await prisma.temp.upsert({
          where: { email },
          create: {
            email,
            otp,
            type: "FORGOT",
            expires_at: expiresAt,
            is_verified: 0,
            password: null,
            name: null,
          },
          update: {
            otp,
            type: "FORGOT",
            expires_at: expiresAt,
            is_verified: 0,
            password: null,
            name: null,
          },
        });
        break;
      } catch (e) {
        if (e?.code === "P2002" && e?.meta?.target?.includes("otp")) {
          continue;
        }
        throw e;
      }
    }

    if (!otp) {
      return res.status(500).json({ message: "Failed to generate OTP" });
    }

    sendForgotPasswordOTP(email, otp);

    if (existingTempUser && existingTempUser.type === "FORGOT") {
      return res.status(200).json({
        message: "OTP expired. A new OTP has been sent to your email.",
      });
    }

    return res.status(200).json({
      message:
        "OTP sent successfully to your email. Please verify it to continue.",
    });
  } catch (error) {
    console.error("Error in sendForgotPasswordOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Resent OTP
export const resendOTP = async (req, res) => {
  try {
    const { email, type } = req.body;

    if (!email || !type) {
      return res.status(400).json({ message: "Email and type are required" });
    }

    // const user = await prisma.user.findUnique({
    //   where: { email },
    // });
    // if (!user) {
    //   return res.status(404).json({ message: "User not found" });
    // }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let otp;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        otp = generateOTP();
        await prisma.temp.upsert({
          where: { email },
          create: {
            email,
            otp,
            type,
            expires_at: expiresAt,
            is_verified: 0,
          },
          update: {
            otp,
            type,
            expires_at: expiresAt,
            is_verified: 0,
          },
        });
        break;
      } catch (e) {
        if (e?.code === "P2002" && e?.meta?.target?.includes("otp")) {
          continue;
        }
        throw e;
      }
    }

    if (!otp) {
      return res.status(500).json({ message: "Failed to generate OTP" });
    }

    if (type === "REGISTER") {
      await sendRegistrationOTPEmail(email, otp);
    } else if (type === "FORGOT") {
      await sendForgotPasswordOTP(email, otp);
    } else {
      return res.status(400).json({ message: "Invalid type value" });
    }

    return res.status(200).json({
      message: "OTP resent successfully to your email.",
    });
  } catch (error) {
    console.error("Error in resendOTP:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Match forgot password OTP
export const verifyForgotPasswordOTP = async (req, res) => {
  const { otp, email } = req.body;

  if (!otp || !email) {
    return res.status(400).json({ message: "OTP and email are required" });
  }

  const existingTempUser = await prisma.temp.findFirst({
    where: { email, type: "FORGOT" },
  });

  if (!existingTempUser) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  if (new Date() > new Date(existingTempUser.expires_at)) {
    return res.status(400).json({
      message: "OTP expired. Please request a new OTP.",
    });
  }

  if (existingTempUser.otp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  try {
    const jwtToken = jwt.sign(
      { email: existingTempUser.email },
      getJwtSecret(),
      { expiresIn: "1h" },
    );

    await prisma.temp.delete({ where: { id: existingTempUser.id } });

    return res.status(200).json({
      message:
        "OTP matched successfully. Use the token to reset your password.",
      token: jwtToken,
    });
  } catch (error) {
    console.error("Error creating forgot-password token:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long" });
  }

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(400).json({ message: "Authorization token is required" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
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
  const isOldPasswordCorrect = await bcrypt.compare(newPassword, user.password);
  if (isOldPasswordCorrect) {
    return res
      .status(400)
      .json({ message: "New password cannot be the same as the old password" });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  return res.status(200).json({ message: "Password reset successfully" });
};

//---------------------user profile--------------------
// Check if user is authenticated
export const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (error) {
    return res.status(500).json({
      message: "Server misconfiguration",
      error: error instanceof Error ? error.message : "JWT secret missing",
    });
  }

  jwt.verify(token, secret, (err, decoded) => {
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

    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      // Clean up local temp
      try {
        fs.unlinkSync(newImage.path);
      } catch {
        // ignore
      }

      return res.status(500).json({
        success: false,
        message: "Server misconfiguration: AWS_S3_BUCKET is not set",
      });
    }

    // Upload avatar to S3
    const ext = path.extname(newImage.originalname || "");
    const key = `avatars/users/${id}/${randomUUID()}${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(newImage.path),
        ContentType: newImage.mimetype,
      }),
    );

    // Best-effort cleanup of local file after successful upload
    try {
      fs.unlinkSync(newImage.path);
    } catch {
      // ignore
    }

    // Best-effort delete old avatar if it was stored as an S3 key
    if (existingUser.avatar && typeof existingUser.avatar === "string") {
      const oldAvatar = existingUser.avatar;

      // Delete old local file if legacy filename
      if (!oldAvatar.includes("/") && !/^https?:\/\//i.test(oldAvatar)) {
        const oldImagePath = path.join(__dirname, "../../uploads", oldAvatar);
        if (fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath);
          } catch {
            // ignore
          }
        }
      }

      // Delete from S3 if it looks like an S3 key we stored
      if (oldAvatar.includes("/")) {
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: oldAvatar,
            }),
          );
        } catch (deleteErr) {
          console.warn(
            "[updateImage] failed to delete old S3 avatar:",
            deleteErr,
          );
        }
      }
    }

    const user = await prisma.user.update({
      where: { id: id },
      data: {
        // Store S3 key in DB (so we can delete later)
        avatar: key,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
      },
    });

    const imageUrl = buildPublicS3Url({ bucket, key });

    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
      data: {
        user,
        avatar_key: key,
        avatar_url: imageUrl,
        bucket,
        region: process.env.AWS_REGION || null,
      },
    });
  } catch (error) {
    console.error("Error during image upload:", error);

    if (req.file) {
      // Multer provides `path` for disk storage; best-effort cleanup
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore
      }
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
      date_of_birth,
      address,
      country,
      city,
      state,
      postal_code,
      phone_number,
      bio,
    } = req.body;

    const id = req.user?.userId;

    if (!id) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    let parsedDob = null;
    if (date_of_birth === undefined) {
      parsedDob = undefined;
    } else if (date_of_birth === "" || date_of_birth === null) {
      parsedDob = null;
    } else if (typeof date_of_birth === "string") {
      const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(date_of_birth);
      const candidate = dateOnlyMatch
        ? new Date(`${date_of_birth}T00:00:00.000Z`)
        : new Date(date_of_birth);

      if (Number.isNaN(candidate.getTime())) {
        return res.status(400).json({
          message:
            "Invalid date_of_birth. Use ISO format like YYYY-MM-DD (recommended) or full ISO datetime.",
        });
      }

      parsedDob = candidate;
    } else {
      return res.status(400).json({
        message:
          "Invalid date_of_birth. Use ISO format like YYYY-MM-DD (recommended) or full ISO datetime.",
      });
    }

    const user = await prisma.user.update({
      where: { id: id },
      data: {
        name: name,
        date_of_birth: parsedDob,
        address: address,
        country: country,
        city: city,
        state: state,
        postal_code: postal_code,
        phone_number: phone_number,
        bio: bio,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        date_of_birth: true,
        phone_number: true,
        city: true,
        state: true,
        country: true,
        postal_code: true,
        address: true,
        bio: true,
        updated_at: true,
      },
    });

    const imageUrl = resolveAvatarUrl(user.avatar);

    const dateOfBirthIso = user.date_of_birth
      ? new Date(user.date_of_birth).toISOString().slice(0, 10)
      : null;

    return res.status(200).json({
      success: true,
      message: "User details updated successfully",
      data: {
        ...user,
        date_of_birth: dateOfBirthIso,
        imageUrl,
      },
    });
  } catch (error) {
    console.error("Error updating user details:", error);

    if (error.code === "P2025") {
      return res.status(404).json({ message: "User not found" });
    }

    if (error.code === "P2002") {
      return res.status(409).json({
        message: "Email already in use",
      });
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
      GoogleStrategy;
      return res.status(404).json({ message: "User not found" });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
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

//----------- google login via using passport js ------------------
export const googleLogin = (req, res) => {
  const data = passport.authenticate("google", { scope: ["profile", "email"] })(
    req,
    res,
  );
};
export const googleCallback = (req, res) => {
  passport.authenticate(
    "google",
    { failureRedirect: "/login" },
    async (err, userInfo) => {
      if (err || !userInfo) {
        console.error("Authentication Error: ", err);
        return res
          .status(500)
          .json({ message: "Google authentication failed", error: err });
      }

      const { user, token } = userInfo;
      // console.log("Authenticated user:", user);
      // console.log("User token:", token);

      if (!user || !user.id) {
        return res
          .status(400)
          .json({ message: "User not found after authentication" });
      }

      // Sign JWT token
      const signedToken = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        getJwtSecret(),
        { expiresIn: "1h" },
      );

      const existingUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      if (!existingUser) {
        console.log("User not found in the database, creating new user...");
      }

      // Redirect to the frontend with the token
      res.redirect(`http://localhost:3000/auth?token=${signedToken}`);
    },
  )(req, res);
};
//update passss
export const updatePassword = async (req, res) => {
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
      where: { id: userId },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
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
      message: "Password updated successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
      },
    });
  } catch (error) {
    console.error("Error updating password:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        avatar: true,
        deleted_at: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Idempotency: if already deleted, treat as success
    if (existingUser.deleted_at) {
      return res.status(200).json({
        success: true,
        message: "User already deleted",
      });
    }

    const deletedAt = new Date();
    const anonymizedEmail = `deleted+${userId}@example.invalid`;

    // Soft-delete user and clean up dependent records to avoid FK issues.
    await prisma.$transaction(async (tx) => {
      // Notifications (either direction)
      await tx.notification.updateMany({
        where: {
          deleted_at: null,
          OR: [{ sender_id: userId }, { receiver_id: userId }],
        },
        data: { deleted_at: deletedAt },
      });

      // Downloads
      await tx.download.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: deletedAt, status: "cancelled" },
      });

      // Storage quota
      await tx.userStorageQuota.deleteMany({
        where: { user_id: userId },
      });

      // Favourites (no deleted_at in schema)
      await tx.favourite.deleteMany({
        where: { user_id: userId },
      });

      // Ratings
      await tx.rating.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: deletedAt },
      });

      // Help & Support
      await tx.helpSupport.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: deletedAt },
      });

      // User settings / payment methods
      await tx.userSetting.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: deletedAt },
      });
      await tx.userPaymentMethod.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: deletedAt },
      });

      // Payment transactions
      await tx.paymentTransaction.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: deletedAt },
      });

      // Orders (no deleted_at)
      await tx.order.updateMany({
        where: { user_id: userId },
        data: { status: "inactive", order_status: "canceled" },
      });

      // Subscriptions (no deleted_at)
      await tx.subscription.updateMany({
        where: { user_id: userId },
        data: {
          status: "deactivated",
          plan: "No_plan",
          end_date: deletedAt,
          renewal_date: null,
        },
      });

      // Finally, soft-delete the user + remove PII to allow re-registration.
      await tx.user.update({
        where: { id: userId },
        data: {
          deleted_at: deletedAt,
          status: "deactivated",
          email: anonymizedEmail,
          password: null,
          name: null,
          avatar: null,
        },
      });
    });

    // Best-effort remove avatar from storage (do not fail deletion if this fails)
    try {
      const bucket = process.env.AWS_S3_BUCKET;
      const oldAvatar = existingUser.avatar;

      if (oldAvatar && typeof oldAvatar === "string") {
        // Legacy local filename
        if (!oldAvatar.includes("/") && !/^https?:\/\//i.test(oldAvatar)) {
          const oldImagePath = path.join(__dirname, "../../uploads", oldAvatar);
          if (fs.existsSync(oldImagePath)) {
            try {
              fs.unlinkSync(oldImagePath);
            } catch {
              // ignore
            }
          }
        }

        // S3 key (we store key in DB)
        if (bucket && oldAvatar.includes("/")) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: oldAvatar,
            }),
          );
        }
      }
    } catch (cleanupErr) {
      console.warn("[deleteUser] avatar cleanup failed:", cleanupErr);
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res

      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// device menagement routes
export const getUserDevices = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const devices = await prisma.deviceToken.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        token: true,
        device_os: true,
        device_type: true,
        device_name: true,
        created_at: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "User devices retrieved successfully",
      data: devices,
    });
  } catch (error) {
    console.error("Error retrieving user devices:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const removeUserDevice = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const device = await prisma.deviceToken.findUnique({
      where: { id: deviceId },
    });

    if (!device || device.user_id !== userId) {
      return res.status(404).json({ message: "Device not found" });
    }

    await prisma.deviceToken.delete({
      where: { id: deviceId },
    });

    return res.status(200).json({
      success: true,
      message: "Device removed successfully",
    });
  } catch (error) {
    console.error("Error removing user device:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
