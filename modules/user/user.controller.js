require("dotenv").config();
const { isEmail } = require("validator");
const bcrypt = require("bcryptjs");
const { sign } = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { prisma } = require('../prisma/prisma');

const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");
const e = require("express");




const generateToken = (id, email) => {
    return sign({ userId: id, email, role }, process.env.WEBTOKEN_SECRET_KEY, {
      expiresIn: "1d",
    });
  };

  //password hasing
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(8);
    return await bcrypt.hash(password, salt);
  };

const setTokenCookie = (res, token) => {
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  };

const registerUser = async (req, res) => {
    try {
      let { name, email, password } = req.body;
  
      if (!(name && email && password)) {
        return res.status(400).json({ message: "Please fill all required fields" });
      }
  
      name = name.replace(/\s+/g, " ").trim();
  
      if (!isEmail(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
  
      if (email === name) {
        return res.status(400).json({ message: "Email cannot be the same as your name" });
      }
  
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be longer than 6 characters" });
      }
  
      if (password === name || password === email) {
        return res.status(400).json({ message: "Password cannot be the same as your name or email" });
      }
  
      // Check if user exists in DB
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });
  
      if (existingUser) {
        return res.status(400).json({
          message: "Email is already registered. Please log in."
        });
      }
  
      // Hash password
      const hashedPassword = await hashPassword(password);
  
      // Get country from IP
    //   let country = "Unknown";
    //   try {
    //     const response = await fetch("http://get.geojs.io/v1/ip/geo.json");
    //     if (response.ok) {
    //       const data = await response.json();
    //       country = data.country || "Unknown";
    //     }
    //   } catch (error) {
    //     console.error("Error fetching IP-based location:", error.message);
    //   }
  
      // Create Stripe customer
    //   const customer = await stripe.customers.create({
    //     email,
    //     name
    //   });
  
      // Save user in DB via Prisma
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
        }
      });
  
      // Generate OTP
    //   const otp = generateOTP();
  
    //   // Store OTP in session
    //   req.session.forgotPasswordData = {
    //     otp: otp.toString(),
    //     email: newUser.email,
    //     timestamp: Date.now()
    //   };
  
   
  
    //   if (newUser.name) {
    //     await sendForgotPasswordOTP(newUser.name, newUser.email, otp);
    //   }
  
      return res.status(200).json({
        message: "successfully registerd",
        // debug: process.env.NODE_ENV === 'development' ? { otp } : undefined
      });
  
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };


const verifyEmail = async (req, res) => {

    try {
      const { token } = req.params;
      const decoded = verify(token, process.env.WEBTOKEN_SECRET_KEY);
  
      const user = await User.findOne({ email: decoded.email });
      if (!user) return res.status(400).json({ message: "Invalid token" });
  
      user.isVerified = true;
      await user.save();
      setTokenCookie(res, token);
  
      res.status(200).json({ message: "Email verified successfully!" });
    } catch (error) {
      res.status(400).json({ message: "Invalid or expired token" });
    }
  };

const login = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Please fill all required fields" });
      }
  
      const user = await User.findOne({ email });
  
      if (!user) {
        return res.status(400).json({ message: "User not found!" });
      }
      //if (!user.isVerified) return res.status(403).json({ message: "Please verify your email before logging in." });
  
      // if (user.blacklist && new Date() > new Date(user.subscriptionEndDAte)) {
      //   return res.status(400).json({ message: "You are in blacklist!!" });
      // }
  
  
      if (user.isVerified === false) {
        return res.status(403).json({ message: "Please verify your email before logging in." });
      }
  
      const passwordMatch = await bcrypt.compare(password, user.password);
  
      if (!passwordMatch) {
        return res.status(400).json({ message: "Invalid email or password" });
      }
  
      const token = sign(
        { userEmail: user.email, userId: user._id, role: user.role },
        process.env.WEBTOKEN_SECRET_KEY,
        { expiresIn: "1d" }
      );
  
      const options = {
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: true,
      };
  
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.newpassword;
      delete userResponse.confirmPassword;
  
      return res
        .status(200)
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "None",
  
        })
        .json({ message: "Login successful", user: userResponse, token });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  };

  const updateUser = async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }
  
      const updateData = { ...req.body };
  
      // Handle avatar if uploaded
      if (req.files && req.files.avatar) {
        const avatarFile = req.files.avatar[0];
        if (user.avatar) {
          deleteImage(user.avatar);
        }
        updateData.avatar = avatarFile.filename;
      }
  
      // Handle lawnphoto if uploaded
      if (req.files && req.files.lawnphoto) {
        const lawnphotoFile = req.files.lawnphoto[0];
        if (user.lawnphoto) {
          deleteImage(user.lawnphoto);
        }
        updateData.lawnphoto = lawnphotoFile.filename;
      }
  
      const updatedUser = await User.findByIdAndUpdate(
        req.params.userId,
        updateData,
        { new: true }
      );
  
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
  
      return res.status(200).json(updatedUser);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  module.exports = { generateToken, registerUser };